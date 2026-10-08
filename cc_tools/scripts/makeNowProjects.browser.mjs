import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { MAKENOW_TOOLS, selectAndCreateMakeNowProject, acceptMakeNowFeatureNotice } from '../src/makeNowProjects.js';

let browser;
before(async () => { browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'chrome' } : {}) }); });
after(async () => { await browser?.close(); });

// Reproduce the inspected iframe, including the transient 0/30 while projects load.
// All requests are intercepted: these tests never create a project in a real account.
async function withCatalogue(full, callback, notice = null) {
  const page = await browser.newPage();
  const popupScript = `function showNotice(accepted) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:#0008;z-index:9999;display:grid;place-items:center';
    overlay.innerHTML = '<section style="background:white;padding:25px"><h3>AI Feature Notice</h3><p>This feature uses AI to convert your uploaded image into a 3D model. By uploading an image, you consent to the processing of that image for this purpose, as described in our Privacy Policy.</p><button>Refuse</button><button>Agree</button></section>';
    overlay.querySelectorAll('button')[1].onclick = () => { overlay.remove(); accepted(); };
    document.body.appendChild(overlay);
  }`;
  const html = `<!doctype html><html><body><div id="app"></div><script>
    ${popupScript}
    const notice = ${JSON.stringify(notice)};
    const tools = ${JSON.stringify(MAKENOW_TOOLS)};
    const full = ${JSON.stringify(full)};
    const app = document.getElementById('app');
    for (const tool of tools) {
      const link = document.createElement('button');
      link.textContent = tool.name;
      const openTool = () => {
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
      link.onclick = () => {
        if (notice && !sessionStorage.getItem('noticeAccepted')) {
          showNotice(() => {
            sessionStorage.setItem('noticeAccepted', 'yes');
            if (notice.navigate) openTool();
          });
        } else openTool();
      };
      app.appendChild(link);
    }
  </script></body></html>`;
  await page.route('**/*', route => {
    const host = new URL(route.request().url()).hostname;
    if (host === 'www.crealitycloud.com') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><body><iframe style="width:100%;height:600px" id="makenowIframe" src="https://makenow.crealitycloud.com/makenow/ModelingTools/Home"></iframe><script>${popupScript}
      if (${Boolean(notice?.wrapper)} && !sessionStorage.getItem('noticeAccepted')) showNotice(() => sessionStorage.setItem('noticeAccepted', 'yes'));
    </script></body></html>` });
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

for (const notice of [{ navigate: true }, { navigate: false, wrapper: true }]) {
  test(`primer uso: acepta el aviso y crea solo un proyecto (${notice.wrapper ? 'página e iframe; vuelve al catálogo' : 'iframe; continúa automáticamente'})`, async () => {
    await withCatalogue(false, async page => {
      const records = [], reservations = [];
      const result = await selectAndCreateMakeNowProject(page, {
        record: message => records.push(message),
        reserveAttempt: async tool => { reservations.push(tool); return { attemptId: 'first-use' }; }
      });
      assert.equal(result.tool, 'ClickerMaker');
      assert.equal(result.project.projectId, 'fixture-project');
      assert.equal(result.inventory[0].status, 'full');
      assert.equal(reservations.length, 1);
      assert.equal(records.filter(text => text.includes('aceptado el aviso')).length, notice.wrapper ? 2 : 1);
      assert.equal(records.filter(text => text.includes('Pulsado New Project')).length, 1);
    }, notice);
  });
}

test('no acepta un Agree de otro popup ni un aviso sin los controles esperados', async () => {
  const page = await browser.newPage();
  try {
    await page.setContent('<iframe id="makenowIframe"></iframe><section><h3>Upgrade to commercial access</h3><button>Refuse</button><button onclick="window.wrong=true">Agree</button></section>');
    assert.equal(await acceptMakeNowFeatureNotice(page), false);
    assert.equal(await page.evaluate(() => window.wrong), undefined);
    await page.setContent('<iframe id="makenowIframe"></iframe><section><h3>AI Feature Notice</h3><button>Purchase</button></section>');
    await assert.rejects(acceptMakeNowFeatureNotice(page), { code: 'MAKENOW_AI_NOTICE_BLOCKED' });
  } finally { await page.close(); }
});
