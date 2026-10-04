import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyProgress, reconcileDailyPlans, applyRewardResult } from '../src/dailyProgress.js';
import { mergeProgressObservations, progressSyncDue, readCheckinProgress } from '../src/progressSync.js';

const now = new Date('2026-10-04T10:00:00Z');
const date = '2026-10-04';
const observed = (done, valid, checkedAt = now.toISOString()) => ({ found: true, done, valid, checkedAt });
const slots = count => Array.from({ length: count }, (_, index) => new Date(now.getTime() + (index + 1) * 600000).toISOString());
function config(tasks = {}) {
  const simple = { enabled: true, dailyLimit: 1, windowStart: '08:00', windowEnd: '20:00', timezone: 'Europe/Madrid', nextRunAt: slots(1)[0] };
  return {
    timezone: 'Europe/Madrid', points: { transactions: [] }, dailyProgress: { tasks },
    tasks: {
      modelDownloads: { ...simple, dailyLimit: 30, downloadPlanDate: date, downloadPlan: slots(30), downloadPlanCursor: 1, downloadPlanDoneCount: 1 },
      comments: { ...simple, dailyLimit: 6, imageDailyLimit: 5, textDailyLimit: 1, commentPlanDate: date, commentPlan: slots(6), commentPlanCursor: 0, commentKindPlan: ['image','text','image','image','image','image'] },
      finishPrint: { enabled: false, dailyLimit: 10, totalDailyLimit: 10 },
      creality: { ...simple }, modelLikes: { ...simple }, modelCollections: { ...simple }, makeNow: { ...simple }, modelBoosts: { ...simple }
    }
  };
}
const localDownload = { taskId: 'modelDownloads', finishedAt: now.toISOString(), status: 'success', details: { downloaded: [{ rewardStatus: 'credited' }] } };

test('24 descargas remotas y una local son 24/30, con seis pendientes', () => {
  const c = config({ modelDownloads: observed(24, 30) });
  assert.equal(dailyProgress(c, [localDownload], now).counters.modelDownloads, 24);
  assert.equal(dailyProgress(c, [localDownload], now).limits.modelDownloads, 30);
  reconcileDailyPlans(c, [localDownload], now);
  assert.equal(c.tasks.modelDownloads.downloadPlan.length - c.tasks.modelDownloads.downloadPlanCursor, 6);
  const saved = JSON.stringify(c);
  reconcileDailyPlans(c, [localDownload], now);
  assert.equal(JSON.stringify(c), saved);
});

test('conserva el objetivo configurado de 20 aunque la recompensa admita 30', () => {
  const c = config({ modelDownloads: observed(24,30) });
  c.tasks.modelDownloads.dailyLimit = 20;
  reconcileDailyPlans(c, [], now);
  const p = dailyProgress(c, [], now);
  assert.equal(p.counters.modelDownloads, 24);
  assert.equal(p.limits.modelDownloads, 30);
  assert.equal(p.remaining.modelDownloads, 0);
  assert.equal(c.tasks.modelDownloads.nextRunAt, '');
  assert.equal(c.tasks.modelDownloads.dailyLimit, 20);
});

test('un resultado local más reciente actualiza el total remoto sin sumarlo dos veces', () => {
  const c = config({ modelDownloads: observed(24,30,'2026-10-04T09:00:00Z') });
  const run = structuredClone(localDownload);
  run.details.downloaded[0].rewardVerification = { after: { ...observed(25,30), title: 'Download Models' } };
  const p = dailyProgress(c, [run], now);
  assert.equal(p.counters.modelDownloads,25);
  assert.equal(p.remaining.modelDownloads,5);
});

test('conserva el progreso de una tarea omitida aunque no se añada una ejecución al Log', () => {
  const c=config();
  applyRewardResult(c,'modelDownloads',{skipped:true,details:{rewardVerification:{before:{...observed(30,30),title:'Download Models'}}}},now);
  assert.equal(dailyProgress(c,[],now).counters.modelDownloads,30);
  applyRewardResult(c,'modelDownloads',{details:{rewardVerification:{after:{...observed(24,30,'2026-10-04T09:00:00Z'),title:'Download Models'}}}},now);
  assert.equal(dailyProgress(c,[],now).counters.modelDownloads,30);
});

test('los datos de ayer no completan recompensas de hoy', () => {
  const c = config({ modelDownloads: observed(30,30,'2026-10-03T10:00:00Z') });
  c.points.transactions = [{ date: '2026-10-03', amount: 1, sourceType: 'Use MakeNow' }];
  assert.equal(dailyProgress(c, [], now).counters.modelDownloads,0);
  assert.equal(dailyProgress(c, [], now).counters.makeNow,0);
});

test('el cambio de día usa Europe/Madrid', () => {
  const c = config({ modelDownloads: observed(30,30,'2026-10-04T21:59:00Z') });
  assert.equal(dailyProgress(c, [], new Date('2026-10-04T22:01:00Z')).counters.modelDownloads,0);
});

test('11 puntos de comentarios representan cinco con imagen y uno de texto', () => {
  const c = config();
  c.points.transactions = [ ...Array.from({ length: 5 }, (_,i) => ({ date, time: `10:0${i}:00`, sourceType: 'Image comments', amount: 2 })),
    { date, time: '11:00:00', sourceType: 'Comment on models', amount: 1 } ];
  const p = dailyProgress(c, [], now);
  assert.equal(p.counters.comments,6);
  assert.equal(p.remaining.comments,0);
  reconcileDailyPlans(c, [], now);
  assert.equal(c.tasks.comments.nextRunAt,'');
});

test('elimina únicamente los tipos de comentario completados externamente', () => {
  const c = config({ commentImage: observed(5,5), commentText: observed(0,1) });
  reconcileDailyPlans(c, [], now);
  assert.deepEqual(c.tasks.comments.commentKindPlan,['text']);
  assert.equal(c.tasks.comments.commentPlan.length,1);
  assert.equal(c.tasks.comments.nextRunAt,slots(2)[1]);
});

test('quince puntos de impresión no se convierten en quince impresiones', () => {
  const c = config({ finishPrint: observed(3,10) });
  c.points.transactions = Array.from({length:3},()=>({ date, sourceType:'Finish a Print', amount:5 }));
  assert.equal(dailyProgress(c, [], now).counters.finishPrint,3);
  assert.equal(dailyProgress(c, [], now).remaining.finishPrint,7);
});

test('no confunde ingresos por descargas recibidas con descargas realizadas', () => {
  const c = config();
  c.points.transactions = [{ date, sourceType:'Your model has reached 100 usage', type:'Descargas recibidas', amount:10 }];
  assert.equal(dailyProgress(c, [], now).counters.modelDownloads,0);
});

test('check-in completado con bonos cuenta una vez', () => {
  const c = config();
  c.points.transactions = [{ date,type:'Check-in diario',amount:1 },{ date,type:'Check-in diario',amount:7 }];
  assert.equal(dailyProgress(c, [], now).counters.creality,1);
});

test('tareas diarias completas pasan a la ventana siguiente sin desactivarlas', () => {
  const c = config({ modelLikes: observed(1,1), modelCollections:observed(1,1), makeNow:observed(1,1),creality:observed(1,1) });
  reconcileDailyPlans(c, [], now);
  for(const key of ['modelLikes','modelCollections','makeNow','creality']) {
    assert.equal(c.tasks[key].enabled,true);
    assert.ok(new Date(c.tasks[key].nextRunAt) > now);
    assert.notEqual(c.tasks[key].nextRunAt.slice(0,10),date);
  }
});

test('una respuesta parcial o antigua conserva las observaciones válidas', () => {
  const previous = { modelDownloads:observed(24,30),makeNow:observed(1,1) };
  const merged = mergeProgressObservations(previous,{modelDownloads:observed(0,30,'2026-10-04T09:00:00Z')});
  assert.equal(merged.modelDownloads.done,24);
  assert.equal(merged.makeNow.done,1);
  const delayed = mergeProgressObservations(previous,{ modelDownloads:observed(20,30,'2026-10-04T10:01:00Z') });
  assert.equal(delayed.modelDownloads.done,24);
  const nextDay = mergeProgressObservations(previous,{ modelDownloads:observed(0,30,'2026-10-05T10:01:00Z') });
  assert.equal(nextDay.modelDownloads.done,0);
});

test('una lectura fallida no pone a cero un progreso válido del mismo día', () => {
  const c = config({modelDownloads:observed(24,30)});
  c.dailyProgress.status='stale';
  assert.equal(dailyProgress(c, [], now).counters.modelDownloads,24);
});

test('sincronización con caché de cinco minutos y renovación al cambiar de día', () => {
  const c = config();
  c.dailyProgress.lastAttemptAt='2026-10-04T09:56:00Z';
  assert.equal(progressSyncDue(c,now),false);
  c.dailyProgress.lastAttemptAt='2026-10-04T09:54:00Z';
  assert.equal(progressSyncDue(c,now),true);
  c.dailyProgress.lastAttemptAt='2026-10-04T21:59:00Z';
  assert.equal(progressSyncDue(c,new Date('2026-10-04T22:01:00Z')),true);
});

test('la consulta de check-in es de lectura y no pulsa ningún botón', async () => {
  const empty = { first(){return this;},isVisible:async()=>false,count:async()=>0,innerText:async()=> 'Creality Cloud daily checkin page with a complete loaded body' };
  const button = { first(){return this;},isVisible:async()=>true,waitFor:async()=>{},textContent:async()=> 'Registrado', click:()=>{throw Error('must not click');} };
  const page = { goto:async()=>{},waitForTimeout:async()=>{},url:()=> 'https://www.crealitycloud.com/check-in',title:async()=> 'Creality Cloud',frames:()=>[],
    locator: selector => selector === '.sign-in-action .sign-in-btn' ? button : empty };
  assert.equal((await readCheckinProgress(page,null)).done,1);
});

test('varias impresoras comparten el cupo restante sin atribuir trabajo externo a una', () => {
  const c = config({finishPrint:observed(8,10)});
  c.tasks.finishPrint = { enabled:true,totalDailyLimit:20,timezone:'Europe/Madrid',printerProfiles:[
    {id:'a',printerName:'A',dailyLimit:10,printPlanDate:date,printPlan:slots(10),printPlanCursor:0,nextRunAt:slots(1)[0]},
    {id:'b',printerName:'B',dailyLimit:10,printPlanDate:date,printPlan:slots(10),printPlanCursor:0,nextRunAt:slots(1)[0]}
  ] };
  reconcileDailyPlans(c,[],now);
  assert.equal(c.tasks.finishPrint.printerProfiles.reduce((sum,p)=>sum+p.printPlan.length-p.printPlanCursor,0),2);
  assert.equal(c.tasks.finishPrint.printerProfiles[0].printPlanDoneCount,0);
});

test('una impresión pendiente conserva el siguiente hueco hasta resolver su verificación', () => {
  const c = config({finishPrint:observed(9,10)});
  c.tasks.finishPrint = { enabled:true,totalDailyLimit:10,timezone:'Europe/Madrid',pendingVerification:{printId:'pending'},printerProfiles:[
    {id:'a',printerName:'A',dailyLimit:10,printPlanDate:date,printPlan:slots(10),printPlanCursor:0,nextRunAt:slots(1)[0]}
  ] };
  reconcileDailyPlans(c,[],now);
  assert.equal(c.tasks.finishPrint.printerProfiles[0].printPlan.length,1);
  assert.equal(c.tasks.finishPrint.pendingVerification.printId,'pending');
});
