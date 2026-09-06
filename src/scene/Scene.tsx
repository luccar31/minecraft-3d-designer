import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { addAfterEffect, addEffect, Canvas, useThree, type ThreeEvent } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import { useEditor } from '../state/store'
import { getAtlasTexture } from '../blocks/atlas'
import { Chunks } from './Chunks'
import { AnchorMarker, GhostSlice, GridBounds, Preview, SelectionBox, SlicePlane } from './Overlays'
import {
  initialState, step,
  type Cell, type Ctx, type Input, type Mode, type Mods, type Output,
} from './gesture'
import { resolveCell, type Hit, type HitKind, type Resolution } from './picking'
import { spaceDown, spaceUp, type SpaceState } from './modeKeys'
import { consumeCameraMoved, markCameraMoved } from './cameraActivity'
import { worldToPlane } from '../voxel/ops'
import {
  attachRenderer, beginGesture, endGesture, EV, packMods, rec, startFrames, str,
  touchClock, watchCanvas,
} from '../debug'

const NORMAL_MATRIX = new THREE.Matrix3()

/** Minimum fit radius: a tiny build used to put the camera inside a block. */
const MIN_FIT_RADIUS = 4

function worldNormal(e: ThreeEvent<PointerEvent>): THREE.Vector3 {
  if (!e.face) return new THREE.Vector3(0, 1, 0)
  return e.face.normal
    .clone()
    .applyNormalMatrix(NORMAL_MATRIX.getNormalMatrix(e.object.matrixWorld))
    .normalize()
}

const modsOf = (e: {
  shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean
}): Mods => ({ shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey, meta: e.metaKey })

const previewKeyOf = (res: Resolution | null) =>
  res && res.valid && res.chosen
    ? `${res.action}|${res.chosen.x},${res.chosen.y},${res.chosen.z}|` +
      `${res.face ? `${res.face.normal.x},${res.face.normal.y},${res.face.normal.z}` : ''}`
    : ''

/** Fits the camera to the build, or the grid if empty. */
function ViewFitter() {
  const { camera } = useThree()
  const controls = useThree((s) => s.controls) as
    | { target: THREE.Vector3; update: () => void }
    | null
  const fitRequest = useEditor((s) => s.fitRequest)
  const world = useEditor((s) => s.world)
  const dims = world.dims

  // Declared before the fit so a fit that lands on the same commit wins.
  useEffect(() => {
    if (!controls) return
    controls.target.set(dims.x / 2, dims.y / 4, dims.z / 2)
    controls.update()
  }, [controls, dims.x, dims.y, dims.z])

  useEffect(() => {
    if (fitRequest === 0 || !controls) return
    const b = world.bounds()
    const min = b ? new THREE.Vector3(...b.min) : new THREE.Vector3(0, 0, 0)
    const max = b
      ? new THREE.Vector3(b.max[0] + 1, b.max[1] + 1, b.max[2] + 1)
      : new THREE.Vector3(world.dims.x, world.dims.y, world.dims.z)
    const center = min.clone().add(max).multiplyScalar(0.5)
    const radius = Math.max(MIN_FIT_RADIUS, max.clone().sub(min).length() / 2)
    const cam = camera as THREE.PerspectiveCamera
    const dist = (radius / Math.sin((cam.fov * Math.PI) / 360)) * 1.05
    const dir = new THREE.Vector3(0.72, 0.58, 0.9).normalize()
    cam.position.copy(center).addScaledVector(dir, dist)
    controls.target.copy(center)
    controls.update()
    rec(EV.cameraFit, radius, dist, world.size)
  }, [fitRequest, camera, controls, world])

  return null
}

function Editor({ clearRef }: { clearRef: React.MutableRefObject<() => void> }) {
  const store = useEditor()
  const { camera, gl } = useThree()
  const controls = useThree((s) => s.controls) as { enabled: boolean } | null
  const canvasEl = gl.domElement

  const atlas = useMemo(() => getAtlasTexture(), [])

  const materials = useMemo(() => {
    const opaqueMat = new THREE.MeshLambertMaterial({ map: atlas, vertexColors: true })
    const transMat = new THREE.MeshLambertMaterial({
      map: atlas,
      vertexColors: true,
      transparent: true,
      alphaTest: 0.3,
      side: THREE.DoubleSide,
    })
    return { opaqueMat, transMat }
  }, [atlas])

  useEffect(() => () => {
    materials.opaqueMat.dispose()
    materials.transMat.dispose()
  }, [materials])

  // Clipping planes: gives layer/slice mode without duplicating geometry.
  useEffect(() => {
    const { sliceView, sliceAxis, sliceIndex } = store
    const axisVec =
      sliceAxis === 'x' ? [1, 0, 0] : sliceAxis === 'y' ? [0, 1, 0] : [0, 0, 1]
    const planes: THREE.Plane[] = []
    if (sliceView !== 'off') {
      planes.push(
        new THREE.Plane(new THREE.Vector3(-axisVec[0], -axisVec[1], -axisVec[2]), sliceIndex + 1),
      )
    }
    if (sliceView === 'isolate') {
      planes.push(
        new THREE.Plane(new THREE.Vector3(axisVec[0], axisVec[1], axisVec[2]), -sliceIndex),
      )
    }
    materials.opaqueMat.clippingPlanes = planes
    materials.transMat.clippingPlanes = planes
    materials.opaqueMat.needsUpdate = true
    materials.transMat.needsUpdate = true
  }, [materials, store.sliceView, store.sliceAxis, store.sliceIndex])

  const sliceMode = store.sliceView !== 'off'

  /* ── interaction mode ───────────────────────────────────────────────── */

  const [mode, setModeState] = useState<Mode>('build')
  const modeRef = useRef<Mode>('build')
  const spaceRef = useRef<SpaceState | null>(null)

  const setMode = useCallback((next: Mode, reason: string) => {
    if (modeRef.current === next) return
    rec(EV.mode, str(modeRef.current), str(next), str(reason))
    modeRef.current = next
    setModeState(next)
    useEditor.getState().setStatus(
      next === 'navigate'
        ? 'Modo Navegar: arrastrar mueve la cámara'
        : 'Modo Construir: arrastrar pinta',
    )
  }, [])

  useEffect(() => {
    canvasEl.style.cursor = mode === 'navigate' ? 'grab' : 'crosshair'
  }, [canvasEl, mode])

  /* ── drawing gesture ────────────────────────────────────────────────── */

  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const gesture = useRef(initialState)
  const pendingRes = useRef<Resolution | null>(null)
  const lastHit = useRef<Hit | null>(null)
  const dragPlane = useRef<THREE.Plane | null>(null)
  const dragNormal = useRef(new THREE.Vector3(0, 1, 0))
  const dragKind = useRef<HitKind>('block')
  const dragMods = useRef<Mods>({ shift: false, alt: false, ctrl: false, meta: false })
  const startX = useRef(0)
  const startY = useRef(0)
  const startAt = useRef(0)
  const lastX = useRef(0)
  const lastY = useRef(0)
  const cellsWritten = useRef(0)

  const [preview, setPreview] = useState<Resolution | null>(null)
  const previewKey = useRef('')

  const clearTimer = useRef(0)

  const showPreview = useCallback((res: Resolution | null, source: string) => {
    cancelAnimationFrame(clearTimer.current)
    const key = previewKeyOf(res)
    if (key === previewKey.current) return
    previewKey.current = key
    setPreview(res)
    const cell = res && res.valid ? res.chosen : null
    if (cell) rec(EV.hover, cell.x, cell.y, cell.z, str(source))
    else rec(EV.hoverNone)
    rec(
      EV.preview,
      cell?.x ?? NaN, cell?.y ?? NaN, cell?.z ?? NaN,
      str(res?.action ?? 'none'), res?.valid ? 1 : 0,
    )
    useEditor.getState().setHover(cell)
  }, [])

  const hitFrom = useCallback((e: ThreeEvent<PointerEvent>): Hit => {
    const name = e.object.name
    const kind: HitKind =
      name === 'build-plate' ? 'plate' : name === 'slice-plane' ? 'slice' : 'block'
    const n = worldNormal(e)
    return {
      kind,
      point: { x: e.point.x, y: e.point.y, z: e.point.z },
      normal: { x: n.x, y: n.y, z: n.z },
    }
  }, [])

  const resolve = useCallback((hit: Hit, mods: Mods): Resolution => {
    const s = useEditor.getState()
    const res = resolveCell(hit, mods, s.tool, s.world.dims)
    pendingRes.current = res
    // Logging both candidates is what exposed the cursor/edit mismatch.
    rec(
      EV.rayCell,
      res.target?.x ?? NaN, res.target?.y ?? NaN, res.target?.z ?? NaN,
      res.placement?.x ?? NaN, res.placement?.y ?? NaN, res.placement?.z ?? NaN,
    )
    return res
  }, [])

  const applyOut = useCallback((out: Output) => {
    const s = useEditor.getState()
    const ms = performance.now() - startAt.current
    const dist = Math.hypot(lastX.current - startX.current, lastY.current - startY.current)

    if (controls && controls.enabled !== out.orbitEnabled) {
      controls.enabled = out.orbitEnabled
      rec(EV.orbitEnabled, out.orbitEnabled ? 1 : 0, str(out.phase))
    }
    if (out.capture !== undefined) {
      try {
        canvasEl.setPointerCapture(out.capture)
        rec(EV.pointerCapture, out.capture, 1)
      } catch {
        rec(EV.pointerCapture, out.capture, 0)
      }
    }
    if (out.release !== undefined) {
      try {
        canvasEl.releasePointerCapture(out.release)
      } catch {
        /* already released by the browser */
      }
    }
    if (out.openStroke) s.beginStroke()
    if (out.commit?.length) {
      const res = pendingRes.current
      const erase = res?.action === 'erase'
      if (res?.action === 'pick') {
        s.pickAt(out.commit[0])
      } else if (s.sliceView !== 'off') {
        // Layer mode goes through `planeAction`: it owns the anchors of line,
        // rect and select, and the flood of fill.
        for (const c of out.commit) s.planeAction(worldToPlane(s.sliceAxis, c), erase)
      } else {
        s.applyCells(out.commit.map((c) => ({ p: c, id: erase ? undefined : s.block })))
      }
      cellsWritten.current += out.commit.length
    }
    if (out.closeStroke) s.endStroke()
    // Once the gesture belongs to the camera the cursor is a lie: the ray is
    // no longer where the pointer is.
    if (out.phase === 'navigating') showPreview(null, 'camera')
    if (out.classified) rec(EV.gestureClassified, str(out.classified), dist, ms)
    if (out.aborted) rec(EV.gestureAborted, str(out.aborted), ms)
    if (out.phase === 'idle' && (out.classified || out.aborted)) {
      rec(EV.gestureEnd, str(out.classified ?? 'aborted'), ms, cellsWritten.current, dist)
      cellsWritten.current = 0
    }
  }, [canvasEl, controls, showPreview])

  const feed = useCallback((input: Input) => {
    if (input.kind === 'down' || input.kind === 'move' || input.kind === 'up') {
      lastX.current = input.x
      lastY.current = input.y
    }
    const s = useEditor.getState()
    const ctx: Ctx = {
      mode: modeRef.current,
      dragTool: s.tool === 'brush' || s.tool === 'eraser',
    }
    const { state, out } = step(gesture.current, input, ctx)
    gesture.current = state
    applyOut(out)
  }, [applyOut])

  const rayPointOnDragPlane = useCallback(
    (ev: PointerEvent): THREE.Vector3 | null => {
      const plane = dragPlane.current
      if (!plane) return null
      const rect = canvasEl.getBoundingClientRect()
      const ndc = new THREE.Vector2(
        ((ev.clientX - rect.left) / rect.width) * 2 - 1,
        -((ev.clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(ndc, camera)
      const hit = new THREE.Vector3()
      return raycaster.ray.intersectPlane(plane, hit) ? hit : null
    },
    [camera, canvasEl, raycaster],
  )

  const onDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      touchClock()
      e.stopPropagation()
      const hit = hitFrom(e)
      lastHit.current = hit
      const mods = modsOf(e)
      const res = resolve(hit, mods)
      showPreview(res, hit.kind)

      beginGesture()
      const typeId = str(e.pointerType || 'mouse')
      rec(EV.pointerDown, typeId, e.clientX, e.clientY, e.button, packMods(e),
        e.intersections?.length ?? NaN)
      rec(EV.ray, str(e.object.name || e.object.type), e.point.x, e.point.y, e.point.z,
        e.distance ?? NaN, e.intersections?.length ?? NaN)
      rec(EV.gestureStart, typeId, str(res.action), packMods(e))

      // The drag plane freezes at pointerdown: during the stroke there is no
      // raycast against the scene, only against this plane.
      dragKind.current = hit.kind
      dragMods.current = mods
      dragNormal.current.set(hit.normal.x, hit.normal.y, hit.normal.z)
      dragPlane.current = new THREE.Plane().setFromNormalAndCoplanarPoint(
        dragNormal.current, e.point,
      )
      startX.current = e.clientX
      startY.current = e.clientY
      startAt.current = performance.now()
      cellsWritten.current = 0

      feed({
        kind: 'down',
        pointerId: e.pointerId,
        pointerType: e.pointerType || 'mouse',
        button: e.button,
        x: e.clientX,
        y: e.clientY,
        cell: res.valid ? res.chosen : null,
        mods,
      })
    },
    [feed, hitFrom, resolve, showPreview],
  )

  const onHover = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      touchClock()
      // Without this R3F fires per intersected object and the farthest wins,
      // which is why the cursor disagreed with the edit.
      e.stopPropagation()
      if (gesture.current.phase !== 'idle') return
      const hit = hitFrom(e)
      lastHit.current = hit
      showPreview(resolve(hit, modsOf(e)), hit.kind)
    },
    [hitFrom, resolve, showPreview],
  )

  const clearHover = useCallback(() => {
    // Stopping propagation makes R3F report `pointerout` for every object the
    // ray skipped; only a frame with no new hover means the pointer left.
    cancelAnimationFrame(clearTimer.current)
    clearTimer.current = requestAnimationFrame(() => {
      lastHit.current = null
      pendingRes.current = null
      showPreview(null, 'none')
    })
  }, [showPreview])

  useEffect(() => {
    clearRef.current = clearHover
    return () => cancelAnimationFrame(clearTimer.current)
  }, [clearHover, clearRef])

  useEffect(() => {
    const onMove = (ev: PointerEvent) => {
      touchClock()
      if (gesture.current.phase === 'idle') return
      rec(EV.pointerMove, ev.clientX, ev.clientY,
        Math.hypot(ev.clientX - startX.current, ev.clientY - startY.current),
        performance.now() - startAt.current)
      // While the camera owns the gesture there is no cell to resolve.
      const p = gesture.current.phase === 'navigating' ? null : rayPointOnDragPlane(ev)
      let cell: Cell | null = null
      if (p) {
        const n = dragNormal.current
        const res = resolve(
          { kind: dragKind.current, point: { x: p.x, y: p.y, z: p.z },
            normal: { x: n.x, y: n.y, z: n.z } },
          dragMods.current,
        )
        cell = res.valid ? res.chosen : null
        if (gesture.current.phase === 'painting') showPreview(res, dragKind.current)
      }
      feed({ kind: 'move', x: ev.clientX, y: ev.clientY, cell })
    }
    const onUp = (ev: PointerEvent) => {
      touchClock()
      if (gesture.current.phase === 'idle') return
      rec(EV.pointerUp, ev.clientX, ev.clientY,
        Math.hypot(ev.clientX - startX.current, ev.clientY - startY.current),
        performance.now() - startAt.current)
      feed({ kind: 'up', x: ev.clientX, y: ev.clientY })
      endGesture()
    }
    const abort = (kind: 'cancel' | 'lostCapture' | 'blur') => () => {
      if (gesture.current.phase === 'idle') return
      touchClock()
      feed({ kind })
      endGesture()
    }
    const onCancel = (ev: PointerEvent) => {
      if (gesture.current.phase === 'idle') return
      rec(EV.pointerCancel, str(ev.pointerType || 'mouse'),
        performance.now() - startAt.current)
      abort('cancel')()
    }
    const onLost = abort('lostCapture')
    const onBlur = abort('blur')

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('blur', onBlur)
    canvasEl.addEventListener('lostpointercapture', onLost)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('blur', onBlur)
      canvasEl.removeEventListener('lostpointercapture', onLost)
      if (gesture.current.phase !== 'idle') feed({ kind: 'unmount' })
    }
  }, [canvasEl, feed, rayPointOnDragPlane, resolve, showPreview])

  /* ── modifiers and mode keys ────────────────────────────────────────── */

  useEffect(() => {
    const FOCUSABLE = ['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT', 'A']
    const typing = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      return Boolean(el && (FOCUSABLE.includes(el.tagName) || el.isContentEditable))
    }
    // Holding Shift without moving the mouse has to repaint the cursor red.
    const recomputePreview = (e: KeyboardEvent) => {
      if (e.key !== 'Shift' && e.key !== 'Alt') return
      const hit = lastHit.current
      if (!hit || gesture.current.phase !== 'idle') return
      showPreview(resolve(hit, modsOf(e)), hit.kind)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && !typing(e)) {
        e.preventDefault()
        const r = spaceDown(modeRef.current, performance.now())
        spaceRef.current = r.state
        setMode(r.mode, 'space-down')
        return
      }
      recomputePreview(e)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && spaceRef.current) {
        const r = spaceUp(spaceRef.current, performance.now(), consumeCameraMoved())
        spaceRef.current = null
        setMode(r.mode, 'space-up')
        return
      }
      recomputePreview(e)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [resolve, setMode, showPreview])

  const dims = store.world.dims

  return (
    <>
      <hemisphereLight args={['#ffffff', '#4a5568', 1.05]} />
      <directionalLight position={[dims.x * 0.8, dims.y * 2 + 20, dims.z * 1.2]} intensity={1.15} />
      <directionalLight position={[-dims.x, dims.y, -dims.z]} intensity={0.35} />

      <group onPointerDown={onDown} onPointerMove={onHover} onPointerOut={clearHover}>
        <Chunks
          world={store.world}
          opaqueMat={materials.opaqueMat}
          transMat={materials.transMat}
          pickable={!sliceMode}
        />
        {!sliceMode && (
          <mesh
            name="build-plate"
            position={[dims.x / 2, 0, dims.z / 2]}
            rotation={[-Math.PI / 2, 0, 0]}
            receiveShadow
          >
            <planeGeometry args={[dims.x, dims.z]} />
            <meshLambertMaterial color="#2c3440" />
          </mesh>
        )}
        {sliceMode && (
          <SlicePlane
            axis={store.sliceAxis}
            index={store.sliceIndex}
            dims={dims}
            onDown={onDown}
            onMove={onHover}
            onLeave={clearHover}
          />
        )}
      </group>

      {sliceMode && store.sliceView === 'isolate' && (
        <GhostSlice world={store.world} axis={store.sliceAxis} index={store.sliceIndex} dims={dims} />
      )}

      {store.showGrid && (
        <>
          <GridBounds dims={dims} />
          <gridHelper
            args={[Math.max(dims.x, dims.z), Math.max(dims.x, dims.z), '#4c5666', '#39414e']}
            position={[dims.x / 2, 0.01, dims.z / 2]}
          />
        </>
      )}

      <Preview res={mode === 'navigate' ? null : preview} blockId={store.block} />
      <SelectionBox sel={store.selection} />
      <AnchorMarker anchor={store.anchor} axis={store.sliceAxis} index={store.sliceIndex} />
    </>
  )
}

export function Scene() {
  const dims = useEditor((s) => s.world.dims)
  const cancel = useEditor((s) => s.cancelAnchor)
  const orbitRef = useRef<OrbitControlsImpl>(null)
  const clearRef = useRef<() => void>(() => {})
  const center: [number, number, number] = [dims.x / 2, dims.y / 4, dims.z / 2]
  const dist = Math.max(dims.x, dims.z) * 1.15 + 8

  return (
    <Canvas
      shadows={false}
      dpr={[1, 2]}
      camera={{ position: [center[0] + dist * 0.7, dims.y + dist * 0.5, center[2] + dist * 0.8], fov: 48, far: 4000 }}
      onCreated={({ gl }) => {
        gl.localClippingEnabled = true
        attachRenderer(gl)
        watchCanvas(gl.domElement)
        // Hooks r3f's loop: the only point where `renderer.info` matches the
        // current frame.
        startFrames(addEffect, addAfterEffect)
      }}
      onPointerMissed={(e) => {
        rec(EV.pointerNoTarget, (e as PointerEvent).clientX, (e as PointerEvent).clientY)
        // Orbiting can leave the geometry without ever firing `pointerout`,
        // which is how the cursor stayed floating in the void.
        clearRef.current()
        cancel()
      }}
      onContextMenu={(e) => e.preventDefault()}
      data-testid="scene-canvas"
    >
      <color attach="background" args={['#1a1f27']} />
      <fog attach="fog" args={['#1a1f27', dist * 2.2, dist * 6]} />
      <Editor clearRef={clearRef} />
      <ViewFitter />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.12}
        maxDistance={2200}
        minDistance={2}
        ref={orbitRef}
        mouseButtons={{
          LEFT: THREE.MOUSE.ROTATE,
          MIDDLE: THREE.MOUSE.ROTATE,
          RIGHT: THREE.MOUSE.PAN,
        }}
        onStart={() => {
          markCameraMoved()
          rec(EV.orbitStart)
        }}
        onEnd={() => rec(EV.orbitEnd)}
        onChange={() => {
          // `change` payload only has `{type, target}`, and target is nulled
          // after dispatch; read from ref.
          const c = orbitRef.current
          if (!c) return
          const p = c.object.position
          const t = c.target
          rec(EV.cameraPose, p.x, p.y, p.z, t.x, t.y, t.z)
        }}
      />
    </Canvas>
  )
}
