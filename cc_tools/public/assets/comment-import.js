// Pairs the files chosen in "Importar comentarios": each .txt is one comment and
// an image with the same name (any of the allowed extensions) is attached to it.
export const COMMENT_IMAGE_TYPES = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp'
};
export const COMMENT_TEXT_MAX_LENGTH = 1000;
export const COMMENT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

function splitName(name = '') {
  const base = String(name).split(/[\\/]/).pop();
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return { key: base.toLowerCase(), extension: '' };
  return { key: base.slice(0, dot).trim().toLowerCase(), extension: base.slice(dot + 1).toLowerCase() };
}

function sameText(a = '', b = '') {
  return String(a).replace(/\s+/g, ' ').trim().toLowerCase() === String(b).replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * @param {{name: string, size?: number, type?: string}[]} files Selected files.
 * @param {(file) => Promise<string>} readText Reads a .txt file as UTF-8.
 * @param {{text: string}[]} existing Comments already in the library.
 * @returns {{items: {key, name, text, image}[], skipped: {name, reason}[]}}
 */
export async function pairCommentFiles(files = [], readText, existing = []) {
  const texts = new Map();
  const images = new Map();
  const skipped = [];
  for (const file of files) {
    const { key, extension } = splitName(file.name);
    if (extension === 'txt') {
      if (texts.has(key)) skipped.push({ name: file.name, reason: 'Hay otro .txt con el mismo nombre.' });
      else texts.set(key, file);
    } else if (COMMENT_IMAGE_TYPES[extension]) {
      if (images.has(key)) skipped.push({ name: file.name, reason: 'Hay otra imagen con el mismo nombre.' });
      else images.set(key, file);
    } else {
      skipped.push({ name: file.name, reason: 'Formato no admitido. Usa .txt y JPG, PNG, GIF o WebP.' });
    }
  }

  const items = [];
  const seenTexts = [...existing.map((comment) => comment.text)];
  for (const key of [...texts.keys()].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))) {
    const file = texts.get(key);
    const text = String(await readText(file) || '').replace(/^﻿/, '').trim();
    const image = images.get(key) || null;
    images.delete(key);
    if (!text) { skipped.push({ name: file.name, reason: 'El archivo está vacío.' }); continue; }
    if (text.length > COMMENT_TEXT_MAX_LENGTH) {
      skipped.push({ name: file.name, reason: `Supera ${COMMENT_TEXT_MAX_LENGTH} caracteres.` });
      continue;
    }
    if (seenTexts.some((value) => sameText(value, text))) {
      skipped.push({ name: file.name, reason: 'Ese texto ya está en la biblioteca.' });
      continue;
    }
    if (image && Number(image.size) > COMMENT_IMAGE_MAX_BYTES) {
      skipped.push({ name: image.name, reason: 'La imagen supera 10 MB; se importa solo el texto.' });
      items.push({ key, name: file.name, text, image: null });
    } else {
      items.push({ key, name: file.name, text, image });
    }
    seenTexts.push(text);
  }
  for (const image of images.values()) {
    skipped.push({ name: image.name, reason: 'No hay un .txt con el mismo nombre.' });
  }
  return { items, skipped };
}

export function commentImageType(file) {
  return COMMENT_IMAGE_TYPES[splitName(file?.name).extension] || '';
}
