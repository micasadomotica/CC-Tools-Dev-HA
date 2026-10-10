import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { chromium } from 'playwright';
import { createUploadLibrary } from '../src/uploadDesignLibrary.js';
import { uploadDesignRoutes } from '../src/uploadDesignRoutes.js';
import { addModel, png } from '../test/uploadDesignFixtures.js';
let base, root, browser, server, url, library, config, calls=[], runStatus='success';
const screenshots=process.env.CCTOOLS_UPLOAD_SCREENSHOTS;
before(async()=>{
  base=await fs.mkdtemp(path.join(os.tmpdir(),'cc-upload-browser-'));root=path.join(base,'models');await fs.mkdir(root);
  for(const name of ['case','soporte','organizador','tapa','bandeja','clip'])await addModel(root,name);
  await fs.mkdir(path.join(root,'sin-portada'));
  const { readConfig }=await import('../src/storage.js'); config=await readConfig();config.setup.assistantCompleted=true;
  config.crealityProfile={userId:'test',updatedAt:new Date().toISOString()};
  library=createUploadLibrary({root,dataDir:path.join(base,'data')});
  const app=express();app.use(express.json());
  app.use('/api/upload-designs',uploadDesignRoutes(library,{readConfig:async()=>config,writeConfig:async()=>{},runTaskNow:async(...args)=>{calls.push(args);config.tasks.uploadDesigns.lastRunAt=new Date().toISOString();config.tasks.uploadDesigns.lastStatus=runStatus;if(runStatus==='error')throw new Error('Error del ejecutor');return{status:runStatus,message:runStatus==='success'?'Diseños entregados. Recompensa pendiente.':'No se pudo entregar el diseño.'};}}));
  app.get('/api/status',(_,res)=>res.json({ok:true,config,scheduler:{running:false},browser:{mode:'idle'},nextExecutions:{},dailyCounters:{},latestRuns:[]}));
  app.get('/api/schedule/preview',(_,res)=>res.json({ok:true,items:[]}));
  app.use('/api',(_,res)=>res.json({ok:true,items:[],designs:[],categories:[]}));
  app.use(express.static(fileURLToPath(new URL('../public',import.meta.url))));
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));url=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
  if(screenshots)await fs.mkdir(screenshots,{recursive:true});
});
after(async()=>{await browser?.close();if(server)await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});if(base)await fs.rm(base,{recursive:true,force:true});});
async function pageFor(t,viewport={width:1366,height:1000}) {
  const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>route.request().url().startsWith(url)?route.continue():route.abort());
  t.after(async()=>{await page.close();assert.deepEqual(errors,[]);});await page.goto(url);await page.waitForFunction(()=>!document.getElementById('uploads-enabled').disabled);return page;
}
async function ready(page){await page.waitForFunction(()=>!document.getElementById('uploads-modal').hasAttribute('aria-busy'));}
async function capture(page,name){if(screenshots)await page.screenshot({path:path.join(screenshots,name+'.png')});}
test('tarjeta última, escaneo automático, selección manual y envío al ejecutor',async t=>{
  const page=await pageFor(t);assert.equal(await page.locator('.tools-grid > article').last().getAttribute('id'),'uploads-card');
  assert.match(await page.locator('#uploads-card').innerText(),/Última ejecución:[\s\S]*Próxima ejecución:/);await capture(page,'01-modulos');
  await page.locator('#open-uploads-config svg').click();await ready(page);assert.equal(await page.locator('.upload-model').count(),7);
  const inputs=page.locator('.upload-model input:not(:disabled)');for(let i=0;i<5;i++)await inputs.nth(i).check();
  assert.equal(await page.locator('.upload-model input:checked').count(),5);assert.equal(await page.locator('.upload-model input:not(:checked):not(:disabled)').count(),0);
  await page.locator('#uploads-run').click();await ready(page);assert.equal(calls.length,1);assert.equal(calls[0][0],'uploadDesigns');assert.equal(calls[0][2].selected.length,5);
  assert.match(await page.locator('#uploads-message').innerText(),/entregados/);await capture(page,'02-mis-disenos');
  assert.match(await page.locator('#uploads-last-run').innerText(),/^\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}$/);
  assert.equal(await page.locator('#uploads-last-run').getAttribute('class'),'is-success');
  for(const status of ['failed','error']) {
    runStatus=status;await page.locator('#uploads-run').click();await ready(page);
    assert.equal(await page.locator('#uploads-last-run').getAttribute('class'),'is-error');
    assert.match(await page.locator('#uploads-last-run').innerText(),/^\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}$/);
  }
  runStatus='success';await page.locator('#uploads-run').click();await ready(page);
  assert.equal(await page.locator('#uploads-last-run').getAttribute('class'),'is-success');
  await page.keyboard.press('Escape');assert.equal(await page.locator('#uploads-modal').isHidden(),true);
});
test('programación exige cantidad exacta y horario; persiste y se desactiva',async t=>{
  const page=await pageFor(t);await page.locator('#uploads-card .tool-switch').click();await ready(page);assert.equal(await page.locator('#uploads-plan').isVisible(),true);
  await page.locator('#uploads-limit').fill('2');const inputs=page.locator('#uploads-plan-list input');await inputs.nth(0).check();assert.equal(await page.locator('#uploads-program').isDisabled(),true);
  await inputs.nth(1).check();assert.equal(await page.locator('#uploads-program').isEnabled(),true);
  await page.locator('#uploads-end').fill('07:00');assert.equal(await page.locator('#uploads-program').isDisabled(),true);await page.locator('#uploads-end').fill('12:00');
  assert.equal(await page.locator('#uploads-cleanup').isChecked(),false);await page.locator('#uploads-cleanup').check();
  await page.locator('#uploads-program').click();await ready(page);assert.equal(config.tasks.uploadDesigns.enabled,true);assert.ok(config.tasks.uploadDesigns.nextRunAt);assert.equal(config.tasks.uploadDesigns.cleanupEnabled,true);
  assert.equal(await page.locator('#uploads-daily-badge').innerText(),'0/2');
  assert.match(await page.locator('#uploads-next-run').innerText(),/^\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}$/);
  await page.locator('#uploads-plan-list input').nth(1).uncheck();await page.locator('#uploads-limit').fill('1');
  await page.locator('#uploads-program').click();await ready(page);
  assert.equal(await page.locator('#uploads-daily-badge').innerText(),'0/1');
  await page.locator('#uploads-plan').scrollIntoViewIfNeeded();await capture(page,'03-programacion');
  await page.locator('#close-uploads').click();await page.locator('#uploads-card .tool-switch').click();await ready(page);assert.equal(config.tasks.uploadDesigns.enabled,false);
});
test('móvil sin desbordamiento; botón de carpeta crea e importa los tres archivos',async t=>{
  const page=await pageFor(t,{width:390,height:844});await fs.rename(root,root+'-previous');
  await page.locator('#open-uploads-config svg').click();await ready(page);assert.match(await page.locator('#uploads-library-error').innerText(),/No se encuentra/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  assert.equal(await page.locator('.upload-modal-card').evaluate(e=>e.scrollWidth<=e.clientWidth),true);
  const chooser=page.waitForEvent('filechooser');await page.locator('#uploads-import').click();const selected=await chooser;
  const src=path.join(root+'-previous','case');await selected.setFiles(['case.3mf','info.txt','portada.png'].map(name=>path.join(src,name)));
  await page.waitForFunction(()=>document.getElementById('uploads-message').textContent.includes('añadido'));await ready(page);
  assert.equal((await library.scan()).inventory.length,1);await capture(page,'04-movil');
  await page.locator('#uploads-help-toggle').click();assert.match(await page.locator('#uploads-help').innerText(),/WebP/);
  assert.doesNotMatch(await page.locator('#uploads-help').innerText(),/Inicia sesión/);
  assert.match(await page.locator('#uploads-help p').first().innerText(),/^Prepara un archivo/);
});

test('el explorador importa portada2 y nueve imágenes junto con los archivos obligatorios',async t=>{
  const source=path.join(base,'pc');await fs.mkdir(source);
  const folder=await addModel(source,'galeria');await fs.writeFile(path.join(folder,'portada2.png'),png(90,120));
  for(let n=1;n<=9;n++)await fs.writeFile(path.join(folder,`imagen${n}.png`),png());
  const page=await pageFor(t);await page.locator('#open-uploads-config svg').click();await ready(page);
  const chooser=page.waitForEvent('filechooser');await page.locator('#uploads-import').click();
  await (await chooser).setFiles((await fs.readdir(folder)).map(name=>path.join(folder,name)));
  await page.waitForFunction(()=>document.getElementById('uploads-message').textContent.includes('añadido'));await ready(page);
  const item=(await library.scan()).inventory.find(item=>item.name==='galeria');assert.equal(item.valid,true);assert.equal(item.appCoverFile,'portada2.png');assert.equal(item.imageFiles.length,9);
  await page.locator('#uploads-help-toggle').click();const help=await page.locator('#uploads-help').innerText();
  assert.match(help,/portada2/);assert.match(help,/3:4/);assert.match(help,/futuras versiones/);
  assert.match(help,/ETIQUETAS: caja, organizador \[Añade etiquetas separadas por coma\]/);
  assert.match(help,/DESCRIPCION: Descripción del modelo \[Añade una breve descripción\]/);
});
