import { useEditor } from '../state/store'

/** Disambiguates up from down, and the build guide speaks in coordinates. */
export function CoordReadout() {
  const hover = useEditor((s) => s.hover)
  const sliceIndex = useEditor((s) => s.sliceIndex)
  if (!hover) return null
  return (
    <div className="coord-readout" data-testid="coord-readout" aria-label="Coordenadas del cursor">
      x {hover.x} · y {hover.y} · z {hover.z} · capa {sliceIndex}
    </div>
  )
}
