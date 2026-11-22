import test from 'node:test';
import assert from 'node:assert/strict';
import { MAKENOW_TOOLS, availableMakeNowTools, parseProjectCapacity, projectIdentity,
  selectAndCreateMakeNowProject, createMakeNowJournal, lastProfileAttempt, needsFullMakeNowScan,
  newlyFullMakeNowTools } from '../src/makeNowProjects.js';

test('lee el cupo sin confundir un texto incompleto con cero', () => {
  assert.deepEqual(parseProjectCapacity('My Projects\n(29/30)'), { used: 29, limit: 30 });
  assert.deepEqual(parseProjectCapacity('Mis proyectos (30/30)'), { used: 30, limit: 30 });
  assert.equal(parseProjectCapacity('My Projects'), null);
  assert.equal(parseProjectCapacity('My Projects (31/30)'), null);
});
const state = (tool, used = 0, status = 'available') => ({ ...tool, used, limit: 30, status });
test('elige la menor ocupación y excluye herramientas llenas, desconocidas y comerciales', () => {
  const candidates = availableMakeNowTools([
    state(MAKENOW_TOOLS[0], 30, 'full'), state(MAKENOW_TOOLS[1], 2), state(MAKENOW_TOOLS[2], 0),
    state(MAKENOW_TOOLS[3], 0, 'restricted'), state({ id: '999', name: 'FlexiToys' })
  ]);
  assert.deepEqual(candidates.map(tool => tool.name), ['ClickerMaker', 'FrameStudio']);
});
test('registra solo identidades del editor y elimina parámetros de sesión', () => {
  const identity = projectIdentity('https://makenow.crealitycloud.com/makenow/ModelingTools/ProjectEdit/17/abc123?token=private', '17');
  assert.equal(identity.projectId, 'abc123');
  assert.equal(identity.projectUrl, 'https://www.crealitycloud.com/es/makenow/ModelingTools/ProjectEdit/17/abc123');
  assert.equal(projectIdentity('https://www.crealitycloud.com/es/makenow/ModelingTools/ProjectInfoManage/17', '17'), null);
  assert.equal(projectIdentity('https://example.test/makenow/ModelingTools/ProjectEdit/17/abc', '17'), null);
});
function harness(inspectTool, createProject) {
  const inventories = [];
  return { inventories, run: () => selectAndCreateMakeNowProject({}, {
    record: () => {}, saveInventory: async value => inventories.push(structuredClone(value))
  }, { inspectTool, createProject }) };
}
test('si otra sesión llena la herramienta elegida usa otra antes de reservar', async () => {
  const calls = new Map();
  const created = [];
  const h = harness(async (_page, tool) => {
    const seen = (calls.get(tool.id) || 0) + 1; calls.set(tool.id, seen);
    return state(tool, tool.id === '17' && seen > 1 ? 30 : 0, tool.id === '17' && seen > 1 ? 'full' : 'available');
  }, async (_page, tool) => { created.push(tool.name); return { projectId: 'created' }; });
  const result = await h.run();
  assert.equal(result.tool, 'FrameStudio');
  assert.deepEqual(created, ['FrameStudio']);
});
test('todos los cupos llenos generan un aviso con detalle sin crear proyectos', async () => {
  const h = harness(async (_page, tool) => state(tool, 30, 'full'), async () => assert.fail('Must not create'));
  await assert.rejects(h.run(), error => {
    assert.equal(error.code, 'MAKENOW_ALL_TOOLS_FULL');
    assert.equal(error.inventory.length, 8);
    assert.match(error.message, /Lampshade Generator: 30\/30/);
    return true;
  });
  assert.equal(h.inventories.length, 1);
});
test('un cupo ilegible no se confunde con lleno ni se usa para crear', async () => {
  const h = harness(async () => { throw new Error('not loaded'); }, async () => assert.fail('Must not create'));
  await assert.rejects(h.run(), { code: 'MAKENOW_NO_AVAILABLE_TOOL' });
  assert.ok(h.inventories[0].every(tool => tool.status === 'unknown'));
});

test('un aviso de primer uso bloqueado conserva el diagnóstico y no recorre todas las herramientas', async () => {
  let inspections = 0;
  const h = harness(async () => {
    inspections++;
    throw Object.assign(new Error('No se pudo cerrar AI Feature Notice'), { code: 'MAKENOW_AI_NOTICE_BLOCKED' });
  }, async () => assert.fail('Must not create'));
  await assert.rejects(h.run(), { code: 'MAKENOW_AI_NOTICE_BLOCKED' });
  assert.equal(inspections, 1);
});
test('si el clic falla no prueba otra herramienta y evita duplicar proyectos', async () => {
  let calls = 0;
  const h = harness(async (_page, tool) => state(tool), async () => { calls++; throw new Error('uncertain click'); });
  await assert.rejects(h.run(), /uncertain click/);
  assert.equal(calls, 1);
});
test('el registro persiste por perfil, protege reintentos y conserva proyecto y recompensa', async () => {
  let saved = { crealityProfile: { userId: '42', name: 'First' }, tasks: { makeNow: { timezone: 'Europe/Madrid' } } };
  const storage = { readConfig: async () => structuredClone(saved), writeConfig: async config => { saved = structuredClone(config); } };
  const journal = createMakeNowJournal(saved.crealityProfile, storage);
  await journal.saveInventory([state(MAKENOW_TOOLS[0], 1)]);
  const attempt = await journal.reserveAttempt(state(MAKENOW_TOOLS[0], 1));
  assert.equal(saved.tasks.makeNow.projectAccounts['42'].attempts[0].status, 'reserved');
  await assert.rejects(journal.reserveAttempt(state(MAKENOW_TOOLS[1])), { code: 'MAKENOW_ALREADY_ATTEMPTED' });
  await journal.updateAttempt(attempt, { projectId: 'new123', status: 'created', rewardStatus: 'credited' });
  assert.equal(saved.tasks.makeNow.projectAccounts['42'].attempts[0].projectId, 'new123');
  saved.crealityProfile = { userId: '84', name: 'Second' };
  assert.equal(lastProfileAttempt(saved.tasks.makeNow, '84'), '');
  await createMakeNowJournal(saved.crealityProfile, storage).reserveAttempt(state(MAKENOW_TOOLS[1]));
  assert.equal(saved.tasks.makeNow.projectAccounts['42'].attempts.length, 1);
  assert.equal(saved.tasks.makeNow.projectAccounts['84'].attempts.length, 1);
  await assert.rejects(journal.updateAttempt(attempt, {}), { code: 'MAKENOW_PROFILE_CHANGED' });
});
test('sin perfil conocido no atribuye proyectos a una cuenta inventada', async () => {
  await assert.rejects(createMakeNowJournal({}).reserveAttempt(state(MAKENOW_TOOLS[0])), { code: 'MAKENOW_PROFILE_REQUIRED' });
});

test('el registro rechaza reintentos sin lectura válida o con un intento posterior a la consulta', async () => {
  const previous = new Date().toISOString();
  let saved = { crealityProfile: { userId: '42' }, tasks: { makeNow: { lastAttemptAt: previous } } };
  const journal = createMakeNowJournal(saved.crealityProfile, {
    readConfig: async () => structuredClone(saved), writeConfig: async config => { saved = structuredClone(config); }
  });
  const valid = { source: 'manual', progress: { found: true, done: 0, valid: 1, completed: false }, previousAttemptAt: previous };
  for (const options of [
    { ...valid, source: 'schedule' }, { ...valid, source: undefined },
    { ...valid, progress: { found: false } }, { ...valid, progress: { found: true, done: 1, valid: 1, completed: true } },
    { ...valid, previousAttemptAt: '2020-01-01T00:00:00.000Z' }
  ]) await assert.rejects(journal.reserveAttempt(state(MAKENOW_TOOLS[0]), options), { code: 'MAKENOW_ALREADY_ATTEMPTED' });
  assert.equal(saved.tasks.makeNow.projectAccounts, undefined);
  saved.crealityProfile.userId = '84';
  await assert.rejects(journal.reserveAttempt(state(MAKENOW_TOOLS[0]), valid), { code: 'MAKENOW_PROFILE_CHANGED' });
});

const storedState = () => MAKENOW_TOOLS.map((tool, index) => ({ ...tool, used: index === 5 ? 6 : 7, limit: 30, status: 'available' }));

test('con cupos guardados recientes solo comprueba la herramienta elegida y suma el proyecto creado', async () => {
  const inspected = [];
  const saved = [];
  const result = await selectAndCreateMakeNowProject({}, {
    record: () => {}, saveInventory: async (value, flags) => saved.push({ value: structuredClone(value), flags }),
    storedInventory: storedState(), fullScanAt: new Date().toISOString()
  }, {
    inspectTool: async (_page, tool) => { inspected.push(tool.name); return { ...tool, used: tool.used, limit: 30, status: 'available' }; },
    createProject: async () => ({ projectId: 'new' })
  });
  assert.deepEqual(inspected, ['SnapForm']);
  assert.equal(result.tool, 'SnapForm');
  assert.equal(result.fullScan, false);
  const finalInventory = saved.at(-1).value;
  assert.equal(finalInventory.find(tool => tool.name === 'SnapForm').used, 7);
  assert.ok(saved.every(entry => !entry.flags?.fullScan));
});

test('consulta todas las herramientas sin datos, con datos de más de 7 días o al forzarlo', async () => {
  const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
  for (const options of [{}, { storedInventory: storedState(), fullScanAt: old }, { storedInventory: storedState(), fullScanAt: new Date().toISOString(), forceFullScan: true }]) {
    const inspected = [];
    const saved = [];
    await selectAndCreateMakeNowProject({}, { record: () => {}, saveInventory: async (_value, flags) => saved.push(flags), ...options }, {
      inspectTool: async (_page, tool) => { inspected.push(tool.name); return { ...tool, used: 3, limit: 30, status: 'available' }; },
      createProject: async () => ({ projectId: 'new' })
    });
    assert.equal(inspected.length, 9);
    assert.equal(saved[0]?.fullScan, true);
  }
});

test('una herramienta que llega al límite se avisa una vez y no se vuelve a usar', async () => {
  const stored = MAKENOW_TOOLS.map(tool => ({ ...tool, used: tool.id === '10' ? 29 : 30, limit: 30, status: tool.id === '10' ? 'available' : 'full' }));
  const result = await selectAndCreateMakeNowProject({}, {
    record: () => {}, saveInventory: async () => {}, storedInventory: stored, fullScanAt: new Date().toISOString()
  }, {
    inspectTool: async (_page, tool) => ({ ...tool, used: 29, limit: 30, status: 'available' }),
    createProject: async () => ({ projectId: 'last' })
  });
  assert.equal(result.tool, 'SnapForm');
  assert.deepEqual(result.newlyFullTools.map(tool => [tool.name, tool.used]), [['SnapForm', 30]]);
  assert.equal(result.inventory.find(tool => tool.id === '10').status, 'full');
  assert.deepEqual(newlyFullMakeNowTools(result.inventory, result.inventory), []);
});

test('si según lo guardado no hay espacio, consulta todas antes de rendirse', async () => {
  const stored = MAKENOW_TOOLS.map(tool => ({ ...tool, used: 30, limit: 30, status: 'full' }));
  let scans = 0;
  const result = await selectAndCreateMakeNowProject({}, {
    record: () => {}, saveInventory: async (_value, flags) => { if (flags?.fullScan) scans++; },
    storedInventory: stored, fullScanAt: new Date().toISOString()
  }, {
    inspectTool: async (_page, tool) => ({ ...tool, used: tool.id === '8' ? 12 : 30, limit: 30, status: tool.id === '8' ? 'available' : 'full' }),
    createProject: async () => ({ projectId: 'freed' })
  });
  assert.equal(scans, 1);
  assert.equal(result.tool, 'SignForge');
  assert.deepEqual(result.newlyFullTools, []);
});

test('needsFullMakeNowScan exige todas las herramientas y fecha válida', () => {
  const now = new Date();
  assert.equal(needsFullMakeNowScan(storedState(), now.toISOString(), now), false);
  assert.equal(needsFullMakeNowScan(storedState().slice(1), now.toISOString(), now), true);
  assert.equal(needsFullMakeNowScan(storedState(), '', now), true);
});
