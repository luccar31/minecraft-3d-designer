import type { StoredDesign } from '../types'
import { isStoredDesign } from '../storage/codec'

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

export const slugify = (s: string) =>
  s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'diseno'

export function downloadDesignJson(sd: StoredDesign) {
  downloadBlob(
    `${slugify(sd.name)}.mcbp.json`,
    new Blob([JSON.stringify(sd, null, 2)], { type: 'application/json' }),
  )
}

export async function readDesignFile(file: File): Promise<StoredDesign> {
  const text = await file.text()
  const parsed = JSON.parse(text)
  if (!isStoredDesign(parsed)) throw new Error('El archivo no es un diseño .mcbp.json válido')
  return parsed
}
