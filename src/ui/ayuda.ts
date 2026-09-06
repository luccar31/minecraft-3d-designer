/**
 * Catálogo de ayuda contextual. Un texto, tres usos: el tooltip (`Tip.tsx`),
 * el panel de atajos y el tutorial leen todos de acá.
 */

export type HelpGroup =
  | 'tools'
  | 'view'
  | 'mirror'
  | 'edit'
  | 'file'
  | 'palette'
  | 'designs'
  | 'guide'
  | 'mouse'
  | 'debug'

export type HelpEntry = {
  /** Nombre del control, para listarlo fuera de su contexto visual. */
  titulo: string
  /** Qué hace. Una línea. */
  que: string
  /** El gesto o el flujo: cómo se usa de verdad. */
  como: string
  /** Combinaciones equivalentes, una por elemento, ya listas para `<kbd>`. */
  atajo?: string[]
  grupo: HelpGroup
}

// Los campos van en español: son texto visible, no identificadores.

export const GROUPS: { key: HelpGroup; label: string }[] = [
  { key: 'tools', label: 'Herramientas' },
  { key: 'view', label: 'Vista' },
  { key: 'mirror', label: 'Simetría' },
  { key: 'edit', label: 'Editar' },
  { key: 'file', label: 'Archivo' },
  { key: 'palette', label: 'Paleta' },
  { key: 'designs', label: 'Diseños' },
  { key: 'guide', label: 'Guía y materiales' },
  { key: 'mouse', label: 'Mouse' },
  { key: 'debug', label: 'Diagnóstico' },
]

/* ── catálogo ────────────────────────────────────────────────────────── */

export const HELP = {
  /* barra superior */

  'topbar.name': {
    titulo: 'Nombre del diseño',
    que: 'El nombre con el que se guarda y el título que sale impreso en la guía.',
    como: 'Escribí encima; se aplica al toque, sin confirmar nada.',
    grupo: 'file',
  },
  'topbar.designs': {
    titulo: 'Diseños',
    que: 'Abre la lista de diseños guardados y el formulario para crear uno nuevo.',
    como: 'También es donde cambiás el tamaño de la grilla y entrás a la nube.',
    grupo: 'designs',
  },
  'topbar.save': {
    titulo: 'Guardar',
    que: 'Guarda el diseño abierto donde diga el chip: este navegador o tu cuenta.',
    como: 'Sobrescribe el mismo diseño; para tener dos versiones creá uno nuevo desde Diseños.',
    atajo: ['Ctrl+S'],
    grupo: 'file',
  },
  'topbar.undo': {
    titulo: 'Deshacer',
    que: 'Revierte la última edición de bloques.',
    como: 'Un trazo arrastrado cuenta como una sola acción, no como un bloque por vez.',
    atajo: ['Ctrl+Z'],
    grupo: 'edit',
  },
  'topbar.redo': {
    titulo: 'Rehacer',
    que: 'Vuelve a aplicar lo último que deshiciste.',
    como: 'Se pierde apenas editás algo nuevo después de deshacer.',
    atajo: ['Ctrl+Shift+Z'],
    grupo: 'edit',
  },
  'topbar.viewEdit': {
    titulo: 'Editar',
    que: 'Vuelve al editor 3D, donde se ponen los bloques.',
    como: 'Cambiar de vista no toca el diseño: está todo como lo dejaste.',
    grupo: 'view',
  },
  'topbar.viewGuide': {
    titulo: 'Guía',
    que: 'Muestra el plano de construcción: una lámina por capa con el código de cada bloque.',
    como: 'Es la vista para tener al lado mientras construís adentro del juego.',
    grupo: 'view',
  },
  'topbar.printGuide': {
    titulo: 'Imprimir guía',
    que: 'Abre la guía completa en una pestaña nueva, armada para papel.',
    como: 'Desde el diálogo de impresión elegí "Guardar como PDF" si la querés en el celular.',
    grupo: 'file',
  },
  'topbar.exportJson': {
    titulo: 'Exportar JSON',
    que: 'Descarga el diseño como archivo .mcbp.json, con la grilla y la paleta adentro.',
    como: 'Es el formato para copia de seguridad o para pasárselo a otra persona; vuelve con Importar.',
    grupo: 'file',
  },
  'topbar.exportSchem': {
    titulo: 'Exportar .schem',
    que: 'Descarga un .schem que se puede pegar directo en el mundo de Minecraft.',
    como: 'Cargalo con WorldEdit o Litematica. Es de ida: el .schem no se vuelve a importar acá.',
    grupo: 'file',
  },
  'topbar.import': {
    titulo: 'Importar',
    que: 'Carga un .mcbp.json y reemplaza el diseño que tengas abierto.',
    como: 'Elegí el archivo en el diálogo. Guardá antes: lo abierto se pierde sin aviso.',
    grupo: 'file',
  },
  'topbar.storage': {
    titulo: 'Dónde se guarda',
    que: 'Dice si los diseños quedan en este navegador o sincronizados en tu cuenta.',
    como: 'Marca "este navegador" hasta que inicies sesión desde Diseños → Nube.',
    grupo: 'file',
  },

  /* herramientas */

  'tool.brush': {
    titulo: 'Pincel',
    que: 'Coloca el bloque activo pegado a la cara que apuntás.',
    como: 'Click para uno solo, arrastrar para pintar varios seguidos.',
    atajo: ['B'],
    grupo: 'tools',
  },
  'tool.eraser': {
    titulo: 'Goma',
    que: 'Saca el bloque que apuntás.',
    como: 'Arrastrá para borrar en fila. Con cualquier herramienta, Shift+click hace lo mismo.',
    atajo: ['E'],
    grupo: 'tools',
  },
  'tool.picker': {
    titulo: 'Cuentagotas',
    que: 'Adopta como bloque activo el del cubo que toques.',
    como: 'Click sobre el bloque a copiar. Alt+click hace lo mismo sin salir del pincel.',
    atajo: ['I'],
    grupo: 'tools',
  },
  'tool.line': {
    titulo: 'Línea',
    que: 'Traza una línea recta de bloques entre dos puntos.',
    como: 'Click en el inicio y click en el final. Sólo en modo capa; Esc cancela el primer punto.',
    atajo: ['L'],
    grupo: 'tools',
  },
  'tool.rect': {
    titulo: 'Rectángulo',
    que: 'Dibuja un rectángulo entre dos esquinas, macizo o sólo el borde.',
    como: 'Click en una esquina y click en la opuesta. Sólo en modo capa.',
    atajo: ['R'],
    grupo: 'tools',
  },
  'tool.fill': {
    titulo: 'Relleno',
    que: 'Llena de una toda el área contigua que tenga el mismo contenido.',
    como: 'Click adentro del área. Sólo en modo capa, y se frena en el borde de la capa.',
    atajo: ['F'],
    grupo: 'tools',
  },
  'tool.select': {
    titulo: 'Selección',
    que: 'Marca un rectángulo de la capa para copiar, cortar o borrar.',
    como: 'Click en una esquina y click en la opuesta. Sólo en modo capa.',
    atajo: ['S'],
    grupo: 'tools',
  },
  'tool.rectFilled': {
    titulo: 'Relleno o contorno',
    que: 'Elige si el rectángulo sale macizo o si sólo se dibuja el borde.',
    como: 'Alterna entre las dos opciones; el botón muestra la que está puesta ahora.',
    grupo: 'tools',
  },

  /* modo capa */

  'slice.off': {
    titulo: 'Modo 3D',
    que: 'Muestra la construcción entera, sin recortar nada.',
    como: 'Es el modo para mirar. Línea, rectángulo, relleno y selección necesitan modo capa.',
    atajo: ['1'],
    grupo: 'view',
  },
  'slice.below': {
    titulo: 'Hasta acá',
    que: 'Esconde todo lo que esté por encima de la capa actual.',
    como: 'Sirve para trabajar el piso de arriba viendo lo que ya construiste abajo.',
    atajo: ['2'],
    grupo: 'view',
  },
  'slice.isolate': {
    titulo: 'Sólo capa',
    que: 'Muestra únicamente la capa actual, como una hoja cuadriculada.',
    como: 'El modo más preciso para dibujar planta por planta.',
    atajo: ['3'],
    grupo: 'view',
  },
  'slice.axisY': {
    titulo: 'Eje Y',
    que: 'Corta en capas horizontales: cada capa es un piso.',
    como: 'Es el eje que usa la guía impresa. Si dudás, empezá por acá.',
    grupo: 'view',
  },
  'slice.axisX': {
    titulo: 'Eje X',
    que: 'Corta en rebanadas verticales de este a oeste.',
    como: 'Cómodo para levantar paredes y mirar el perfil del edificio.',
    grupo: 'view',
  },
  'slice.axisZ': {
    titulo: 'Eje Z',
    que: 'Corta en rebanadas verticales de norte a sur.',
    como: 'Cómodo para trabajar una fachada mirándola de frente.',
    grupo: 'view',
  },
  'slice.index': {
    titulo: 'Capa activa',
    que: 'Elige qué capa del eje elegido estás editando.',
    como: 'Arrastrá el control, o usá las flechas del teclado con el foco fuera de un campo.',
    atajo: ['↑', '↓', 'RePág', 'AvPág'],
    grupo: 'view',
  },
  'slice.up': {
    titulo: 'Subir una capa',
    que: 'Pasa a la capa siguiente del eje elegido.',
    como: 'Se frena en la última capa de la grilla.',
    atajo: ['↑', 'AvPág'],
    grupo: 'view',
  },
  'slice.down': {
    titulo: 'Bajar una capa',
    que: 'Vuelve a la capa anterior del eje elegido.',
    como: 'Se frena en la capa 0.',
    atajo: ['↓', 'RePág'],
    grupo: 'view',
  },

  /* simetría */

  'mirror.x': {
    titulo: 'Espejo X',
    que: 'Cada bloque que pongas se duplica del otro lado del centro en X.',
    como: 'Dejalo prendido mientras construís: no espeja lo que ya estaba puesto.',
    atajo: ['X'],
    grupo: 'mirror',
  },
  'mirror.z': {
    titulo: 'Espejo Z',
    que: 'Cada bloque que pongas se duplica del otro lado del centro en Z.',
    como: 'Prendé los dos espejos juntos para simetría en cruz.',
    atajo: ['Z'],
    grupo: 'mirror',
  },

  /* selección y portapapeles */

  'selection.copy': {
    titulo: 'Copiar',
    que: 'Copia los bloques de la selección al portapapeles interno.',
    como: 'Después pegá con Ctrl+V apuntando la capa destino.',
    atajo: ['Ctrl+C'],
    grupo: 'edit',
  },
  'selection.cut': {
    titulo: 'Cortar',
    que: 'Copia la selección y la borra de la capa.',
    como: 'Igual que copiar, pero deja el hueco. Se pega con Ctrl+V.',
    atajo: ['Ctrl+X'],
    grupo: 'edit',
  },
  'selection.paste': {
    titulo: 'Pegar',
    que: 'Pega lo copiado tomando el cursor como esquina.',
    como: 'Poné el puntero sobre la capa destino y apretá Ctrl+V. Sin puntero sobre la grilla no pega.',
    atajo: ['Ctrl+V'],
    grupo: 'edit',
  },
  'selection.delete': {
    titulo: 'Borrar selección',
    que: 'Vacía todos los bloques que estén adentro del rectángulo marcado.',
    como: 'Se deshace con Ctrl+Z como cualquier otra edición.',
    atajo: ['Supr', 'Retroceso'],
    grupo: 'edit',
  },
  'selection.clear': {
    titulo: 'Quitar selección',
    que: 'Suelta el rectángulo marcado sin tocar ningún bloque.',
    como: 'Esc también cancela el primer click pendiente de línea o rectángulo.',
    atajo: ['Esc'],
    grupo: 'edit',
  },

  /* cámara y viewport */

  'view.fit': {
    titulo: 'Centrar',
    que: 'Mueve la cámara para que entre toda la construcción en pantalla.',
    como: 'Es la salida cuando te perdiste orbitando o abriste un diseño grande.',
    atajo: ['C'],
    grupo: 'view',
  },
  'view.grid': {
    titulo: 'Grilla',
    que: 'Muestra u oculta las líneas del piso y el contorno de la grilla.',
    como: 'Apagala para mirar el resultado limpio; no cambia nada de lo que se exporta.',
    atajo: ['G'],
    grupo: 'view',
  },

  /* paleta */

  'palette.current': {
    titulo: 'Bloque activo',
    que: 'El bloque que van a colocar el pincel y las herramientas de área.',
    como: 'Cambialo eligiendo otro de la grilla, o con el cuentagotas sobre algo ya construido.',
    grupo: 'palette',
  },
  'palette.search': {
    titulo: 'Buscar bloque',
    que: 'Filtra la paleta por nombre o por id de Minecraft.',
    como: 'Escribí parte del nombre ("roble") o del id ("oak"). Se suma al filtro de categoría.',
    grupo: 'palette',
  },
  'palette.catAll': {
    titulo: 'Todos',
    que: 'Saca el filtro de categoría y muestra la paleta completa.',
    como: 'Combinalo con el buscador cuando no sabés en qué categoría cae el bloque.',
    grupo: 'palette',
  },
  'palette.catStone': {
    titulo: 'Piedra',
    que: 'Deja a la vista piedra, adoquín, ladrillo de piedra y derivados.',
    como: 'Es la categoría de estructura: cimientos, muros, torres.',
    grupo: 'palette',
  },
  'palette.catWood': {
    titulo: 'Madera',
    que: 'Deja a la vista troncos y tablas de cada tipo de árbol.',
    como: 'La categoría de pisos, vigas y techos.',
    grupo: 'palette',
  },
  'palette.catNature': {
    titulo: 'Naturaleza',
    que: 'Deja a la vista pasto, tierra, arena, grava y hojas.',
    como: 'Para el terreno y el jardín alrededor de la construcción.',
    grupo: 'palette',
  },
  'palette.catWool': {
    titulo: 'Lana',
    que: 'Deja a la vista las dieciséis lanas de color.',
    como: 'La forma más barata de meter color; ojo que la lana se prende fuego.',
    grupo: 'palette',
  },
  'palette.catConcrete': {
    titulo: 'Concreto',
    que: 'Deja a la vista los concretos de color, planos y sin veteado.',
    como: 'El color liso para fachadas modernas, y no arde como la lana.',
    grupo: 'palette',
  },
  'palette.catDecorative': {
    titulo: 'Decorativo',
    que: 'Deja a la vista vidrio, cuarzo, obsidiana y demás bloques de detalle.',
    como: 'Para ventanas, molduras y remates.',
    grupo: 'palette',
  },
  'palette.block': {
    titulo: 'Bloque de la paleta',
    que: 'Lo vuelve el bloque activo con el que vas a pintar.',
    como: 'Un click alcanza. El nombre y el id de Minecraft salen en su ayuda.',
    grupo: 'palette',
  },

  /* panel de diseños */

  'designs.name': {
    titulo: 'Nombre del diseño nuevo',
    que: 'El nombre que va a llevar el diseño que crees con el botón Crear.',
    como: 'No renombra el diseño abierto: para eso está el campo de la barra de arriba.',
    grupo: 'designs',
  },
  'designs.dimX': {
    titulo: 'Ancho (X)',
    que: 'Cuántos bloques mide la grilla de este a oeste.',
    como: 'Vale tanto para Crear como para Redimensionar. Máximo 256.',
    grupo: 'designs',
  },
  'designs.dimY': {
    titulo: 'Alto (Y)',
    que: 'Cuántas capas de altura tiene la grilla, o sea cuántos pasos va a tener la guía.',
    como: 'Vale tanto para Crear como para Redimensionar. Máximo 256.',
    grupo: 'designs',
  },
  'designs.dimZ': {
    titulo: 'Largo (Z)',
    que: 'Cuántos bloques mide la grilla de norte a sur.',
    como: 'Vale tanto para Crear como para Redimensionar. Máximo 256.',
    grupo: 'designs',
  },
  'designs.create': {
    titulo: 'Crear',
    que: 'Abre un diseño vacío con el nombre y las medidas de arriba.',
    como: 'Reemplaza lo que tengas abierto. Guardá antes si te importa.',
    grupo: 'designs',
  },
  'designs.resize': {
    titulo: 'Redimensionar el actual',
    que: 'Cambia la grilla del diseño abierto a las medidas de arriba.',
    como: 'Los bloques que queden fuera del tamaño nuevo se descartan.',
    grupo: 'designs',
  },
  'designs.open': {
    titulo: 'Abrir',
    que: 'Carga ese diseño guardado en el editor.',
    como: 'Reemplaza lo que tengas abierto sin preguntar.',
    grupo: 'designs',
  },
  'designs.delete': {
    titulo: 'Borrar diseño',
    que: 'Elimina ese diseño de la lista, para siempre.',
    como: 'Ctrl+Z no lo trae de vuelta. Exportá a JSON antes si querés una copia.',
    grupo: 'designs',
  },
  'designs.close': {
    titulo: 'Cerrar',
    que: 'Cierra el panel y vuelve al editor.',
    como: 'Un click fuera del panel hace lo mismo. Nada de lo que hiciste acá se pierde.',
    grupo: 'designs',
  },
  'auth.email': {
    titulo: 'Email para la nube',
    que: 'La dirección a la que se manda el link de acceso.',
    como: 'No hay contraseña: llega un link y con abrirlo quedás adentro.',
    grupo: 'designs',
  },
  'auth.send': {
    titulo: 'Enviar link',
    que: 'Manda el link de acceso al email de al lado.',
    como: 'Abrilo en este mismo navegador; recién ahí los diseños pasan a guardarse en tu cuenta.',
    grupo: 'designs',
  },
  'auth.signOut': {
    titulo: 'Salir',
    que: 'Cierra la sesión de la nube en este navegador.',
    como: 'Los diseños de la cuenta dejan de verse; los de este navegador siguen donde estaban.',
    grupo: 'designs',
  },

  /* guía y materiales */

  'guide.print': {
    titulo: 'Imprimir / PDF',
    que: 'Abre la guía entera en una pestaña armada para papel.',
    como: 'Elegí "Guardar como PDF" en el diálogo del navegador para llevarla en el celular.',
    grupo: 'guide',
  },
  'guide.prev': {
    titulo: 'Paso anterior',
    que: 'Vuelve a la capa anterior de la guía.',
    como: 'Se deshabilita cuando ya estás en el primer paso.',
    grupo: 'guide',
  },
  'guide.next': {
    titulo: 'Paso siguiente',
    que: 'Avanza a la capa siguiente de la guía.',
    como: 'Se deshabilita cuando ya estás en el último paso.',
    grupo: 'guide',
  },
  'guide.steps': {
    titulo: 'Tira de pasos',
    que: 'Salta directo a cualquier capa de la guía.',
    como: 'Cada botón es un paso; los que muestran dos alturas son capas idénticas agrupadas.',
    grupo: 'guide',
  },
  'guide.back': {
    titulo: 'Ir al editor',
    que: 'Vuelve al editor 3D para empezar a poner bloques.',
    como: 'Aparece cuando la guía está vacía porque el diseño todavía no tiene nada.',
    grupo: 'guide',
  },
  'panel.materials': {
    titulo: 'Materiales',
    que: 'Cuenta cuántos bloques de cada tipo lleva el diseño, ordenados por cantidad.',
    como: 'Es la lista de compras. La guía impresa repite el total convertido a stacks.',
    grupo: 'guide',
  },

  /* mouse */

  'canvas.place': {
    titulo: 'Colocar bloque',
    que: 'Pone el bloque activo pegado a la cara que apuntás.',
    como: 'Click izquierdo, sobre el piso de la grilla o sobre un bloque ya puesto.',
    atajo: ['Click'],
    grupo: 'mouse',
  },
  'canvas.erase': {
    titulo: 'Borrar apuntando',
    que: 'Saca el bloque que estés apuntando, sea cual sea la herramienta.',
    como: 'Shift+click. Es el atajo para no cambiar de herramienta por un bloque suelto.',
    atajo: ['Shift+click'],
    grupo: 'mouse',
  },
  'canvas.pick': {
    titulo: 'Copiar el bloque apuntado',
    que: 'Vuelve bloque activo el que estés apuntando.',
    como: 'Alt+click, sin salir de la herramienta que tengas puesta.',
    atajo: ['Alt+click'],
    grupo: 'mouse',
  },
  'canvas.paint': {
    titulo: 'Pintar arrastrando',
    que: 'Coloca o borra en fila mientras movés el puntero apretado.',
    como: 'Mantené apretado y arrastrá. Todo el trazo se deshace de una con Ctrl+Z.',
    atajo: ['Arrastrar'],
    grupo: 'mouse',
  },
  'canvas.orbit': {
    titulo: 'Orbitar la cámara',
    que: 'Gira la vista alrededor de la construcción.',
    como: 'Arrastrá sobre el fondo vacío. Si arrancás sobre un bloque, pintás en vez de girar.',
    atajo: ['Arrastrar en el vacío'],
    grupo: 'mouse',
  },
  'canvas.pan': {
    titulo: 'Desplazar la cámara',
    que: 'Corre el centro de la vista sin girarla.',
    como: 'Arrastrá con el botón derecho.',
    atajo: ['Botón derecho'],
    grupo: 'mouse',
  },
  'canvas.zoom': {
    titulo: 'Acercar y alejar',
    que: 'Acerca o aleja la cámara del centro de la vista.',
    como: 'Rueda del mouse. Si te fuiste muy lejos, Centrar vuelve a encuadrar todo.',
    atajo: ['Rueda'],
    grupo: 'mouse',
  },

  /* diagnóstico */

  'debug.panel': {
    titulo: 'Telemetría',
    que: 'Abre el panel de diagnóstico con los últimos eventos que registró la app.',
    como: 'Ctrl+Shift+D lo abre y lo cierra. Sirve para reportar bugs, no para construir.',
    atajo: ['Ctrl+Shift+D'],
    grupo: 'debug',
  },
} satisfies Record<string, HelpEntry>

/* ── lectura ─────────────────────────────────────────────────────────── */

export type HelpId = keyof typeof HELP

const CATALOG: Record<string, HelpEntry> = HELP

export const HELP_IDS = Object.keys(HELP) as HelpId[]

/** Acceso con id tipado: un id que no existe no compila. */
export const helpFor = (id: HelpId): HelpEntry => HELP[id]

/** Acceso con id suelto, para el panel de atajos, que marca lo que falta. */
export const lookupHelp = (id: string): HelpEntry | undefined => CATALOG[id]

export const helpByGroup = (grupo: HelpGroup): [HelpId, HelpEntry][] =>
  HELP_IDS.filter((id) => CATALOG[id].grupo === grupo).map((id) => [id, CATALOG[id]])

/** Los atajos equivalentes en una línea: `['↑','AvPág']` → `↑ o AvPág`. */
export const shortcutLabel = (e: HelpEntry): string => (e.atajo ?? []).join(' o ')

/** La ayuda entera en una línea, que es lo que muestra el tooltip. */
export const helpLine = (e: HelpEntry): string => {
  const tail = e.atajo?.length ? `${shortcutLabel(e)} · ${e.como}` : e.como
  return `${e.titulo} — ${e.que} ${tail}`
}

/** Filtra por nombre, texto o tecla; el buscador del panel de atajos. */
export const searchHelp = (q: string): [HelpId, HelpEntry][] => {
  const needle = q.trim().toLowerCase()
  if (!needle) return HELP_IDS.map((id) => [id, CATALOG[id]])
  return HELP_IDS
    .filter((id) => {
      const e = CATALOG[id]
      return (
        id.toLowerCase().includes(needle) ||
        e.titulo.toLowerCase().includes(needle) ||
        e.que.toLowerCase().includes(needle) ||
        e.como.toLowerCase().includes(needle) ||
        shortcutLabel(e).toLowerCase().includes(needle)
      )
    })
    .map((id) => [id, CATALOG[id]])
}
