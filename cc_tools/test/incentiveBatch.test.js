import test from 'node:test';
import assert from 'node:assert/strict';
import { readIncentiveProgressBatch, readIncentiveProgress } from '../src/incentiveTasks.js';

function fixture(records) {
  let requests = 0, navigations = 0;
  const empty = { first(){return this;},waitFor:async()=>{},isVisible:async()=>false,count:async()=>0,
    innerText:async()=> 'Creality Cloud incentive points page with daily rewarded tasks' };
  const page = { on(){}, off(){},goto:async()=>{navigations++;},waitForTimeout:async()=>{},
    url:()=> 'https://www.crealitycloud.com/es/incentive-points?thirdType=earn-points',
    title:async()=> 'Creality Cloud',frames:()=>[],locator:()=>empty,
    evaluate:async()=>{ requests++; return {ok:true,body:{data:{list:records}}}; }
  };
  return { page, counts:()=>({requests,navigations}) };
}
test('la sincronización lee varias recompensas en una navegación y una consulta', async()=>{
  const f=fixture([
    {taskId:'download',taskName:'Download Models',doneTimes:24,vaildTimes:30},
    {taskId:'make',taskName:'Use MakeNow',doneTimes:1,vaildTimes:1}
  ]);
  const result=await readIncentiveProgressBatch(f.page,null,['Download Models','Use MakeNow']);
  assert.equal(result['Download Models'].done,24);
  assert.equal(result['Use MakeNow'].completed,true);
  assert.deepEqual(f.counts(),{requests:1,navigations:1});
});
test('una recompensa ausente no se inventa como cero',async()=>{
  const f=fixture([{taskId:'download',taskName:'Download Models',doneTimes:24,vaildTimes:30}]);
  const result=await readIncentiveProgressBatch(f.page,null,['Download Models','Use MakeNow']);
  assert.equal(result['Use MakeNow'],undefined);
});
test('una lista vacía produce un error de lectura, no tareas completadas ni pendientes ficticias',async()=>{
  const f=fixture([]);
  await assert.rejects(readIncentiveProgressBatch(f.page,null,['Use MakeNow']),{code:'INCENTIVE_PAGE_NOT_READY'});
});
test('rechaza contadores negativos y límites inválidos',async()=>{
  const f=fixture([{taskId:'download',taskName:'Download Models',doneTimes:-1,vaildTimes:30}]);
  await assert.rejects(readIncentiveProgressBatch(f.page,null,['Download Models']),{code:'INCENTIVE_PAGE_NOT_READY'});
});


function makeNowPageWithStaleApi() {
  const f=fixture([{taskId:'make',taskName:'Use MakeNow',doneTimes:1,vaildTimes:1}]);
  const original=f.page.locator;
  const items=[{title:'Collection Models',done:1},{title:'Use MakeNow',done:0}];
  f.page.locator=selector=>selector==='.task-item' ? {
    count:async()=>items.length,
    nth:index=>({isVisible:async()=>true,locator: selector=>({first(){return this;},count:async()=>1,
      textContent:async()=> selector==='.done-times' ? String(items[index].done) : selector==='.vaild-times' ? '/1' : items[index].title
    })})
  } : original(selector);
  return f;
}

test('MakeNow usa el 0/1 visible aunque la API conserve 1/1 y colecciones sea 1/1',async()=>{
  const f=makeNowPageWithStaleApi();
  const result=await readIncentiveProgressBatch(f.page,null,['Use MakeNow']);
  assert.equal(result['Use MakeNow'].done,0);
  assert.equal(result['Use MakeNow'].completed,false);
  assert.equal(result['Use MakeNow'].taskResolution,'task-page');
});

test('la verificación manual de MakeNow también respeta el estado visible pendiente',async()=>{
  const f=makeNowPageWithStaleApi();
  const result=await readIncentiveProgress(f.page,null,'Use MakeNow',{includePoints:false});
  assert.equal(result.done,0);
  assert.equal(result.completed,false);
});
