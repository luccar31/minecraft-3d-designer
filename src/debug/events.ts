/**
 * Telemetry event catalog, declared once. Convention: a `$`-prefixed field
 * holds an interned string id, not a number.
 */

import { def, LEVEL, intern } from './ring'

/* ── modifier masks ───────────────────────────────────────────────────────── */

export const MOD = { SHIFT: 1, CTRL: 2, ALT: 4, META: 8 } as const

export const packMods = (e: {
  shiftKey?: boolean; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean
}): number =>
  (e.shiftKey ? MOD.SHIFT : 0) | (e.ctrlKey ? MOD.CTRL : 0) |
  (e.altKey ? MOD.ALT : 0) | (e.metaKey ? MOD.META : 0)

export function modsLabel(m: number): string {
  if (!m) return '—'
  const out: string[] = []
  if (m & MOD.SHIFT) out.push('shift')
  if (m & MOD.CTRL) out.push('ctrl')
  if (m & MOD.ALT) out.push('alt')
  if (m & MOD.META) out.push('meta')
  return out.join('+')
}

/** Strings repeated often: interned at load time, not on the hot path. */
export const S = {
  mouse: intern('mouse'),
  touch: intern('touch'),
  pen: intern('pen'),
  click: intern('click'),
  drag: intern('drag'),
  orbit: intern('orbit'),
  canceled: intern('canceled'),
  place: intern('place'),
  erase: intern('erase'),
  pick: intern('pick'),
  none: intern('none'),
}

export const str = intern

/* ── pointer ─────────────────────────────────────────────────────────────── */

export const EV = {
  /* pointer: the raw gesture, before it's interpreted */
  pointerDown: def('pointer', 'pointer.down',
    ['$type', 'px', 'py', 'button', 'mods', 'targets'], LEVEL.ACTIONS),
  pointerMove: def('pointer', 'pointer.move',
    ['px', 'py', 'distDown', 'msSinceDown'], LEVEL.ALL),
  pointerUp: def('pointer', 'pointer.up',
    ['px', 'py', 'distDown', 'msSinceDown'], LEVEL.ACTIONS),
  pointerCancel: def('pointer', 'pointer.cancel', ['$type', 'msSinceDown'], LEVEL.ACTIONS),
  pointerLeave: def('pointer', 'pointer.leave', [], LEVEL.NORMAL),
  pointerNoTarget: def('pointer', 'pointer.no-target', ['px', 'py'], LEVEL.ACTIONS),
  pointerCapture: def('pointer', 'pointer.capture', ['id', 'ok'], LEVEL.NORMAL),
  wheel: def('pointer', 'pointer.wheel', ['deltaY', 'mods'], LEVEL.NORMAL),

  /* raycast: what the ray hit and at what distance; explains off-by-one bugs */
  ray: def('pointer', 'ray',
    ['$object', 'wx', 'wy', 'wz', 'dist', 'hits'], LEVEL.NORMAL),
  rayCell: def('pointer', 'ray.cell',
    ['targetX', 'targetY', 'targetZ', 'placeX', 'placeY', 'placeZ'], LEVEL.NORMAL),
  hover: def('pointer', 'hover', ['x', 'y', 'z', '$source'], LEVEL.NORMAL),
  hoverNone: def('pointer', 'hover.none', [], LEVEL.NORMAL),

  /* gesture: the interpretation layer, which is where the bugs live */
  gestureStart: def('gesture', 'gesture.start', ['$type', '$intent', 'mods'], LEVEL.ACTIONS),
  gestureClassified: def('gesture', 'gesture.classified', ['$as', 'distPx', 'ms'], LEVEL.ACTIONS),
  gestureEnd: def('gesture', 'gesture.end', ['$as', 'ms', 'cells', 'distPx'], LEVEL.ACTIONS),
  gestureAborted: def('gesture', 'gesture.aborted', ['$reason', 'ms'], LEVEL.ACTIONS),

  /* camera */
  orbitStart: def('camera', 'camera.orbit-start', [], LEVEL.ACTIONS),
  orbitEnd: def('camera', 'camera.orbit-end', [], LEVEL.ACTIONS),
  cameraPose: def('camera', 'camera.pose',
    ['x', 'y', 'z', 'tx', 'ty', 'tz'], LEVEL.NORMAL),
  cameraFit: def('camera', 'camera.fit', ['radius', 'dist', 'blocks'], LEVEL.ACTIONS),
  orbitEnabled: def('camera', 'camera.orbit-enabled', ['active', '$reason'], LEVEL.ACTIONS),

  /* editing */
  write: def('edit', 'write',
    ['requested', 'applied', 'total', 'inStroke', 'ms'], LEVEL.ACTIONS),
  noChange: def('edit', 'write.no-change', ['requested', '$reason'], LEVEL.NORMAL),
  strokeStart: def('edit', 'stroke.start', ['$tool'], LEVEL.ACTIONS),
  strokeEnd: def('edit', 'stroke.end', ['cells', 'ms'], LEVEL.ACTIONS),
  strokeOrphaned: def('error', 'stroke.orphaned', ['deltasLost'], LEVEL.ACTIONS),
  planeClick: def('edit', 'plane-click',
    ['$tool', 'u', 'v', 'erase', 'layer', '$axis'], LEVEL.ACTIONS),
  paint: def('edit', 'paint', ['x', 'y', 'z', '$block', 'erase'], LEVEL.NORMAL),
  undo: def('edit', 'undo', ['applied', 'total', 'stack'], LEVEL.ACTIONS),
  redo: def('edit', 'redo', ['applied', 'total', 'stack'], LEVEL.ACTIONS),
  copy: def('edit', 'copy', ['cells', 'cut'], LEVEL.ACTIONS),
  paste: def('edit', 'paste', ['u', 'v', 'cells'], LEVEL.ACTIONS),
  selection: def('edit', 'selection', ['width', 'height', 'cells'], LEVEL.ACTIONS),
  mirror: def('edit', 'mirror', ['source', 'generated'], LEVEL.NORMAL),

  /* tool and mode */
  tool: def('tool', 'tool', ['$from', '$to', 'forcedLayer'], LEVEL.ACTIONS),
  block: def('tool', 'block', ['$from', '$to'], LEVEL.ACTIONS),
  layer: def('tool', 'layer', ['from', 'to', '$axis', 'clamped'], LEVEL.ACTIONS),
  layerAxis: def('tool', 'layer-axis', ['$from', '$to'], LEVEL.ACTIONS),
  layerMode: def('tool', 'layer-mode', ['$from', '$to'], LEVEL.ACTIONS),
  toggle: def('tool', 'toggle', ['$which', 'value'], LEVEL.ACTIONS),
  mode: def('tool', 'mode', ['$from', '$to'], LEVEL.ACTIONS),

  /* keyboard */
  key: def('keyboard', 'key', ['$key', 'mods', 'repeat'], LEVEL.ACTIONS),
  keyIgnored: def('keyboard', 'key.ignored', ['$key', '$reason'], LEVEL.NORMAL),

  /* view and UI */
  view: def('view', 'view', ['$from', '$to'], LEVEL.ACTIONS),
  panel: def('view', 'panel', ['$which', 'open'], LEVEL.ACTIONS),
  button: def('view', 'button', ['$id', '$context'], LEVEL.ACTIONS),
  field: def('view', 'field', ['$id', 'length'], LEVEL.ACTIONS),
  resize: def('view', 'resize', ['w', 'h', 'dpr'], LEVEL.ACTIONS),
  guideStep: def('view', 'guide.step', ['from', 'to', 'total'], LEVEL.ACTIONS),

  /* document */
  designNew: def('design', 'design.new', ['dx', 'dy', 'dz'], LEVEL.ACTIONS),
  designLoaded: def('design', 'design.loaded', ['blocks', 'dx', 'dy', 'dz', 'ms'], LEVEL.ACTIONS),
  designSaved: def('design', 'design.saved', ['blocks', 'bytes', 'ms'], LEVEL.ACTIONS),
  designDeleted: def('design', 'design.deleted', [], LEVEL.ACTIONS),
  designResized: def('design', 'design.resized', ['dx', 'dy', 'dz', 'lost'], LEVEL.ACTIONS),
  exportDesign: def('design', 'export', ['$format', 'bytes', 'ms'], LEVEL.ACTIONS),
  importDesign: def('design', 'import', ['$format', 'bytes', 'blocks', 'ms'], LEVEL.ACTIONS),

  /* frame and render */
  frame: def('frame', 'frame',
    ['ms', 'msCPU', 'calls', 'tris', 'geoms', 'progs'], LEVEL.NORMAL),
  frameSlow: def('frame', 'frame.slow', ['ms', 'calls', 'tris'], LEVEL.ACTIONS),
  remesh: def('render', 'remesh',
    ['chunk', 'cells', 'ms', 'vertsOpaque', 'vertsTrans'], LEVEL.NORMAL),
  remeshBatch: def('render', 'remesh.batch', ['chunks', 'ms', 'cells'], LEVEL.ACTIONS),
  chunksDirty: def('render', 'chunks.dirty', ['count', 'batched'], LEVEL.ALL),
  atlas: def('render', 'atlas.generated', ['ms', 'slots'], LEVEL.ACTIONS),
  webglContext: def('render', 'webgl.context', ['lost'], LEVEL.ACTIONS),

  /* environment performance */
  longTask: def('perf', 'long-task', ['ms'], LEVEL.ACTIONS),
  longFrame: def('perf', 'long-frame', ['ms', 'msScript', 'msStyleLayout', 'msBlocking'], LEVEL.ACTIONS),
  memory: def('perf', 'memory', ['usedMB', 'totalMB', 'limitMB'], LEVEL.NORMAL),
  eventLatency: def('perf', 'event-latency', ['ms', '$type'], LEVEL.NORMAL),
  measurement: def('perf', 'measurement', ['$label', 'ms'], LEVEL.NORMAL),

  /* storage */
  storage: def('net', 'storage', ['$op', 'ms', 'bytes', 'ok'], LEVEL.ACTIONS),
  codec: def('net', 'codec', ['$op', 'ms', 'bytesRaw', 'bytesCompressed', 'blocks'], LEVEL.ACTIONS),

  /* system */
  boot: def('system', 'boot', [], LEVEL.ACTIONS),
  visibility: def('system', 'visibility', ['visible'], LEVEL.ACTIONS),
  focus: def('system', 'focus', ['has'], LEVEL.ACTIONS),
  captureLevel: def('system', 'capture-level', ['from', 'to'], LEVEL.ACTIONS),
  snapshot: def('system', 'snapshot', [], LEVEL.ACTIONS),

  /* silent degradation: everything that today gets lost without any warning */
  status: def('view', 'status', ['$text'], LEVEL.ACTIONS),
  limitReached: def('error', 'limit-reached', ['$where', 'limit'], LEVEL.ACTIONS),
  discarded: def('error', 'discarded', ['$where', 'count', 'ofTotal'], LEVEL.ACTIONS),
  historyPruned: def('edit', 'history.pruned', ['depth', 'futureLost'], LEVEL.ACTIONS),
  historyCleared: def('edit', 'history.cleared', ['past', 'future', '$reason'], LEVEL.ACTIONS),
  unknownBlock: def('error', 'unknown-block', ['$id'], LEVEL.ACTIONS),
  popupBlocked: def('error', 'popup-blocked', ['$what'], LEVEL.ACTIONS),
  outOfBounds: def('error', 'out-of-bounds', ['x', 'y', 'z', '$source'], LEVEL.NORMAL),

  /* pre-declared for specs/ workstreams: defined here so none touch this
     shared file, letting them run in parallel */
  touchGesture: def('gesture', 'gesture.touch', ['$type', 'pointers', 'ms'], LEVEL.ACTIONS),
  tutorialStep: def('view', 'tutorial.step', ['step', 'total', '$result'], LEVEL.ACTIONS),
  generator: def('edit', 'generator', ['$type', 'cells', 'outOfGrid', 'ms'], LEVEL.ACTIONS),
  template: def('design', 'template', ['$id', '$action', 'cells'], LEVEL.ACTIONS),
  aiRequest: def('net', 'ai.request', ['$mode', 'images', 'promptLength'], LEVEL.ACTIONS),
  aiResponse: def('net', 'ai.response', ['ms', 'steps', 'tokensOut'], LEVEL.ACTIONS),
  aiFailure: def('error', 'ai.failure', ['$category', 'status'], LEVEL.ACTIONS),
  aiBlockMapped: def('error', 'ai.block-mapped', ['$from', '$to'], LEVEL.ACTIONS),

  /* errors */
  exception: def('error', 'exception', [], LEVEL.ACTIONS),
  unhandledRejection: def('error', 'unhandled-rejection', [], LEVEL.ACTIONS),
  invariant: def('error', 'invariant', [], LEVEL.ACTIONS),
  failure: def('error', 'failure', ['$where'], LEVEL.ACTIONS),
} as const
