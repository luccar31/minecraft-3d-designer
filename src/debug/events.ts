/**
 * Catálogo de eventos de telemetría.
 *
 * Todo lo que la app registra se declara acá una sola vez. La declaración fija
 * el nombre, la categoría, los nombres de las ranuras numéricas y el nivel de
 * captura mínimo. En tiempo de ejecución sólo circula el entero.
 *
 * Convención: un campo con prefijo `$` guarda un id de cadena internada.
 */

import { def, LEVEL, intern } from './ring'

/* ── máscaras de modificadores ───────────────────────────────────────────── */

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

/** Cadenas que se repiten mucho: se internan al cargar, no en el hot path. */
export const S = {
  mouse: intern('mouse'),
  touch: intern('touch'),
  pen: intern('pen'),
  click: intern('click'),
  arrastre: intern('arrastre'),
  orbita: intern('orbita'),
  cancelado: intern('cancelado'),
  colocar: intern('colocar'),
  borrar: intern('borrar'),
  elegir: intern('elegir'),
  ninguno: intern('ninguno'),
}

export const str = intern

/* ── puntero ─────────────────────────────────────────────────────────────── */

export const EV = {
  /* puntero: el gesto crudo, antes de interpretarlo */
  punteroDown: def('puntero', 'puntero.down',
    ['$tipo', 'px', 'py', 'boton', 'mods', 'objetivos'], LEVEL.ACCIONES),
  punteroMove: def('puntero', 'puntero.move',
    ['px', 'py', 'distDown', 'msDesdeDown'], LEVEL.TODO),
  punteroUp: def('puntero', 'puntero.up',
    ['px', 'py', 'distDown', 'msDesdeDown'], LEVEL.ACCIONES),
  punteroCancel: def('puntero', 'puntero.cancel', ['$tipo', 'msDesdeDown'], LEVEL.ACCIONES),
  punteroSale: def('puntero', 'puntero.sale', [], LEVEL.NORMAL),
  punteroSinObjetivo: def('puntero', 'puntero.sin-objetivo', ['px', 'py'], LEVEL.ACCIONES),
  punteroCaptura: def('puntero', 'puntero.captura', ['id', 'ok'], LEVEL.NORMAL),
  rueda: def('puntero', 'puntero.rueda', ['deltaY', 'mods'], LEVEL.NORMAL),

  /* raycast: qué tocó el rayo y a qué distancia. Explica los off-by-one. */
  rayo: def('puntero', 'rayo',
    ['$objeto', 'wx', 'wy', 'wz', 'dist', 'intersecciones'], LEVEL.NORMAL),
  rayoCelda: def('puntero', 'rayo.celda',
    ['objx', 'objy', 'objz', 'colx', 'coly', 'colz'], LEVEL.NORMAL),
  hover: def('puntero', 'hover', ['x', 'y', 'z', '$fuente'], LEVEL.NORMAL),
  hoverNulo: def('puntero', 'hover.nulo', [], LEVEL.NORMAL),

  /* gesto: la interpretación, que es donde viven los bugs */
  gestoInicio: def('gesto', 'gesto.inicio', ['$tipo', '$intencion', 'mods'], LEVEL.ACCIONES),
  gestoClasificado: def('gesto', 'gesto.clasificado', ['$como', 'distPx', 'ms'], LEVEL.ACCIONES),
  gestoFin: def('gesto', 'gesto.fin', ['$como', 'ms', 'celdas', 'distPx'], LEVEL.ACCIONES),
  gestoAbortado: def('gesto', 'gesto.abortado', ['$motivo', 'ms'], LEVEL.ACCIONES),

  /* cámara */
  orbitInicio: def('camara', 'camara.orbit-inicio', [], LEVEL.ACCIONES),
  orbitFin: def('camara', 'camara.orbit-fin', [], LEVEL.ACCIONES),
  camaraPose: def('camara', 'camara.pose',
    ['x', 'y', 'z', 'tx', 'ty', 'tz'], LEVEL.NORMAL),
  camaraEncuadre: def('camara', 'camara.encuadre', ['radio', 'dist', 'bloques'], LEVEL.ACCIONES),
  orbitHabilitado: def('camara', 'camara.orbit-habilitado', ['activo', '$motivo'], LEVEL.ACCIONES),

  /* edición */
  escritura: def('edicion', 'escritura',
    ['pedidas', 'aplicadas', 'total', 'enTrazo', 'ms'], LEVEL.ACCIONES),
  sinCambio: def('edicion', 'escritura.sin-cambio', ['pedidas', '$motivo'], LEVEL.NORMAL),
  trazoInicio: def('edicion', 'trazo.inicio', ['$tool'], LEVEL.ACCIONES),
  trazoFin: def('edicion', 'trazo.fin', ['celdas', 'ms'], LEVEL.ACCIONES),
  trazoHuerfano: def('error', 'trazo.huerfano', ['deltasPerdidos'], LEVEL.ACCIONES),
  accionPlano: def('edicion', 'accion-plano',
    ['$tool', 'u', 'v', 'borrar', 'capa', '$eje'], LEVEL.ACCIONES),
  pintar: def('edicion', 'pintar', ['x', 'y', 'z', '$bloque', 'borrar'], LEVEL.NORMAL),
  deshacer: def('edicion', 'deshacer', ['aplicado', 'total', 'pila'], LEVEL.ACCIONES),
  rehacer: def('edicion', 'rehacer', ['aplicado', 'total', 'pila'], LEVEL.ACCIONES),
  copiar: def('edicion', 'copiar', ['celdas', 'cortar'], LEVEL.ACCIONES),
  pegar: def('edicion', 'pegar', ['u', 'v', 'celdas'], LEVEL.ACCIONES),
  seleccion: def('edicion', 'seleccion', ['ancho', 'alto', 'celdas'], LEVEL.ACCIONES),
  espejo: def('edicion', 'espejo', ['origen', 'generadas'], LEVEL.NORMAL),

  /* herramienta y modo */
  herramienta: def('herramienta', 'herramienta', ['$de', '$a', 'forzoCapa'], LEVEL.ACCIONES),
  bloque: def('herramienta', 'bloque', ['$de', '$a'], LEVEL.ACCIONES),
  capa: def('herramienta', 'capa', ['de', 'a', '$eje', 'topeado'], LEVEL.ACCIONES),
  ejeCapa: def('herramienta', 'eje-capa', ['$de', '$a'], LEVEL.ACCIONES),
  modoCapa: def('herramienta', 'modo-capa', ['$de', '$a'], LEVEL.ACCIONES),
  toggle: def('herramienta', 'toggle', ['$que', 'valor'], LEVEL.ACCIONES),

  /* teclado */
  tecla: def('teclado', 'tecla', ['$key', 'mods', 'repetida'], LEVEL.ACCIONES),
  teclaIgnorada: def('teclado', 'tecla.ignorada', ['$key', '$motivo'], LEVEL.NORMAL),

  /* vista y UI */
  vista: def('vista', 'vista', ['$de', '$a'], LEVEL.ACCIONES),
  panel: def('vista', 'panel', ['$cual', 'abierto'], LEVEL.ACCIONES),
  boton: def('vista', 'boton', ['$id', '$contexto'], LEVEL.ACCIONES),
  campo: def('vista', 'campo', ['$id', 'largo'], LEVEL.ACCIONES),
  resize: def('vista', 'resize', ['w', 'h', 'dpr'], LEVEL.ACCIONES),
  guiaPaso: def('vista', 'guia.paso', ['de', 'a', 'total'], LEVEL.ACCIONES),

  /* documento */
  disenoNuevo: def('diseno', 'diseno.nuevo', ['dx', 'dy', 'dz'], LEVEL.ACCIONES),
  disenoCargado: def('diseno', 'diseno.cargado', ['bloques', 'dx', 'dy', 'dz', 'ms'], LEVEL.ACCIONES),
  disenoGuardado: def('diseno', 'diseno.guardado', ['bloques', 'bytes', 'ms'], LEVEL.ACCIONES),
  disenoBorrado: def('diseno', 'diseno.borrado', [], LEVEL.ACCIONES),
  disenoRedimensionado: def('diseno', 'diseno.redimensionado', ['dx', 'dy', 'dz', 'perdidos'], LEVEL.ACCIONES),
  exportar: def('diseno', 'exportar', ['$formato', 'bytes', 'ms'], LEVEL.ACCIONES),
  importar: def('diseno', 'importar', ['$formato', 'bytes', 'bloques', 'ms'], LEVEL.ACCIONES),

  /* frame y render */
  frame: def('frame', 'frame',
    ['ms', 'msCPU', 'calls', 'tris', 'geoms', 'progs'], LEVEL.NORMAL),
  frameLento: def('frame', 'frame.lento', ['ms', 'calls', 'tris'], LEVEL.ACCIONES),
  remesh: def('render', 'remesh',
    ['chunk', 'celdas', 'ms', 'vertsOpaco', 'vertsTrans'], LEVEL.NORMAL),
  remeshLote: def('render', 'remesh.lote', ['chunks', 'ms', 'celdas'], LEVEL.ACCIONES),
  chunksSucios: def('render', 'chunks.sucios', ['cantidad', 'enLote'], LEVEL.TODO),
  atlas: def('render', 'atlas.generado', ['ms', 'slots'], LEVEL.ACCIONES),
  contextoWebGL: def('render', 'webgl.contexto', ['perdido'], LEVEL.ACCIONES),

  /* rendimiento del entorno */
  tareaLarga: def('perf', 'tarea-larga', ['ms'], LEVEL.ACCIONES),
  frameLargo: def('perf', 'frame-largo', ['ms', 'msScript', 'msEstiloLayout', 'msBloqueo'], LEVEL.ACCIONES),
  memoria: def('perf', 'memoria', ['usadaMB', 'totalMB', 'limiteMB'], LEVEL.NORMAL),
  latenciaEvento: def('perf', 'latencia-evento', ['ms', '$tipo'], LEVEL.NORMAL),
  medicion: def('perf', 'medicion', ['$que', 'ms'], LEVEL.NORMAL),

  /* almacenamiento */
  storage: def('red', 'storage', ['$op', 'ms', 'bytes', 'ok'], LEVEL.ACCIONES),
  codec: def('red', 'codec', ['$op', 'ms', 'bytesCrudo', 'bytesComprimido', 'bloques'], LEVEL.ACCIONES),

  /* sistema */
  arranque: def('sistema', 'arranque', [], LEVEL.ACCIONES),
  visibilidad: def('sistema', 'visibilidad', ['visible'], LEVEL.ACCIONES),
  foco: def('sistema', 'foco', ['tiene'], LEVEL.ACCIONES),
  nivelCaptura: def('sistema', 'nivel-captura', ['de', 'a'], LEVEL.ACCIONES),
  snapshot: def('sistema', 'snapshot', [], LEVEL.ACCIONES),

  /* degradación silenciosa: todo lo que hoy se pierde sin avisar */
  estado: def('vista', 'estado', ['$texto'], LEVEL.ACCIONES),
  limiteAlcanzado: def('error', 'limite-alcanzado', ['$donde', 'limite'], LEVEL.ACCIONES),
  descartado: def('error', 'descartado', ['$donde', 'cantidad', 'deTotal'], LEVEL.ACCIONES),
  historialPodado: def('edicion', 'historial.podado', ['profundidad', 'futuroPerdido'], LEVEL.ACCIONES),
  historialLimpiado: def('edicion', 'historial.limpiado', ['pasado', 'futuro', '$motivo'], LEVEL.ACCIONES),
  bloqueDesconocido: def('error', 'bloque-desconocido', ['$id'], LEVEL.ACCIONES),
  popupBloqueado: def('error', 'popup-bloqueado', ['$que'], LEVEL.ACCIONES),
  fueraDeLimites: def('error', 'fuera-de-limites', ['x', 'y', 'z', '$origen'], LEVEL.NORMAL),

  /* pre-declarados para los workstreams de specs/: se definen acá para que
     ninguno tenga que tocar este archivo compartido y puedan correr en paralelo */
  gestoTactil: def('gesto', 'gesto.tactil', ['$tipo', 'punteros', 'ms'], LEVEL.ACCIONES),
  tutorialPaso: def('vista', 'tutorial.paso', ['paso', 'total', '$resultado'], LEVEL.ACCIONES),
  generador: def('edicion', 'generador', ['$tipo', 'celdas', 'fueraDeGrilla', 'ms'], LEVEL.ACCIONES),
  plantilla: def('diseno', 'plantilla', ['$id', '$accion', 'celdas'], LEVEL.ACCIONES),
  iaPedido: def('red', 'ia.pedido', ['$modo', 'imagenes', 'largoPrompt'], LEVEL.ACCIONES),
  iaRespuesta: def('red', 'ia.respuesta', ['ms', 'pasos', 'tokensSalida'], LEVEL.ACCIONES),
  iaFallo: def('error', 'ia.fallo', ['$categoria', 'estado'], LEVEL.ACCIONES),
  iaMapeoBloque: def('error', 'ia.bloque-mapeado', ['$de', '$a'], LEVEL.ACCIONES),

  /* errores */
  excepcion: def('error', 'excepcion', [], LEVEL.ACCIONES),
  promesaRechazada: def('error', 'promesa-rechazada', [], LEVEL.ACCIONES),
  invariante: def('error', 'invariante', [], LEVEL.ACCIONES),
  fallo: def('error', 'fallo', ['$donde'], LEVEL.ACCIONES),
} as const
