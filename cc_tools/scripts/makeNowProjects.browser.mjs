import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { MAKENOW_TOOLS, selectAndCreateMakeNowProject } from '../src/makeNowProjects.js';

let browser;
before(async () => { browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'chrome' } : {}) }); });
after(async () => { await browser?.close(); });

// Reproduce the inspected iframe, including the transient 0/30 while projects load.
// All requests are intercepted: these tests never create a project in a real account.
async function withCatalogue(full, callback) {
  const page = await browser.newPage();
  const html = `<!doctype html><html><body><div id="app"></div><script>
    const tools = ${JSON.stringify(MAKENOW_TOOLS)};
    const full = ${JSON.stringify(full)};
    const app = document.getElementById('app');
    for (const tool of tools) {
      const link = document.createElement('button');
      link.textContent = tool.name;
      link.onclick = () => {
        history.pushState({}, '', '/makenow/ModelingTools/ProjectInfoManage/' + tool.id);
        app.innerHTML = '<div class="container-Loading">Loading...</div><div class="project-num">My Projects <span>(0/30)</span></div><button id="create">New Project</button>';
        setTimeout(() => {
          const used = full ? 30 : tool.id === '17' ? 30 : tool.id === '13' ? 2 : 0;
          document.querySelector('.project-num span').textContent = '(' + used + '/30)';
          document.querySelector('.container-Loading').style.display = 'none';
          const create = document.getElementById('create');
          create.disabled = used >= 30;
          create.onclick = () => {
            history.pushState({}, '', '/makenow/ModelingTools/ProjectEdit/' + tool.id + '/fixture-project');
            app.textContent = 'Project editor';
          };
        }, 800);
      };
      app.appendChild(link);
    }
  </script></body></html>`;
  await page.route('**/*', route => {
    const host = new URL(route.request().url()).hostname;
    if (host === 'www.crealitycloud.com') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><iframe id="makenowIframe" src="https://makenow.crealitycloud.com/makenow/ModelingTools/Home"></iframe>' });
    if (host === 'makenow.crealitycloud.com') return route.fulfill({ contentType: 'text/html', body: html });
    return route.abort();
  });
  try { await callback(page); } finally { await page.close(); }
}

test('espera la carga real del cupo, elige la menor ocupación y registra un único proyecto', async () => withCatalogue(false, async page => {
  const reservations = [], updates = [];
  const result = await selectAndCreateMakeNowProject(page, {
    record: () => {},
    reserveAttempt: async tool => { reservations.push(tool); return { attemptId: 'attempt-1' }; },
    updateAttempt: async (_attempt, patch) => updates.push(patch)
  });
  assert.equal(result.inventory[0].used, 30);
  assert.equal(result.inventory[0].status, 'full');
  assert.equal(result.inventory[1].used, 2);
  assert.equal(result.tool, 'ClickerMaker');
  assert.equal(reservations.length, 1);
  assert.equal(result.project.projectId, 'fixture-project');
  assert.ok(updates.some(patch => patch.status === 'created'));
}));

test('con ocho cupos de 30/30 y botones deshabilitados avisa sin reservar ni pulsar', async () => withCatalogue(true, async page => {
  await assert.rejects(selectAndCreateMakeNowProject(page, {
    record: () => {}, reserveAttempt: async () => assert.fail('Must not reserve')
  }), { code: 'MAKENOW_ALL_TOOLS_FULL' });
}));
