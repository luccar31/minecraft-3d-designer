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
  attachRenderer, beginGesture, endGesture, EV, packMods, rec, startFrames, str,
  touchClock, watchCanvas,
} from '../debug'
import type { Vec3 } from '../types'

const NORMAL_MATRIX = new THREE.Matrix3()

function worldNormal(e: ThreeEvent<PointerEvent>): THREE.Vector3 {
  if (!e.face) return new THREE.Vector3(0, 1, 0)
  return e.face.normal
    .clone()
    .applyNormalMatrix(NORMAL_MATRIX.getNormalMatrix(e.object.matrixWorld))
    .normalize()
}

const floorVec = (p: THREE.Vector3, n: THREE.Vector3, sign: number): Vec3 => ({
  x: Math.floor(p.x + sign * n.x * 0.5),
  y: Math.floor(p.y + sign * n.y * 0.5),
  z: Math.floor(p.z + sign * n.z * 0.5),
})

/** Encuadra la construcción (o la grilla, si está vacía) en la cámara. */
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

  // Planos de recorte: es lo que da el modo capa sin duplicar geometría.
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

  /* ── gesto de dibujo ──────────────────────────────────────────────────── */

  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const dragPlane = useRef<THREE.Plane | null>(null)
  const dragNormal = useRef(new THREE.Vector3(0, 1, 0))
  const dragErase = useRef(false)
  const lastCell = useRef('')

  const applyAtPoint = useCallback(
    (p: THREE.Vector3, n: THREE.Vector3, erase: boolean, alt: boolean) => {
      const s = useEditor.getState()
      if (s.sliceView !== 'off') {
        const cellPoint: Vec3 = {
          x: Math.floor(p.x),
          y: Math.floor(p.y),
          z: Math.floor(p.z),
        }
        const uv = worldToPlane(s.sliceAxis, cellPoint)
        const pd =
          s.sliceAxis === 'y'
            ? { u: s.world.dims.x, v: s.world.dims.z }
            : s.sliceAxis === 'x'
              ? { u: s.world.dims.z, v: s.world.dims.y }
              : { u: s.world.dims.x, v: s.world.dims.y }
        if (uv.u < 0 || uv.v < 0 || uv.u >= pd.u || uv.v >= pd.v) return
        const tag = `${uv.u},${uv.v}`
        if (tag === lastCell.current) return
        lastCell.current = tag
        if (alt) {
          s.pickAt({ ...cellPoint })
          return
        }
        s.planeAction(uv, erase)
        return
      }

      const target = floorVec(p, n, -1)
      const place = floorVec(p, n, 1)
      const cell = erase || alt || s.tool === 'eraser' || s.tool === 'picker' ? target : place
      // Las dos celdas candidatas, juntas: comparar cuál se eligió contra cuál
      // dibuja el cursor es lo que hace visible un off-by-one.
      rec(EV.rayoCelda, target.x, target.y, target.z, place.x, place.y, place.z)
      const tag = `${cell.x},${cell.y},${cell.z}`
      if (tag === lastCell.current) return
      lastCell.current = tag
      if (alt || s.tool === 'picker') s.pickAt(cell)
      else s.paintAt(cell, erase || s.tool === 'eraser')
    },
    [],
  )

  const rayPointOnDragPlane = useCallback(
    (ev: PointerEvent): THREE.Vector3 | null => {
      const plane = dragPlane.current
      if (!plane) return null
      const rect = gl.domElement.getBoundingClientRect()
      const ndc = new THREE.Vector2(
        ((ev.clientX - rect.left) / rect.width) * 2 - 1,
        -((ev.clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(ndc, camera)
      const hit = new THREE.Vector3()
      return raycaster.ray.intersectPlane(plane, hit) ? hit : null
    },
    [camera, gl, raycaster],
  )

  const endDrag = useCallback(() => {
    dragPlane.current = null
    lastCell.current = ''
    if (controls) controls.enabled = true
    useEditor.getState().endStroke()
  }, [controls])

  const onDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      touchClock()
      const mods = packMods(e)
      const tipoId = str(e.pointerType || 'mouse')
      if (e.button !== 0) {
        rec(EV.punteroDown, tipoId, e.clientX, e.clientY, e.button, mods,
          e.intersections?.length ?? NaN)
        return
      }
      e.stopPropagation()
      const s = useEditor.getState()
      const gid = beginGesture()
      void gid
      rec(EV.punteroDown, tipoId, e.clientX, e.clientY, e.button, mods,
        e.intersections?.length ?? NaN)
      // Qué tocó el rayo y a qué distancia: es lo que explica que el preview y
      // la edición puedan resolver a celdas distintas.
      rec(EV.rayo, str(e.object.name || e.object.type), e.point.x, e.point.y, e.point.z,
        e.distance ?? NaN, e.intersections?.length ?? NaN)
      rec(EV.gestoInicio, tipoId,
        str(e.shiftKey ? 'borrar' : s.tool === 'eraser' ? 'borrar' : e.altKey ? 'elegir' : 'colocar'),
        mods)
      const n = sliceMode
        ? new THREE.Vector3(
            s.sliceAxis === 'x' ? 1 : 0,
            s.sliceAxis === 'y' ? 1 : 0,
            s.sliceAxis === 'z' ? 1 : 0,
          )
        : worldNormal(e)
      dragNormal.current = n
      dragErase.current = e.shiftKey
      dragPlane.current = new THREE.Plane().setFromNormalAndCoplanarPoint(n, e.point)
      lastCell.current = ''
      if (controls) controls.enabled = false

      const dragTool = s.tool === 'brush' || s.tool === 'eraser'
      if (dragTool) s.beginStroke()

      applyAtPoint(e.point, n, e.shiftKey, e.altKey)

      const x0 = e.clientX
      const y0 = e.clientY
      const t0 = performance.now()
      let celdas = 0
      const dist = (ev: PointerEvent) => Math.hypot(ev.clientX - x0, ev.clientY - y0)

      const move = (ev: PointerEvent) => {
        touchClock()
        rec(EV.punteroMove, ev.clientX, ev.clientY, dist(ev), performance.now() - t0)
        if (!dragTool) return
        const p = rayPointOnDragPlane(ev)
        if (p) {
          const antes = lastCell.current
          applyAtPoint(p, dragNormal.current, dragErase.current, false)
          if (lastCell.current !== antes) celdas++
        }
      }
      const up = (ev: PointerEvent) => {
        touchClock()
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', cancelled)
        const d = dist(ev)
        const ms = performance.now() - t0
        rec(EV.punteroUp, ev.clientX, ev.clientY, d, ms)
        rec(EV.gestoFin, str(d < 4 ? 'click' : 'arrastre'), ms, celdas, d)
        endGesture()
        if (dragTool) endDrag()
        else {
          dragPlane.current = null
          lastCell.current = ''
          if (controls) controls.enabled = true
        }
      }
      // Sólo observa: hoy nadie limpia el gesto si el puntero se cancela, y ese
      // es justamente el camino por el que la órbita queda apagada para siempre.
      const cancelled = (ev: PointerEvent) => {
        touchClock()
        rec(EV.punteroCancel, str(ev.pointerType || 'mouse'), performance.now() - t0)
        rec(EV.gestoAbortado, str('pointercancel-sin-limpieza'), performance.now() - t0)
        rec(EV.orbitHabilitado, controls ? (controls.enabled ? 1 : 0) : NaN,
          str('quedo-asi-tras-cancel'))
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', cancelled)
    },
    [applyAtPoint, controls, endDrag, rayPointOnDragPlane, sliceMode],
  )

  const onHover = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      touchClock()
      const s = useEditor.getState()
      if (s.sliceView !== 'off') {
        const c = { x: Math.floor(e.point.x), y: Math.floor(e.point.y), z: Math.floor(e.point.z) }
        rec(EV.hover, c.x, c.y, c.z, str('slice'))
        s.setHover(c)
        return
      }
      const n = worldNormal(e)
      const erasing = s.tool === 'eraser'
      const c = floorVec(e.point, n, erasing ? -1 : 1)
      // `fuente` registra de qué objeto salió este hover. Cuando el preview y la
      // edición discrepan, acá se ve que vinieron de mallas distintas.
      rec(EV.hover, c.x, c.y, c.z, str(e.object.name || e.object.type))
      s.setHover(c)
    },
    [],
  )

  const clearHover = useCallback(() => {
    rec(EV.hoverNulo)
    useEditor.getState().setHover(null)
  }, [])

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

  return (
    <Canvas
      shadows={false}
      dpr={[1, 2]}
      camera={{ position: [center[0] + dist * 0.7, dims.y + dist * 0.5, center[2] + dist * 0.8], fov: 48, far: 4000 }}
      onCreated={({ gl }) => {
        gl.localClippingEnabled = true
        attachRenderer(gl)
        watchCanvas(gl.domElement)
        // Los contadores por frame se leen enganchándose al loop de r3f, que es
        // el único punto donde `renderer.info` ya corresponde a este frame.
        startFrames(addEffect, addAfterEffect)
      }}
      onPointerMissed={(e) => {
        rec(EV.punteroSinObjetivo, (e as PointerEvent).clientX, (e as PointerEvent).clientY)
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
        target={center}
        enableDamping
        dampingFactor={0.12}
        maxDistance={2200}
        minDistance={2}
        ref={orbitRef}
        onStart={() => rec(EV.orbitInicio)}
        onEnd={() => rec(EV.orbitFin)}
        onChange={() => {
          // El payload de 'change' sólo trae { type, target } y `target` se
          // anula al terminar el dispatch: se lee del ref, no del evento.
          const c = orbitRef.current
          if (!c) return
          const p = c.object.position
          const t = c.target
          rec(EV.camaraPose, p.x, p.y, p.z, t.x, t.y, t.z)
        }}
      />
    </Canvas>
  )
}
