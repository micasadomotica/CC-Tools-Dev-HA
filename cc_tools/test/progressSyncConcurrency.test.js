import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { reconcileMakeNowCorrection } from '../src/dailyProgress.js';

const source = name => fs.readFileSync(new URL(`../src/${name}.js`, import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?;\r?$/gm, '').replace(/^export /gm, '');
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };
const turn = () => new Promise(resolve => setImmediate(resolve));

function harness() {
  const browserGate = deferred();
  const configGate = deferred();
  const state = { browserActive:false, launches:0, checkins:0, deferConfig:false, writes:0, failWrite:false, runs:[] };
  const config = { timezone:'Europe/Madrid', dailyProgress:{}, tasks:{creality:{retainDays:7}} };
  const context = vm.createContext({ Date, Promise, AbortController, setTimeout, clearTimeout, process, console:{log(){},error(){}},
    readConfig:async()=> { if(state.deferConfig) await configGate.promise; return config; },
    writeConfig:async()=> { state.writes++; if(state.failWrite) throw new Error('storage unavailable'); },
    readRuns:async()=>[], appendRun:async run=>state.runs.push(run),
    browserManagerState:()=>({mode:state.browserActive?'automation':'idle'}),
    withAutomationBrowser:async(_options,callback)=> {
      if(state.browserActive) throw Object.assign(new Error('Browser busy'),{code:'BROWSER_BUSY'});
      state.browserActive=true; state.launches++;
      try { await browserGate.promise; return await callback({pages:()=>[{}]}); }
      finally { state.browserActive=false; }
    },
    observeCrealityPage:()=>({stop(){}}), readIncentiveProgressBatch:async()=>({}),
    REWARD_TITLES:{}, readPointsSummary:async()=>({status:'current'}),
    mergePointsState:(_previous,incoming)=>incoming,
    dailyProgress:()=>({counters:{},limits:{}}), reconcileDailyPlans:()=>false, reconcileMakeNowCorrection,
    cleanupOldScreenshots:async()=>{}, abortAutomationBrowser:async()=>{},
    executeFixture:async()=> {
      assert.equal(state.browserActive,false,'task must wait until the sync releases its browser');
      state.checkins++; return {success:true,details:{}};
    }
  });
  vm.runInContext(source('progressSync'),context);
  vm.runInContext(source('scheduler'),context);
  vm.runInContext(`
    executePendingTask = executeFixture;
    taskExecutionTimeoutMs = () => 1000;
    formatRunMessage = () => 'Check-in completado';
    appendExecutionError = async () => ({runMessage:'Error',details:{}});
    notifyTaskResult = async () => {};
    updateModelBoostState = updateNextRunAfterExecution = updatePointsCounter =
      updateDependentModelActions = updateAutomationHealth = () => {};
    globalThis.applyRewardResult = () => {};
  `,context);
  return {state,config,context,browserGate,configGate};
}

test('check-in manual espera a la sincronización y bloquea nuevos refrescos hasta terminar',async()=>{
  const h=harness();
  const sync=h.context.synchronizeDailyProgress({force:true}); await turn();
  assert.equal(h.state.browserActive,true);
  const task=h.context.runTaskNow('creality'); await turn();
  assert.equal(h.context.schedulerState().running,true);
  assert.equal(h.state.checkins,0);
  assert.equal((await h.context.synchronizeDailyProgress({force:true,fullHistory:true})).busy,true);
  h.browserGate.resolve(); await sync;
  assert.equal((await task).status,'success');
  assert.equal(h.state.checkins,1);
  assert.equal(h.state.runs.filter(run=>run.taskId==='creality' && run.status==='success').length,1);
  assert.equal(h.context.schedulerState().running,false);
  await h.context.synchronizeDailyProgress({force:true});
  assert.equal(h.state.launches,2,'reservation must be released after the task');
});

test('un refresco que estaba leyendo configuración cede a la tarea manual',async()=>{
  const h=harness(); h.state.deferConfig=true;
  const sync=h.context.synchronizeDailyProgress({force:true});
  const task=h.context.runTaskNow('creality');
  h.configGate.resolve();
  assert.equal((await sync).busy,true);
  assert.equal((await task).status,'success');
  assert.equal(h.state.launches,0);
  assert.equal(h.state.checkins,1);
});

test('un fallo al guardar la sincronización no impide ejecutar después la tarea',async()=>{
  const h=harness(); h.state.failWrite=true;
  const sync=h.context.synchronizeDailyProgress({force:true});
  const failed=assert.rejects(sync,/storage unavailable/); await turn();
  const release=h.context.pauseProgressSync();
  const wait=h.context.waitForProgressSync();
  h.browserGate.resolve(); await failed; await wait;
  h.state.failWrite=false; release();
  assert.equal((await h.context.runTaskNow('creality')).status,'success');
});

test('cancelar mientras espera no ejecuta el check-in al terminar la sincronización',async()=>{
  const h=harness();
  const sync=h.context.synchronizeDailyProgress({force:true}); await turn();
  const task=h.context.runTaskNow('creality'); await turn();
  const cancelled=await h.context.cancelRunningTask('manual');
  assert.equal(cancelled.cancelled,true);
  assert.equal((await task).status,'skipped');
  h.browserGate.resolve(); await sync; await turn();
  assert.equal(h.state.checkins,0);
});

test('el límite de ejecución también cubre la espera y evita un check-in tardío',async()=>{
  const h=harness();
  vm.runInContext('taskExecutionTimeoutMs = () => 20;',h.context);
  const sync=h.context.synchronizeDailyProgress({force:true}); await turn();
  await assert.rejects(h.context.runTaskNow('creality'),{code:'TASK_EXECUTION_TIMEOUT'});
  h.browserGate.resolve(); await sync; await turn();
  assert.equal(h.state.checkins,0);
  assert.equal(h.context.schedulerState().running,false);
});
