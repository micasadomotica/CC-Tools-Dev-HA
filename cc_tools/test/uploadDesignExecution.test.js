import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { createUploadLibrary, coverDimensions } from '../src/uploadDesignLibrary.js';
import { runUploadDesigns } from '../src/uploadDesignTask.js';
import { runUploadCleanup, verifyPublishedUploads } from '../src/uploadDesignCleanup.js';
import { uploadScheduleItems } from '../src/uploadDesignSchedule.js';
import { validateUploadPayload } from '../src/uploadDesignForm.js';
import { dailyProgress, progressDay } from '../src/dailyProgress.js';
import { updateNextRunAfterExecution } from '../src/scheduler.js';
import { addModel, modelZip, png } from './uploadDesignFixtures.js';

async function fixture(t, count=2) {
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'cc-upload-exec-')),root=path.join(base,'models');
  t.after(()=>fs.rm(base,{recursive:true,force:true}));
  const library=createUploadLibrary({root,dataDir:path.join(base,'data')}); await library.ensureRoot();
  for(let n=0;n<count;n++) await addModel(root,'modelo'+n);
  const items=(await library.scan()).inventory;
  return {root,library,items};
}
function deps(library, submit) {
  const page=new EventEmitter();page.close=async()=>{};page.screenshot=async()=>{throw new Error('fixture');};
  return {library,browser:async(_,callback)=>callback({newPage:async()=>page}),verifyAccount:async()=>{},
    readReward:async()=>({found:true,done:0,valid:5,title:'Upload Models',checkedAt:new Date().toISOString()}),
    submit:submit|| (async(_,model,{beforeSubmit})=>{await beforeSubmit();return{id:model.id,name:model.name,url:'https://www.crealitycloud.com/es/model-detail/'+model.id};})};
}
test('importa tres archivos, crea biblioteca y publica la carpeta solo tras validar',async t=>{
  const {library,root}=await fixture(t,0), {token}=await library.beginImport();
  await library.importFile(token,'model','case.3mf',Readable.from(await modelZip('case')));
  await library.importFile(token,'cover','portada.png',Readable.from(png()));
  assert.equal((await library.scan()).inventory.length,0);
  await assert.rejects(library.finishImport(token),/Faltan archivos/);
  await library.importFile(token,'info','info.txt',Readable.from('ETIQUETAS: caja\nDESCRIPCION:\nUna caja'));
  const state=await library.finishImport(token);assert.equal(state.inventory.length,1);assert.equal(state.inventory[0].valid,true);
  assert.equal((await fs.readdir(root)).some(name=>name.startsWith('.')),false);
});
test('rechaza rutas, tipos y archivos grandes; cancela importación sin tocar otros modelos',async t=>{
  const {library,root}=await fixture(t),{token}=await library.beginImport();
  await assert.rejects(library.importFile(token,'model','../a.3mf',Readable.from('x')),/no válido/);
  await assert.rejects(library.importFile(token,'info','info.txt',Readable.from(Buffer.alloc(32769))),/tamaño/);
  await assert.rejects(library.importFile(token,'cover','script.html',Readable.from('x')),/Selecciona/);
  await library.cancelImport(token);assert.equal((await fs.readdir(root)).length,2);
});
test('WebP reconoce VP8L y VP8X, rechaza animación y datos truncados',()=>{
  const lossless=Buffer.alloc(6);lossless[0]=0x2f;lossless.writeUInt32LE(119|(89<<14),1);
  const chunk=(kind,data)=>{const h=Buffer.alloc(8);h.write(kind);h.writeUInt32LE(data.length,4);return Buffer.concat([h,data,Buffer.alloc(data.length%2)]);};
  const riff=(chunks)=>{const h=Buffer.alloc(12);h.write('RIFF');h.writeUInt32LE(4+chunks.length,4);h.write('WEBP',8);return Buffer.concat([h,chunks]);};
  const simple=riff(chunk('VP8L',lossless));assert.deepEqual(coverDimensions(simple),{width:120,height:90,type:'image/webp'});
  const extended=Buffer.alloc(10);extended.writeUIntLE(119,4,3);extended.writeUIntLE(89,7,3);
  assert.equal(coverDimensions(riff(Buffer.concat([chunk('VP8X',extended),chunk('VP8L',lossless)]))).width,120);
  extended[0]=2;assert.throws(()=>coverDimensions(riff(Buffer.concat([chunk('VP8X',extended),chunk('VP8L',lossless)]))),/estática/);
  assert.throws(()=>coverDimensions(simple.subarray(0,-2)),/incompleta/);
});
test('envío manual completo persiste IDs, mantiene recompensa pendiente e impide duplicados tras reiniciar',async t=>{
  const {library,items}=await fixture(t);
  const result=await runUploadDesigns({}, {ownUserId:'user',selected:items},deps(library));
  assert.equal(result.details.uploaded.length,2);assert.equal(result.details.rewardPending,true);
  const state=await library.status();assert.ok(Object.values(state.ledger.user).every(entry=>entry.status==='submitted'));
  assert.equal((await runUploadDesigns({}, {ownUserId:'user',selected:items},deps(library))).details.emptyLibrary,true);
  assert.equal(dailyProgress({tasks:{uploadDesigns:{dailyLimit:5}}},[{taskId:'uploadDesigns',status:'success',finishedAt:new Date().toISOString(),details:result.details}]).counters.uploadDesigns,0);
  assert.equal((await library.candidates({account:'another',source:'manual',day:progressDay(),limit:5,selected:items})).items.length,2);
});
test('un resultado incierto bloquea reintentos, un rechazo explícito permite revisión manual',async t=>{
  const {library,items}=await fixture(t);
  const failure=await runUploadDesigns({}, {ownUserId:'user',selected:[items[0]]},deps(library,async(_,model,{beforeSubmit})=>{await beforeSubmit();throw new Error('sin respuesta');}));
  assert.equal(failure.details.failures[0].uncertain,true);
  assert.equal((await library.candidates({account:'user',source:'manual',day:progressDay(),limit:5,selected:[items[0]]})).items.length,0);
  await runUploadDesigns({}, {ownUserId:'user',selected:[items[1]]},deps(library,async(_,model,{beforeSubmit})=>{await beforeSubmit();throw Object.assign(new Error('rechazado'),{code:'UPLOAD_REJECTED'});}));
  assert.equal((await library.candidates({account:'user',source:'manual',day:progressDay(),limit:5,selected:[items[1]]})).items.length,1);
});
test('programación escanea nuevos diseños, respeta el límite común y rechaza otra cuenta',async t=>{
  const {library,items,root}=await fixture(t,3);
  await library.saveSchedule({enabled:true,dailyLimit:2,windowStart:'08:00',windowEnd:'12:00',selected:items.slice(1)});
  const task={accountId:'user',dailyLimit:2};
  await assert.rejects(runUploadDesigns(task,{ownUserId:'other',source:'schedule'},deps(library)),/otra cuenta/);
  const result=await runUploadDesigns(task,{ownUserId:'user',source:'schedule'},deps(library));assert.equal(result.details.uploaded.length,2);
  assert.equal((await library.candidates({account:'user',source:'schedule',day:progressDay(),limit:2})).items.length,0);
  await addModel(root,'nuevo');
  const next=await library.candidates({account:'user',source:'schedule',day:'2099-01-01',limit:2});assert.equal(next.items.length,2);assert.ok(next.items.some(item=>item.name==='nuevo'));
});
test('manual no aplaza el horario programado; ejecución diaria avanza al día siguiente',()=>{
  const task={windowStart:'08:00',windowEnd:'12:00',nextRunAt:'2026-10-10T09:00:00Z'};
  updateNextRunAfterExecution(task,'uploadDesigns','manual',{});assert.equal(task.nextRunAt,'2026-10-10T09:00:00Z');
  updateNextRunAfterExecution(task,'uploadDesigns','schedule',{},new Date('2026-10-10T08:00:00'));assert.ok(new Date(task.nextRunAt).getDate()===11);
});
test('Planificación distingue un fallo de una entrega y muestra el siguiente lote',()=>{
  const now=new Date('2026-10-10T09:00:00Z'),task={enabled:true,timezone:'Europe/Madrid',dailyLimit:3,nextRunAt:'2026-10-10T10:00:00Z'};
  const items=uploadScheduleItems(task,[{taskId:'uploadDesigns',source:'schedule',status:'failed',finishedAt:'2026-10-10T08:00:00Z'}],now);
  assert.deepEqual(items.map(item=>item.status),['failed','pending']);assert.match(items[1].detail,/3 diseños/);
  assert.deepEqual(uploadScheduleItems({...task,enabled:false},[],now),[]);
});
test('guardia de entrega exige los datos del usuario y la licencia solicitada',()=>{
  const model={name:'case',tags:['caja'],description:'Mi diseño'};
  const payload={groupItem:{modelSource:1,isPay:false,isShared:true,license:'CC BY-NC',groupName:'case',categoryId:'other',tags:['caja'],pcCovers:['cover']},model3mf:{filekey:'file'}};
  assert.doesNotThrow(()=>validateUploadPayload(payload,model,'Mi diseño'));
  for(const patch of [{isPay:true},{license:'CC0'},{isShared:false},{tags:['otra']},{pcCovers:[]},{colorFilament:[{type:'PLA',skuId:'sku'}]},{colorFilament:[{url:'https://example.test/filament'}]}])assert.throws(()=>validateUploadPayload({...payload,groupItem:{...payload.groupItem,...patch}},model,'Mi diseño'));
  assert.doesNotThrow(()=>validateUploadPayload({...payload,groupItem:{...payload.groupItem,colorFilament:[{type:'PLA',color:'#fff'}]}},model,'Mi diseño'));
});

test('limpieza desactivada por defecto, conserva modelos del día y necesita confirmación pública',async t=>{
  const {library,items,root}=await fixture(t,1),entry=items[0];
  await library.record('user',entry,{status:'submitted',id:'public-id',day:progressDay(),source:'manual'});
  let checks=0;const options={ownUserId:'user'},task={accountId:'user',cleanupEnabled:true};
  const dependencies={library,verify:async()=>{checks++;return {account:'user',ids:['public-id'],checkedAt:new Date().toISOString()};}};
  await runUploadCleanup(task,options,dependencies);assert.equal(checks,0);assert.ok(await fs.stat(path.join(root,entry.folder)));
  await library.record('user',entry,{status:'submitted',id:'public-id',day:'2020-01-01'});
  await runUploadCleanup({...task,cleanupEnabled:false},options,dependencies);assert.equal(checks,0);
  await runUploadCleanup(task,options,{...dependencies,verify:async()=>({account:'user',ids:[],checkedAt:new Date().toISOString()})});
  assert.ok(await fs.stat(path.join(root,entry.folder)));
  const result=await runUploadCleanup(task,options,dependencies);assert.equal(result.details.cleaned.length,1);
  await assert.rejects(fs.stat(path.join(root,entry.folder)),{code:'ENOENT'});
  const ledger=(await library.status()).ledger.user[entry.modelHash];assert.ok(ledger.cleanedAt);assert.equal(ledger.status,'submitted');
});
test('limpieza conserva archivos editados, carpetas con extras, envíos inciertos y otras cuentas',async t=>{
  const {library,items,root}=await fixture(t,3);
  for(const [index,entry] of items.entries())await library.record('user',entry,{status:index===2?'uncertain':'submitted',id:'id-'+index,day:'2020-01-01'});
  await fs.appendFile(path.join(root,items[0].folder,'info.txt'),'\nCambio posterior');
  await fs.writeFile(path.join(root,items[1].folder,'conservar.txt'),'conservar');
  const proof={account:'user',ids:['id-0','id-1','id-2'],checkedAt:new Date().toISOString()};
  await assert.rejects(library.removePublished('other',{...items[0],id:'id-0'},proof,progressDay()),/confirmación/);
  const result=await runUploadCleanup({accountId:'user',cleanupEnabled:true},{ownUserId:'user'},{library,verify:async()=>proof});
  assert.equal(result.details.cleaned.length,0);assert.equal((await fs.readdir(root)).length,3);
});
test('comprobación pública exige identidad y enlace en la lista del perfil, no recomendaciones',async()=>{
  const id='6a60842144eb4483e2202bed';let visible='ID: 12345',listed=true,current='';
  const nuxt=JSON.stringify([['ShallowReactive',1],{data:2},['ShallowReactive',3],{'model-info_case':4},{code:5,result:6},0,{groupItem:7},{id:8},id]);
  const page={goto:async url=>{current=url.includes('model-detail')?'https://www.crealitycloud.com/es/model-detail/case':url;},url:()=>current,
    locator:selector=>({textContent:async()=>selector==='#__NUXT_DATA__'?nuxt:visible,first(){return this;},waitFor:async()=>{},evaluateAll:async()=>listed?['https://www.crealitycloud.com/es/model-detail/case']:[]}),evaluate:async()=>{},waitForTimeout:async()=>{}};
  const browser=async(_,callback)=>callback({newPage:async()=>page,close:async()=>{}});
  assert.deepEqual((await verifyPublishedUploads('12345',[{id}],undefined,browser)).ids,[id]);
  listed=false;assert.deepEqual((await verifyPublishedUploads('12345',[{id}],undefined,browser)).ids,[]);
  visible='ID: 98765';await assert.rejects(verifyPublishedUploads('12345',[{id}],undefined,browser),/identidad/);
});

test('escanea y prepara portada App y hasta nueve imágenes en orden, detectando cambios',async t=>{
  const {library,root}=await fixture(t,1),folder=path.join(root,'modelo0');
  await fs.writeFile(path.join(folder,'portada2.png'),png(90,120));
  for(let n=9;n>=1;n--)await fs.writeFile(path.join(folder,`imagen${n}.png`),png());
  const item=(await library.scan()).inventory[0];assert.equal(item.valid,true);
  assert.equal(item.appCoverFile,'portada2.png');assert.deepEqual(item.imageFiles,Array.from({length:9},(_,i)=>`imagen${i+1}.png`));
  const ready=await library.prepare(item);assert.equal(ready.appCoverPath,path.join(folder,'portada2.png'));assert.equal(ready.imagePaths.length,9);
  await fs.writeFile(path.join(folder,'imagen9.png'),png(240,180));
  await assert.rejects(library.prepare(item),/ha cambiado/);
});

test('rechaza imágenes opcionales con proporciones, nombres o duplicados incorrectos',async t=>{
  for(const files of [ [['portada2.png',png()]], [['imagen1.png',png(90,120)]], [['imagen10.png',png()]],
    [['imagen0.png',png()]], [['portada2.png',png(90,120)],['PORTADA2.PNG',png(90,120)]],
    [['imagen1.png',png()],['imagen1.jpg',png()]] ]) {
    // Distinct extensions also exercise case-insensitive duplicate slot detection on Windows.
    if(files.length===2&&files[1][0]==='PORTADA2.PNG')files[1][0]='PORTADA2.jpg';
    const {library,root}=await fixture(t,1);
    for(const [name,data] of files)await fs.writeFile(path.join(root,'modelo0',name),data);
    const item=(await library.scan()).inventory[0];assert.equal(item.valid,false,files[0][0]);assert.ok(item.errors.length);
  }
});

test('importa los trece archivos y valida los opcionales antes de publicar la carpeta',async t=>{
  const {library}=await fixture(t,0),{token}=await library.beginImport();
  await library.importFile(token,'model','case.3mf',Readable.from(await modelZip('case')));
  await library.importFile(token,'info','info.txt',Readable.from('ETIQUETAS: caja\nDESCRIPCION: Caja'));
  await library.importFile(token,'cover','portada.png',Readable.from(png()));
  await library.importFile(token,'appCover','PORTADA2.png',Readable.from(png(90,120)));
  for(let n=1;n<=9;n++)await library.importFile(token,'image'+n,`imagen${n}.png`,Readable.from(png()));
  await assert.rejects(library.importFile(token,'image10','imagen10.png',Readable.from(png())),/no válido/);
  const state=await library.finishImport(token);assert.equal(state.inventory[0].valid,true);assert.equal(state.inventory[0].imageFiles.length,9);
  const next=await library.beginImport();await assert.rejects(library.importFile(next.token,'appCover','portada.png',Readable.from(png())),/nombres/);
  await library.cancelImport(next.token);
});

test('limpia las imágenes opcionales confirmadas y conserva diseños si se modifican',async t=>{
  const {library,root}=await fixture(t,2);
  for(const folder of ['modelo0','modelo1']) {
    await fs.writeFile(path.join(root,folder,'portada2.png'),png(90,120));
    await fs.writeFile(path.join(root,folder,'imagen1.png'),png());
  }
  const items=(await library.scan()).inventory;
  for(const [i,item] of items.entries())await library.record('user',item,{status:'submitted',id:'id-'+i,day:'2020-01-01'});
  await fs.writeFile(path.join(root,'modelo1','imagen1.png'),png(240,180));
  const result=await runUploadCleanup({accountId:'user',cleanupEnabled:true},{ownUserId:'user'},{library,verify:async()=>({account:'user',ids:['id-0','id-1'],checkedAt:new Date().toISOString()})});
  assert.equal(result.details.cleaned.length,1);await assert.rejects(fs.stat(path.join(root,'modelo0')),{code:'ENOENT'});
  assert.ok(await fs.stat(path.join(root,'modelo1','imagen1.png')));
});
