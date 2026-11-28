import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { isCxyGen2Printer, refreshProfilesFromPrinters } from '../public/assets/finish-print-printers.js';

const PROJECT_GALLERY_URL = 'https://www.crealitycloud.com/es/flowslicer/project?tab=project';

function functionsFrom(file, names) {
  const source = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
  return names.map((name) => {
    const start = source.search(new RegExp('(?:async )?function ' + name + '\\('));
    assert.ok(start >= 0, name);
    const next = source.slice(start + 1).search(/\n(?:export )?(?:async )?function /);
    return source.slice(start, next < 0 ? undefined : start + 1 + next);
  }).join('\n');
}

test('detects cxy-gen2 printers from the stored model name', () => {
  assert.equal(isCxyGen2Printer({ printerInterName: 'Ender-3 V3' }), true);
  assert.equal(isCxyGen2Printer({ printerInterName: 'Ender-3 V3 SE' }), true);
  assert.equal(isCxyGen2Printer({ printerInterName: 'Ender-3 V3 KE' }), true);
  assert.equal(isCxyGen2Printer({ printerInterName: '', model: 'K1 Max' }), true);
  assert.equal(isCxyGen2Printer({ model: 'K2 Plus' }), true);
  assert.equal(isCxyGen2Printer({ printerInterName: 'Ender-3' }), false);
  assert.equal(isCxyGen2Printer({ printerInterName: 'Ender-3 V2' }), false);
  assert.equal(isCxyGen2Printer({ printerInterName: 'Classic', deviceType: 5 }), false);
  assert.equal(isCxyGen2Printer({}), false);
});

test('refreshes saved profile metadata after the printer model changes', () => {
  const profiles = [
    { id: 'a', printerName: 'HA Ender-3', printerDeviceId: '42', printerInterName: 'Ender-3', printerDeviceType: 5, cloudFiles: ['x.gcode'] },
    { id: 'b', printerName: 'Otra', printerDeviceId: '7', printerInterName: 'K1', printerDeviceType: 9 }
  ];
  const printers = [{ name: 'HA Ender-3', deviceId: '42', deviceName: 'dn-42', printerInterName: 'Ender-3 V3', deviceType: 5, model: 'Ender-3 V3' }];
  const [first, second] = refreshProfilesFromPrinters(profiles, printers);
  assert.equal(first.printerInterName, 'Ender-3 V3');
  assert.equal(first.printerDeviceName, 'dn-42');
  assert.deepEqual(first.cloudFiles, ['x.gcode']);
  assert.equal(second, profiles[1]);
});

test('Mis impresoras and the user menu link to the Projects gallery', () => {
  const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const menu = html.slice(html.indexOf('id="creality-user-menu"'), html.indexOf('id="creality-menu-settings"'));
  assert.match(menu, /href="https:\/\/www\.crealitycloud\.com\/es\/flowslicer\/project\?tab=project" target="_blank" rel="noopener noreferrer">.*<span>Galería de Proyectos<\/span>/);
  const status = html.slice(html.indexOf('id="finish-printer-status-section"'), html.indexOf('id="finish-printer-status-list"'));
  const gcode = status.indexOf('title="Abrir Galería de GCODE"');
  const projects = status.indexOf('title="Abrir Galería de Proyectos"');
  assert.ok(gcode > 0 && projects > gcode, 'Projects button follows the GCODE gallery button');
  assert.ok(status.includes(`href="${PROJECT_GALLERY_URL}" target="_blank" rel="noopener noreferrer" title="Abrir Galería de Proyectos" aria-label="Abrir Galería de Proyectos en una pestaña nueva"`));
});

test('Buscar 3MF appears next to Buscar GCODE only for cxy-gen2 printers', () => {
  const context = vm.createContext({
    isCxyGen2Printer,
    state: { finishPrintDiscovery: { printers: [{ name: 'Nueva', deviceId: '9', model: 'Ender-3 V3' }] } },
    escapeHtml: (value) => String(value ?? ''),
    finishFileOptionMarkup: () => ''
  });
  vm.runInContext(functionsFrom('../public/assets/app.js', ['finishProfileSupports3mf', 'finishPrinterProfileMarkup']), context);
  const markup = (profile) => context.finishPrinterProfileMarkup({ id: 'p', cloudFiles: [], ...profile });

  const gen2 = markup({ printerName: 'HA Ender-3', printerInterName: 'Ender-3 V3' });
  assert.ok(gen2.indexOf('data-finish-profile-action="discover-3mf"') > gen2.indexOf('data-finish-profile-action="discover-files"'));
  assert.match(gen2, /<span>Buscar 3MF<\/span>/);

  // Saved profile still has the old model, but the fresh discovery says Ender-3 V3.
  assert.match(markup({ printerName: 'Nueva', printerDeviceId: '9', printerInterName: 'Ender-3' }), /Buscar 3MF/);

  const classic = markup({ printerName: 'Clásica', printerInterName: 'Ender-3' });
  assert.match(classic, /Buscar GCODE/);
  assert.doesNotMatch(classic, /Buscar 3MF/);
});
