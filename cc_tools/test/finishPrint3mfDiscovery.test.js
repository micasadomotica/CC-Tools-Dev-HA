import test from 'node:test';
import assert from 'node:assert/strict';
import { parse3mfProjects, projectMatchesPrinter } from '../src/finishPrintDiscovery.js';

// Shape of /api/cxy/v3/model/flowSlicerList as seen on 2026-11-28 (trimmed).
const response = {
  code: 0,
  result: {
    count: 3,
    list: [
      { id: 'a1', title: 'Bed+Level+Test+(Scalable).3mf', printerName: 'Ender-3 V3', printerInternalName: 'F001',
        officialProcessName: '0.20mm Standard @Creality Ender-3 V3 0.4 nozzle', coverPic: 'https://pic/a.png',
        uploadFileKey: 'generate3mf/3mf/a.3mf', originFileKey: 'model/a.3mf', generate3mfStatus: 2, lastModifyTime: 1795863440 },
      { id: 'b2', title: 'Tapa_C3_Sharp_M3.3mf', printerName: 'Creality Ender-3 V3', printerInternalName: '',
        officialProcessName: '0.20mm Standard @Creality Ender-3 V3 0.4 nozzle', uploadFileKey: 'model/b.3mf', generate3mfStatus: 0, createTime: 1795858181 },
      { id: 'c3', title: 'K1.3mf', printerName: 'Creality K1', printerInternalName: 'CR-K1', generate3mfStatus: 2 },
      { id: 'a1', title: 'Duplicate.3mf' },
      { id: '', title: 'Sin id.3mf' }
    ]
  }
};

test('parses Galería de Proyectos records', () => {
  const projects = parse3mfProjects([response]);
  assert.deepEqual(projects.map((project) => project.id), ['a1', 'b2', 'c3']);
  assert.deepEqual(projects[0], {
    id: 'a1', name: 'Bed+Level+Test+(Scalable).3mf', kind: '3mf', printerName: 'Ender-3 V3', printerInternalName: 'F001',
    processName: '0.20mm Standard @Creality Ender-3 V3 0.4 nozzle', coverUrl: 'https://pic/a.png',
    fileKey: 'generate3mf/3mf/a.3mf', generated: true, updatedAt: 1795863440
  });
  assert.equal(projects[1].generated, false);
  assert.equal(projects[1].updatedAt, 1795858181);
});

test('keeps only projects for the printer model', () => {
  const printer = { printerInterName: 'F001', model: 'Ender-3 V3' };
  const matching = parse3mfProjects([response]).filter((project) => projectMatchesPrinter(project, printer));
  assert.deepEqual(matching.map((project) => project.id), ['a1', 'b2']);
  assert.equal(projectMatchesPrinter({ printerName: 'Creality Ender-3 V3' }, { model: 'Ender-3  V3' }), true);
  assert.equal(projectMatchesPrinter({ printerName: 'Ender-3 V3 SE' }, { model: 'Ender-3 V3' }), false);
  assert.equal(projectMatchesPrinter({ printerName: 'Ender-3 V3' }, {}), false);
});
