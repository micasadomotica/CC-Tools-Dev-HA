export const UPLOAD_CATEGORIES = [
  { category: 'Impresoras 3D', subcategories: ['Piezas de impresora 3D', 'Accesorios de impresora', 'Modelos de prueba', 'Otro'] },
  { category: 'Arte y diseño', subcategories: ['Arte digital', 'Esculturas y obras de arte', 'Insignias y monedas', 'Diseño industrial y prototipos', 'Otro'] },
  { category: 'Juguetes y juegos', subcategories: ['Juegos de mesa y de cartas', 'Juguetes de construcción', 'Accesorios de juego', 'Otro'] },
  { category: 'Aficiones y bricolaje', subcategories: ['Electrónica y RC (Radiocontrol)', 'Robots y mechas', 'Drones y aeronaves', 'Equipos de sonido y audio', 'Equipos deportivos y de ejercicio', 'Otro'] },
  { category: 'Hogar', subcategories: ['Decoraciones y ornamentos para el hogar', 'Iluminación y lámparas', 'Accesorios para electrodomésticos', 'Herramientas y repuestos', 'Mascotas', 'Otro'] },
  { category: 'Moda', subcategories: ['Cosplay', 'Joyería y accesorios', 'Ropa, zapatos y sombreros', 'Accesorios personales', 'Otro'] },
  { category: 'Educación', subcategories: ['Papelería y herramientas de aprendizaje', 'Ayudas educativas', 'Otro'] },
  { category: 'Miniaturas', subcategories: ['Personajes y criaturas', 'Juegos de miniaturas y accesorios', 'Accesorios y terrenos', 'Vehículos y maquinaria', 'Otro'] },
  { category: 'Medicina y salud', subcategories: ['Equipos médicos y de salud', 'Dispositivos de cuidado personal', 'Otro'] },
  { category: 'MakeNow', subcategories: ['MagicRelief', 'CubeMe', 'SnapForm', 'SignForge'] }
];
export const DEFAULT_UPLOAD_CATEGORY = Object.freeze({ category: 'Impresoras 3D', subcategory: 'Otro' });
const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
const aliases = new Map([
  ['impresora', 'impresoras 3d'], ['impresora 3d', 'impresoras 3d'],
  ['3d printer', 'impresoras 3d'], ['3d printers', 'impresoras 3d'],
  ['otros', 'otro'], ['other', 'otro'], ['others', 'otro'],
  ['juegos de construccion', 'juguetes de construccion']
]);
const key = value => aliases.get(normalize(value)) || normalize(value);

export function resolveUploadCategory(value = DEFAULT_UPLOAD_CATEGORY) {
  const parts = typeof value === 'string' ? value.split('/') : [value?.category, value?.subcategory];
  const parent = UPLOAD_CATEGORIES.find(entry => key(entry.category) === key(parts[0]));
  const child = parent?.subcategories.find(name => key(name) === key(parts[1]));
  if (parts.length !== 2 || !parent || !child) {
    throw Object.assign(new Error('CATEGORIA no válida. Usa Categoría / Subcategoría con una combinación del selector (por ejemplo, Impresoras 3D / Otro).'), { status: 400, code: 'UPLOAD_CATEGORY_INVALID' });
  }
  return { category: parent.category, subcategory: child };
}

export function uploadCategoryLabel(value) {
  const { category, subcategory } = resolveUploadCategory(value);
  return `${category} / ${subcategory}`;
}

export function uploadCategoryMatches(text, expected) {
  try { return uploadCategoryLabel(text) === uploadCategoryLabel(expected); }
  catch { return false; }
}

export function uploadCategoryTextPattern(name) {
  const names = [normalize(name), ...[...aliases].filter(([, target]) => target === normalize(name)).map(([alias]) => alias)];
  const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/a/g, '[aá]').replace(/e/g, '[eé]').replace(/i/g, '[ií]').replace(/o/g, '[oó]').replace(/u/g, '[uú]').replace(/n/g, '[nñ]').replace(/ /g, '\\s+');
  return new RegExp(`^\\s*(?:${names.map(escape).join('|')})\\s*$`, 'i');
}
