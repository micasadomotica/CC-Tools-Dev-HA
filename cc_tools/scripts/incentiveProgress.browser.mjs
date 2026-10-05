import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readIncentiveProgressBatch, readIncentiveProgress, INCENTIVE_POINTS_URL } from '../src/incentiveTasks.js';

let browser;
before(async()=> {browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});});
after(async()=> {await browser?.close();});
const tasks=[['Image comments',1,5],['Comment on models',0,1],['Model Boost',0,1],['Upload Models',0,5],['Download Models',1,30],['Finish a Print',1,10],['Like 3D Model',0,1],['Buy Premium Plan',0,1],['Use MakeNow',0,1],['Collection Models',1,1]];
// DOM structure inspected on the user's rewards page. No account data or remote assets.
const html='<!doctype html><html><head><title>Creality Cloud</title></head><body><h1>Tareas diarias de Creality Cloud</h1>'+tasks.map(([title,done,valid])=>`
<div class="task-item"><div class="task-item-info"><div class="task-item-left"><div class="task-item-text-box">
<div class="task-item-title"><h5>${title}</h5><div class="progress-text"><span class="done-times">${done}</span>/<span class="vaild-times">${valid}</span></div></div>
<div class="tip">+1 Points (Rewards issued after approval)</div></div></div><div class="do-task-btn">${done===valid?'Completado':'Por completar'}</div></div></div>`).join('')+'</body></html>';

async function withPage(callback, makeNowInApi=false) {
  const page=await browser.newPage();
  const apiTasks=tasks.filter(([title])=>makeNowInApi || title!=='Use MakeNow').map(([title,done,valid],i)=>({taskId:String(i+1),taskName:title,doneTimes:title==='Use MakeNow'?1:done,vaildTimes:valid}));
  await page.route('**/*',route=>route.request().url().includes('/api/') ? route.fulfill({contentType:'application/json',body:JSON.stringify({data:{list:apiTasks}})}) : route.fulfill({contentType:'text/html',body:html}));
  // The page is static; omit deliberate network-settling pauses, keep locator timeouts real.
  page.waitForTimeout=async()=>{};
  let timeout;
  try {
    await Promise.race([callback(page),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('El lector espera selectores inexistentes en la tarjeta real')),4000);})]);
  } finally {clearTimeout(timeout);await page.close();}
}

test('DOM real: MakeNow ausente de la API se lee como 0/1 sin esperar encabezados inexistentes',async()=>withPage(async page=>{
  const results=await readIncentiveProgressBatch(page,null,['Download Models','Use MakeNow','Collection Models']);
  assert.equal(results['Use MakeNow'].done,0);
  assert.equal(results['Use MakeNow'].completed,false);
  assert.equal(results['Collection Models'].done,1);
  assert.equal(results['Download Models'].done,1);
}));

test('DOM real: MakeNow visible 0/1 prevalece frente a 1/1 en la API',async()=>withPage(async page=>{
  const result=await readIncentiveProgress(page,null,'Use MakeNow',{includePoints:false});
  assert.equal(result.done,0);
  assert.equal(result.completed,false);
},true));
