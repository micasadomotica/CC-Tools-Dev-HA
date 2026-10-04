import test from 'node:test';
import assert from 'node:assert/strict';
import { readIncentiveProgressBatch } from '../src/incentiveTasks.js';

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
