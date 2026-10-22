import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { progressDay } from '../src/dailyProgress.js';

function harness() {
  const config = {timezone:'Europe/Madrid',crealityProfile:{userId:'123'},tasks:{uploadDesigns:{enabled:false,cleanupEnabled:true}}};
  const calls = [];
  let fail = false;
  const h = vm.createContext({Date,progressDay,console:{error(){}},
    uploadLibrary:{cleanupCandidates:async()=>[{id:'old'}]},readConfig:async()=>config,writeConfig:async()=>{},
    runTaskNow:async(...args)=>{calls.push(args);if(fail === true)throw new Error('Public profile unavailable');return {status:fail || 'success'};}
  });
  const source = fs.readFileSync(new URL('../src/scheduler.js',import.meta.url),'utf8');
  const start = source.indexOf('async function runScheduledUploadCleanup(');
  vm.runInContext(source.slice(start,source.indexOf('\nasync function refreshDailyBoostAvailability',start)),h);
  return {config,calls,run:now=>h.runScheduledUploadCleanup(config,now),setFailure:value=>{fail=value;}};
}

test('la limpieza funciona con las subidas desactivadas y solo se comprueba una vez al día',async()=>{
  const h=harness(),now=new Date('2026-10-22T08:00:00Z');
  assert.equal(await h.run(now),true);
  assert.equal(h.calls[0][1],'cleanup');
  assert.equal(h.calls[0][2].cleanupOnly,true);
  assert.equal(h.config.tasks.uploadDesigns.enabled,false);
  assert.equal(await h.run(now),false);
  assert.equal(h.calls.length,1);
  assert.equal(await h.run(new Date('2026-10-23T08:00:00Z')),true);
  h.config.tasks.uploadDesigns.cleanupEnabled=false;
  assert.equal(await h.run(new Date('2026-10-24T08:00:00Z')),false);
});

test('un fallo al comprobar la publicación se reintenta sin dar el día por revisado',async()=>{
  const h=harness(),now=new Date('2026-10-22T08:00:00Z');h.setFailure(true);
  await h.run(now);
  assert.equal(h.config.tasks.uploadDesigns.cleanupCheckedDay,undefined);
  assert.equal(await h.run(new Date('2026-10-22T08:30:00Z')),false);
  h.setFailure(false);await h.run(new Date('2026-10-22T09:00:00Z'));
  assert.equal(h.calls.length,2);
  assert.equal(h.config.tasks.uploadDesigns.cleanupCheckedDay,'2026-10-22');
});

test('una limpieza cancelada o fallida tampoco completa la comprobación diaria',async()=>{
  for (const status of ['skipped','failed']) {
    const h=harness(); h.setFailure(status);
    await h.run(new Date('2026-10-22T08:00:00Z'));
    assert.equal(h.config.tasks.uploadDesigns.cleanupCheckedDay,undefined);
    assert.equal(h.config.tasks.uploadDesigns.cleanupRetryAt,'2026-10-22T09:00:00.000Z');
  }
});
