import { useCallback, useEffect, useMemo, useRef } from 'react'
import { addAfterEffect, addEffect, Canvas, useThree, type ThreeEvent } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import { useEditor } from '../state/store'
import { getAtlasTexture } from '../blocks/atlas'
import { Chunks } from './Chunks'
import { AnchorMarker, Cursor, GhostSlice, GridBounds, SelectionBox, SlicePlane } from './Overlays'
import { worldToPlane } from '../voxel/ops'
import {
  initialState, step,
  type Cell, type Ctx, type GestureState, type Input, type Mods, type Output,
} from './gesture'
import { resolveCell, type Hit, type HitKind, type Resolution } from './picking'
import {
  attachRenderer, beginGesture, endGesture, EV, packMods, rec, startFrames, str,
  touchClock, watchCanvas,
} from '../debug'

const NORMAL_MATRIX = new THREE.Matrix3()
const NO_MODS: Mods = { shift: false, alt: false, ctrl: false, meta: false }

function worldNormal(e: ThreeEvent<PointerEvent>): THREE.Vector3 {
  if (!e.face) return new THREE.Vector3(0, 1, 0)
  return e.face.normal
    .clone()
    .applyNormalMatrix(NORMAL_MATRIX.getNormalMatrix(e.object.matrixWorld))
    .normalize()
}

/** Fits the camera to the build, or the grid if empty. */
function ViewFitter() {
  const { camera } = useThree()
  const controls = useThree((s) => s.controls) as
    | { target: THREE.Vector3; update: () => void }
    | null
  const fitRequest = useEditor((s) => s.fitRequest)
  const world = useEditor((s) => s.world)

  useEffect(() => {
    if (fitRequest === 0 || !controls) return
    const b = world.bounds()
    const min = b ? new THREE.Vector3(...b.min) : new THREE.Vector3(0, 0, 0)
    const max = b
      ? new THREE.Vector3(b.max[0] + 1, b.max[1] + 1, b.max[2] + 1)
      : new THREE.Vector3(world.dims.x, world.dims.y, world.dims.z)
    const center = min.clone().add(max).multiplyScalar(0.5)
    const radius = max.clone().sub(min).length() / 2 || 8
    const cam = camera as THREE.PerspectiveCamera
    const dist = (radius / Math.sin((cam.fov * Math.PI) / 360)) * 1.05
    const dir = new THREE.Vector3(0.72, 0.58, 0.9).normalize()
    cam.position.copy(center).addScaledVector(dir, dist)
    controls.target.copy(center)
    controls.update()
  }, [fitRequest, camera, controls, world])

  return null
}

function Editor() {
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

  /* ── gesture: R3F pointer events → pure state machine → store ─────────── */

  const raycaster = useMemo(() => new THREE.Raycaster(), [])

  const gesture = useRef<GestureState>(initialState)
  /** Last cell resolution, from either the hover ray or the drag plane. */
  const pendingRes = useRef<Resolution | null>(null)
  const lastHit = useRef<Hit | null>(null)
  const dragPlane = useRef<THREE.Plane | null>(null)
  const dragNormal = useRef(new THREE.Vector3(0, 1, 0))
  /** Frozen at pointerdown: releasing Shift mid-drag must not change the action. */
  const dragMods = useRef<Mods>(NO_MODS)
  /** Frozen too: a plate or slice hit stays that kind for the whole drag. */
  const dragKind = useRef<HitKind>('block')
  const downPos = useRef({ x: 0, y: 0 })
  const gestureT0 = useRef(0)
  const gestureCells = useRef(0)
  const lastOrbit = useRef(true)

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

  const modsOf = (e: { shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean }): Mods =>
    ({ shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey, meta: e.metaKey })

  const ctxNow = (): Ctx => {
    const s = useEditor.getState()
    return { mode: s.mode, dragTool: s.tool === 'brush' || s.tool === 'eraser' }
  }

  /** Distance from the pointerdown that opened the current gesture, for telemetry. */
  const distFromDown = (input: Input): number =>
    'x' in input ? Math.hypot(input.x - downPos.current.x, input.y - downPos.current.y) : NaN

  const apply = useCallback((out: Output, input: Input) => {
    const s = useEditor.getState()
    // OrbitControls reads the canvas directly, outside R3F: this has to run
    // on every output, `false` included, or the camera drifts mid-gesture.
    if (controls) controls.enabled = out.orbitEnabled
    if (out.orbitEnabled !== lastOrbit.current) {
      lastOrbit.current = out.orbitEnabled
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
        // Already released.
      }
    }
    if (out.openStroke) s.beginStroke()
    if (out.commit?.length) {
      gestureCells.current += out.commit.length
      const action = pendingRes.current?.action
      if (action === 'pick') {
        s.pickAt(out.commit[0])
      } else if (s.sliceView !== 'off') {
        // The slice plane is 2D: route through the same tool dispatch the
        // click path uses, instead of writing cells directly.
        const erase = action === 'erase'
        for (const cell of out.commit) s.planeAction(worldToPlane(s.sliceAxis, cell), erase)
      } else {
        const erase = action === 'erase'
        s.applyCells(out.commit.map((cell) => ({ p: cell, id: erase ? undefined : s.block })))
      }
    }
    if (out.closeStroke) s.endStroke()
    if (out.classified) {
      const ms = performance.now() - gestureT0.current
      const dist = distFromDown(input)
      if (out.phase === 'idle') rec(EV.gestureEnd, str(out.classified), ms, gestureCells.current, dist)
      else rec(EV.gestureClassified, str(out.classified), dist, ms)
    }
    if (out.aborted) rec(EV.gestureAborted, str(out.aborted), performance.now() - gestureT0.current)
  }, [controls, canvasEl])

  const feed = useCallback((input: Input) => {
    const { state, out } = step(gesture.current, input, ctxNow())
    gesture.current = state
    apply(out, input)
  }, [apply])

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

  /**
   * The pointer is captured during a drag, so later positions come from a
   * synthetic hit on the frozen plane, resolved through the same
   * `resolveCell` as a click so both agree on the cell.
   */
  const cellFromDragPlane = useCallback((p: THREE.Vector3): Cell | null => {
    const s = useEditor.getState()
    const n = dragNormal.current
    const hit: Hit = {
      kind: dragKind.current,
      point: { x: p.x, y: p.y, z: p.z },
      normal: { x: n.x, y: n.y, z: n.z },
    }
    const res = resolveCell(hit, dragMods.current, s.tool, s.world.dims)
    pendingRes.current = res
    return res.valid ? res.chosen : null
  }, [])

  const onDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    touchClock()
    e.stopPropagation()
    const s = useEditor.getState()
    const hit = hitFrom(e)
    const mods = modsOf(e)
    const res = resolveCell(hit, mods, s.tool, s.world.dims)
    pendingRes.current = res
    lastHit.current = hit
    dragMods.current = mods
    dragKind.current = hit.kind
    dragNormal.current.set(hit.normal.x, hit.normal.y, hit.normal.z)
    dragPlane.current = new THREE.Plane().setFromNormalAndCoplanarPoint(dragNormal.current, e.point)

    beginGesture()
    downPos.current = { x: e.clientX, y: e.clientY }
    gestureT0.current = performance.now()
    gestureCells.current = 0

    rec(EV.pointerDown, str(e.pointerType || 'mouse'), e.clientX, e.clientY, e.button,
      packMods(e), e.intersections?.length ?? NaN)
    // Ray hit and distance explain why preview and edit can resolve to
    // different cells.
    rec(EV.ray, str(hit.kind), e.point.x, e.point.y, e.point.z, e.distance ?? NaN,
      e.intersections?.length ?? NaN)
    // Both candidate cells: comparing chosen vs. the drawn cursor exposes
    // off-by-one bugs.
    rec(EV.rayCell,
      res.target?.x ?? NaN, res.target?.y ?? NaN, res.target?.z ?? NaN,
      res.placement?.x ?? NaN, res.placement?.y ?? NaN, res.placement?.z ?? NaN)
    rec(EV.gestureStart, str(e.pointerType || 'mouse'), str(res.action), packMods(e))

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
  }, [feed, hitFrom])

  const onHover = useCallback((e: ThreeEvent<PointerEvent>) => {
    touchClock()
    e.stopPropagation() // without this R3F fires it for every object the ray crosses
    // Mid-gesture the cell comes from the frozen drag plane, not a fresh ray;
    // R3F still raycasts while the pointer is captured, so this would else
    // fight the drag's own resolution and make the cursor jump.
    if (gesture.current.phase !== 'idle') return
    const s = useEditor.getState()
    const hit = hitFrom(e)
    const res = resolveCell(hit, modsOf(e), s.tool, s.world.dims)
    pendingRes.current = res
    lastHit.current = hit
    if (res.valid && res.chosen) {
      rec(EV.hover, res.chosen.x, res.chosen.y, res.chosen.z, str(hit.kind))
      s.setHover(res.chosen)
    } else {
      rec(EV.hoverNone)
      s.setHover(null)
    }
  }, [hitFrom])

  const clearHover = useCallback(() => {
    rec(EV.hoverNone)
    useEditor.getState().setHover(null)
  }, [])

  // Registered once: attaching them inside onDown, like the old code did,
  // accumulated a new set of listeners on every click.
  useEffect(() => {
    const onMove = (ev: PointerEvent) => {
      touchClock()
      // Otherwise every orbit frame raycasts and overwrites pendingRes,
      // making the preview jump while the camera moves.
      if (gesture.current.phase !== 'pending' && gesture.current.phase !== 'painting') return
      const p = rayPointOnDragPlane(ev)
      const cell = p ? cellFromDragPlane(p) : null
      if (cell) useEditor.getState().setHover(cell)
      feed({ kind: 'move', x: ev.clientX, y: ev.clientY, cell })
    }
    const onUp = (ev: PointerEvent) => {
      touchClock()
      rec(EV.pointerUp, ev.clientX, ev.clientY,
        Math.hypot(ev.clientX - downPos.current.x, ev.clientY - downPos.current.y),
        performance.now() - gestureT0.current)
      feed({ kind: 'up', x: ev.clientX, y: ev.clientY })
      endGesture()
    }
    // Releasing capture on a normal up also fires lostpointercapture; skip
    // the abort path when already idle so a plain click logs no false abort.
    const abortIfActive = (kind: 'cancel' | 'lostCapture' | 'blur' | 'unmount') => {
      if (gesture.current.phase === 'idle') return
      feed({ kind })
      endGesture()
    }
    const onCancel = (ev: PointerEvent) => {
      rec(EV.pointerCancel, str(ev.pointerType || 'mouse'), performance.now() - gestureT0.current)
      abortIfActive('cancel')
    }
    const onLost = () => abortIfActive('lostCapture')
    const onBlur = () => abortIfActive('blur')

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
      abortIfActive('unmount')
    }
  }, [feed, canvasEl, rayPointOnDragPlane, cellFromDragPlane])

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

      <Cursor cell={store.hover} color={store.tool === 'eraser' ? '#ff6b6b' : '#ffffff'} />
      <SelectionBox sel={store.selection} />
      <AnchorMarker anchor={store.anchor} axis={store.sliceAxis} index={store.sliceIndex} />
    </>
  )
}

export function Scene() {
  const dims = useEditor((s) => s.world.dims)
  const cancel = useEditor((s) => s.cancelAnchor)
  const orbitRef = useRef<OrbitControlsImpl>(null)
  const center: [number, number, number] = [dims.x / 2, dims.y / 4, dims.z / 2]
  const dist = Math.max(dims.x, dims.z) * 1.15 + 8
  // First framing only. As a live prop r3f re-applies it after every fit,
  // which is why "Centrar" never centered: the fit target was overwritten.
  const initialTarget = useRef(center)

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
        cancel()
      }}
      onContextMenu={(e) => e.preventDefault()}
      data-testid="scene-canvas"
    >
      <color attach="background" args={['#1a1f27']} />
      <fog attach="fog" args={['#1a1f27', dist * 2.2, dist * 6]} />
      <Editor />
      <ViewFitter />
      <OrbitControls
        makeDefault
        target={initialTarget.current}
        enableDamping
        dampingFactor={0.12}
        maxDistance={2200}
        minDistance={2}
        mouseButtons={{
          LEFT: THREE.MOUSE.ROTATE,
          MIDDLE: THREE.MOUSE.ROTATE,
          RIGHT: THREE.MOUSE.PAN,
        }}
        ref={orbitRef}
        onStart={() => rec(EV.orbitStart)}
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
