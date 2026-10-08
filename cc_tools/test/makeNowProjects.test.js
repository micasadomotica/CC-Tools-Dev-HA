import test from 'node:test';
import assert from 'node:assert/strict';
import { MAKENOW_TOOLS, availableMakeNowTools, parseProjectCapacity, projectIdentity,
  selectAndCreateMakeNowProject, createMakeNowJournal, lastProfileAttempt } from '../src/makeNowProjects.js';

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
