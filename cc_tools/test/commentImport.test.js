import test from 'node:test';
import assert from 'node:assert/strict';
import { commentImageType, pairCommentFiles } from '../public/assets/comment-import.js';

const file = (name, text = '', size = 100) => ({ name, size, text });
const read = async (entry) => entry.text;

test('empareja cada .txt con la imagen del mismo nombre y ordena por nombre', async () => {
  const files = [
    file('comentario-10.txt', '¡Gracias!'), file('comentario-02.png'), file('comentario-01.TXT', '﻿ Buen diseño \n'),
    file('comentario-01.png'), file('comentario-02.txt', 'Muy original'), file('comentario-10.webp')
  ];
  const { items, skipped } = await pairCommentFiles(files, read);
  assert.deepEqual(items.map((item) => [item.name, item.text, item.image?.name || null]), [
    ['comentario-01.TXT', 'Buen diseño', 'comentario-01.png'],
    ['comentario-02.txt', 'Muy original', 'comentario-02.png'],
    ['comentario-10.txt', '¡Gracias!', 'comentario-10.webp']
  ]);
  assert.deepEqual(skipped, []);
});

test('un .txt sin imagen crea un comentario solo de texto', async () => {
  const { items } = await pairCommentFiles([file('solo.txt', 'Solo texto')], read);
  assert.equal(items[0].image, null);
});

test('omite imágenes sin texto, vacíos, duplicados, formatos no admitidos y textos ya existentes', async () => {
  const files = [
    file('a.txt', 'Gracias.'), file('b.txt', '   '), file('c.txt', 'gracias.'), file('d.png'),
    file('e.bmp'), file('f.txt', 'x'.repeat(1001)), file('g.txt', 'Nuevo'), file('g.jpg', '', 11 * 1024 * 1024)
  ];
  const { items, skipped } = await pairCommentFiles(files, read, [{ text: 'GRACIAS.' }]);
  assert.deepEqual(items.map((item) => [item.text, item.image]), [['Nuevo', null]]);
  const reasons = Object.fromEntries(skipped.map((entry) => [entry.name, entry.reason]));
  assert.match(reasons['a.txt'], /ya está en la biblioteca/);
  assert.match(reasons['b.txt'], /vacío/);
  assert.match(reasons['c.txt'], /ya está en la biblioteca/);
  assert.match(reasons['d.png'], /No hay un \.txt/);
  assert.match(reasons['e.bmp'], /Formato no admitido/);
  assert.match(reasons['f.txt'], /1000 caracteres/);
  assert.match(reasons['g.jpg'], /10 MB/);
});

test('deduce el tipo de imagen por la extensión', () => {
  assert.equal(commentImageType({ name: 'x.JPEG' }), 'image/jpeg');
  assert.equal(commentImageType({ name: 'x.webp' }), 'image/webp');
  assert.equal(commentImageType({ name: 'x.bmp' }), '');
});
