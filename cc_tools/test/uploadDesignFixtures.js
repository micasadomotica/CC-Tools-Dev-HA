import fs from 'node:fs/promises';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import yazl from 'yazl';

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
export function png(width = 120, height = 90) {
  const chunk = (type, content) => {
    const header = Buffer.alloc(8), crc = Buffer.alloc(4);
    header.writeUInt32BE(content.length); header.write(type, 4);
    crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), content])));
    return Buffer.concat([header, content, crc]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = y * (width * 3 + 1) + 1 + x * 3;
    rows[offset] = 22 + Math.floor(x * 60 / width); rows[offset + 1] = 120 + Math.floor(y * 90 / height); rows[offset + 2] = 96;
  }
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}
export async function modelZip(name, profile = true) {
  const zip = new yazl.ZipFile(), chunks = [];
  zip.addBuffer(Buffer.from('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>'), '[Content_Types].xml');
  zip.addBuffer(Buffer.from('<Relationships><Relationship Target="/3D/3dmodel.model"/></Relationships>'), '_rels/.rels');
  zip.addBuffer(Buffer.from(`<model xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><metadata name="Title">${name}</metadata><resources/><build/></model>`), '3D/3dmodel.model');
  if (profile) zip.addBuffer(Buffer.from('{}'), 'Metadata/project_settings.config');
  const result = new Promise((resolve, reject) => {
    zip.outputStream.on('data', data => chunks.push(data)); zip.outputStream.on('end', () => resolve(Buffer.concat(chunks))); zip.outputStream.on('error', reject);
  });
  zip.end(); return result;
}
export async function addModel(root, name, { profile = true, width = 120, height = 90, info, model } = {}) {
  const dir = path.join(root, name); await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${name}.3mf`), model || await modelZip(name, profile));
  await fs.writeFile(path.join(dir, 'portada.png'), png(width, height));
  await fs.writeFile(path.join(dir, 'info.txt'), info ?? `ETIQUETAS:\ncaja, organizador\n\nDESCRIPCION:\nDiseño ${name} para organizar pequeños componentes.\n\nImprimir con una altura de capa de 0,2 mm.`);
  return dir;
}
