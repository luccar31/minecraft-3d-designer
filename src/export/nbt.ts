/** Big-endian NBT writer, just enough for Sponge Schematic v2. */

export type NbtValue =
  | { t: 'byte'; v: number }
  | { t: 'short'; v: number }
  | { t: 'int'; v: number }
  | { t: 'string'; v: string }
  | { t: 'byteArray'; v: Uint8Array }
  | { t: 'intArray'; v: number[] }
  | { t: 'list'; of: number; v: NbtValue[] }
  | { t: 'compound'; v: Record<string, NbtValue> }

const TAG = {
  end: 0, byte: 1, short: 2, int: 3, long: 4, float: 5, double: 6,
  byteArray: 7, string: 8, list: 9, compound: 10, intArray: 11,
} as const

export const TAG_ID: Record<NbtValue['t'], number> = {
  byte: TAG.byte,
  short: TAG.short,
  int: TAG.int,
  string: TAG.string,
  byteArray: TAG.byteArray,
  intArray: TAG.intArray,
  list: TAG.list,
  compound: TAG.compound,
}

class Writer {
  private buf = new Uint8Array(1024)
  private len = 0

  private ensure(n: number) {
    if (this.len + n <= this.buf.length) return
    let cap = this.buf.length
    while (cap < this.len + n) cap *= 2
    const next = new Uint8Array(cap)
    next.set(this.buf.subarray(0, this.len))
    this.buf = next
  }

  u8(v: number) {
    this.ensure(1)
    this.buf[this.len++] = v & 0xff
  }

  i16(v: number) {
    this.ensure(2)
    this.buf[this.len++] = (v >> 8) & 0xff
    this.buf[this.len++] = v & 0xff
  }

  i32(v: number) {
    this.ensure(4)
    this.buf[this.len++] = (v >>> 24) & 0xff
    this.buf[this.len++] = (v >>> 16) & 0xff
    this.buf[this.len++] = (v >>> 8) & 0xff
    this.buf[this.len++] = v & 0xff
  }

  str(s: string) {
    const bytes = new TextEncoder().encode(s)
    this.i16(bytes.length)
    this.raw(bytes)
  }

  raw(b: Uint8Array) {
    this.ensure(b.length)
    this.buf.set(b, this.len)
    this.len += b.length
  }

  done(): Uint8Array {
    return this.buf.slice(0, this.len)
  }
}

function writePayload(w: Writer, val: NbtValue) {
  switch (val.t) {
    case 'byte': w.u8(val.v); break
    case 'short': w.i16(val.v); break
    case 'int': w.i32(val.v); break
    case 'string': w.str(val.v); break
    case 'byteArray': w.i32(val.v.length); w.raw(val.v); break
    case 'intArray': w.i32(val.v.length); for (const n of val.v) w.i32(n); break
    case 'list':
      w.u8(val.of)
      w.i32(val.v.length)
      for (const item of val.v) writePayload(w, item)
      break
    case 'compound':
      for (const [k, v] of Object.entries(val.v)) {
        w.u8(TAG_ID[v.t])
        w.str(k)
        writePayload(w, v)
      }
      w.u8(TAG.end)
      break
  }
}

/** Serializes a named compound as the file's root. */
export function writeNamedCompound(name: string, root: NbtValue & { t: 'compound' }): Uint8Array {
  const w = new Writer()
  w.u8(TAG.compound)
  w.str(name)
  writePayload(w, root)
  return w.done()
}

/** Unsigned LEB128, as used by Sponge's BlockData. */
export function varint(n: number, out: number[]) {
  let v = n >>> 0
  do {
    let byte = v & 0x7f
    v >>>= 7
    if (v !== 0) byte |= 0x80
    out.push(byte)
  } while (v !== 0)
}
