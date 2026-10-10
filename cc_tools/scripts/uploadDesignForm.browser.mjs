import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import {chromium} from 'playwright';
import {submitUploadForm,selectUploadCategory,acceptCopyrightDeclaration,CREATE_MODEL_URL,CREATE_MODEL_PATH} from '../src/uploadDesignForm.js';
import {addModel,png} from '../test/uploadDesignFixtures.js';
let browser,server,url,base,model,requests=[],reserved=false,responseCode=0,invalidForm=false;
before(async()=>{
  base=await fs.mkdtemp(path.join(os.tmpdir(),'cc-form-'));const folder=await addModel(base,'case');
  model={name:'case',tags:['caja','organizador'],description:'Una caja.\nSegunda línea.',modelPath:path.join(folder,'case.3mf'),coverPath:path.join(folder,'portada.png')};
  const app=express();app.use(express.json());app.use((req,res,next)=>{res.set('Access-Control-Allow-Origin','*');res.set('Access-Control-Allow-Headers','Content-Type');res.set('Access-Control-Allow-Private-Network','true');if(req.method==='OPTIONS')res.sendStatus(204);else next();});
  app.get('/form',(_req,res)=>res.type('html').send(form(invalidForm)));
  app.post(CREATE_MODEL_PATH,(req,res)=>{requests.push({payload:req.body,reserved});res.json({code:responseCode,msg:'Rechazo de prueba',result:responseCode===0?{groupItem:{id:'fixture-id'}}:{}});});
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));url=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
});
after(async()=>{await browser?.close();if(server)await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});if(base)await fs.rm(base,{recursive:true,force:true});});
function form(invalid=false){return `<!doctype html><meta charset="utf-8"><style>[hidden]{display:none!important}input,button,[contenteditable]{min-height:24px} .el-dialog{position:fixed;top:10px;left:10px;background:white;padding:30px;z-index:10}.category-cascader{display:flex}.el-cascader-menu{height:180px;overflow:auto;width:220px}.el-cascader-node{position:relative;min-height:32px}.el-cascader-node .el-radio{position:absolute;top:0;bottom:0;left:10px;right:0;z-index:1}.closing{animation:closeMenu .4s linear}@keyframes closeMenu{from{transform:scaleY(1)}to{transform:scaleY(.8)}}.el-cascader-node input{opacity:0}</style>
<div class="creality-print-content"><div class="upload-3mf"><input type="file" id="model" onchange="document.getElementById('plate').hidden=false"></div><div id="plate" class="plate-thumbnail" hidden>Plataforma 1</div></div>
<div class="second-step" hidden>
<div class="model-name-content"><input value="case"></div><div class="model-origin-content">Original</div><div class="model-set-price-content">Gratis</div>
<div class="model-category-content"><input onclick="document.getElementById('categories').hidden=false" readonly></div><div class="category-cascader" id="categories" hidden><div class="el-cascader-menu"><div class="el-cascader-node" onmouseenter="document.getElementById('children').hidden=false" onclick="window.parentClicks++"><div>Impresoras 3D</div><label class="el-radio"><input type="radio" name="category" onclick="selectParent()"></label></div></div><div id="children" class="el-cascader-menu" hidden><div class="el-cascader-node">Piezas de impresora 3D</div><div class="el-cascader-node">Accesorios de impresora</div><div class="el-cascader-node">Modelos de prueba</div><div class="el-cascader-node"><div>Otro</div><label class="el-radio"><input type="radio" name="category" onclick="window.selectedScroll=document.getElementById('children').scrollTop;document.querySelector('.model-category-content input').value='Impresoras 3D / Otro';document.getElementById('categories').hidden=true"></label></div></div></div>
<div class="model-tag-content"><input id="tags"></div>
<div class="model-cover-content"><div class="upload-cover" onclick="document.getElementById('cover').click()">Portada</div><input id="cover" type="file" hidden onchange="window.cropKind='web';document.querySelector('.el-dialog').hidden=false"><div class="upload-cover" onclick="document.getElementById('appCover').click()">Portada App</div><input id="appCover" type="file" hidden onchange="window.cropKind='app';document.querySelector('.el-dialog').hidden=false"><div class="upload-cover-last"><input type="file" multiple onchange="galleryUpload(this)"><div id="gallery"></div></div></div>
<div class="model-license-content"><div class="radio-item"><label><input type="radio" name="adapt" value="1" onchange="if(!window.keepThird)document.getElementById('redistribute').hidden=true">Sí</label><label><input type="radio" name="adapt" value="2" checked>No</label></div><div class="radio-item"><label><input type="radio" name="commerce" value="1" checked>Sí</label><label><input type="radio" name="commerce" value="2">No</label></div><div class="radio-item" id="redistribute"><label><input type="radio" name="redistribute" value="1" checked>Sí</label><label><input type="radio" name="redistribute" value="2">No</label></div></div>
<div class="material-box"><label><input type="radio" name="filament" value="true" checked>Sí</label><label><input type="radio" name="filament" value="false">No</label></div>
<div class="model-share-content"><input type="radio" name="share" value="1">Público</div>
<div class="model-detail-content"><div contenteditable="true"></div></div>
<div class="model-instructions-content"><input type="file" aria-label="Archivos de instrucciones"></div>
<div class="model-detail-content3"><div contenteditable="true" aria-label="Descripción del ajuste de impresión"></div></div></div>
<div class="el-dialog" hidden><div class="cropper-container">Recorte</div><button onclick="if(window.cropKind==='web')window.coverReady=true;else window.appCoverReady=true;window.uploadOrder.push(window.cropKind);this.parentElement.hidden=true">Confirmar</button></div>
<footer><div class="step-one-btn" onclick="this.hidden=true;document.querySelector('.second-step').hidden=false;document.getElementById('finish').hidden=false">Siguiente</div><div id="finish" hidden><label><input type="checkbox" id="agreement">He leído y acepto <strong onclick="event.preventDefault();document.getElementById('copyright').hidden=false">Declaración de derechos de autor.</strong></label><div class="submit" onclick="deliver()">Entregar</div></div></footer>
<div class="el-dialog" id="copyright" hidden><h2>Declaración de derechos de autor</h2><div class="source-rule-content">Declaro que todos los archivos 3D digitales cargados son obra original mía.</div><button onclick="window.copyrightConfirmations=(window.copyrightConfirmations||0)+1;document.getElementById('agreement').checked=!window.preventAcceptance;this.parentElement.hidden=true">Confirmar</button></div>
<script>
window.uploadOrder=[];window.galleryFiles=[];
function galleryUpload(input){const file=input.files[0];window.uploadOrder.push(file.name);const item=document.createElement('div');item.className='model-cover-item loading-work';item.textContent=file.name;document.getElementById('gallery').append(item);setTimeout(()=>{window.galleryFiles.push(file.name);item.classList.remove('loading-work');},100);}
window.parentSelections=0;window.parentClicks=0;
function selectParent(){window.parentSelections++;document.querySelector('.model-category-content input').value='Impresoras 3D';const menu=document.getElementById('categories');menu.classList.add('closing');setTimeout(()=>{menu.hidden=true;menu.classList.remove('closing')},250);}
const tags=[];document.getElementById('tags').addEventListener('keydown',event=>{if(event.key!=='Enter')return;tags.push(event.target.value);const span=document.createElement('span');span.className='el-tag';span.textContent=event.target.value;event.target.parentElement.append(span);event.target.value='';});
async function deliver(){if(!document.querySelector('footer input[type=checkbox]').checked)throw Error('Acuerdo sin aceptar');const payload={groupItem:{modelSource:1,isPay:${invalid},isShared:document.querySelector('[name=share]:checked')?.value==='1',license:document.querySelector('[name=adapt]:checked')?.value==='1'&&document.querySelector('[name=commerce]:checked')?.value==='2'?'CC BY-NC':'wrong',groupName:document.querySelector('.model-name-content input').value,categoryId:document.querySelector('.model-category-content input').value.endsWith('/ Otro')?'other':null,tags,groupDesc:document.querySelector('[contenteditable]').innerHTML,pcCovers:window.coverReady?['cover']:[],appCovers:window.appCoverReady&&!window.dropAppCover?[{url:'https://example.test/app.png'}]:[],covers:window.galleryFiles.map(name=>({url:'https://example.test/'+name})),colorFilament:[{type:'PLA',color:'#ffffff',...(document.querySelector('[name=filament]:checked').value==='true'?{skuId:'creality-sku',url:'https://example.test/filament'}:{})}]},model3mf:{filekey:'file'}};await fetch('${url+CREATE_MODEL_PATH}',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}).catch(()=>{});}
</script>`;}
async function setup(t,invalid=false){
  requests=[];reserved=false;invalidForm=invalid;const page=await browser.newPage();t.after(()=>page.close());
  const navigate=page.goto.bind(page);page.goto=(target,options)=>{assert.equal(target,CREATE_MODEL_URL);return navigate(url+'/form',options);};
  await page.route('**/*',async route=>{
    const target=route.request().url();
    if(target===CREATE_MODEL_URL)return route.fulfill({contentType:'text/html',body:form(invalid)});
    if(target.startsWith(url+'/'))return route.continue();
    return route.abort();
  });
  return page;
}
test('recorre 3MF, categoría, etiquetas, recorte, licencia, descripción y entrega una sola vez',async t=>{
  responseCode=0;const page=await setup(t);
  const result=await submitUploadForm(page,model,{beforeSubmit:async()=>{reserved=true;},timeout:5000});
  assert.equal(result.id,'fixture-id');assert.equal(requests.length,1);assert.equal(requests[0].reserved,true);
  assert.equal(requests[0].payload.groupItem.license,'CC BY-NC');assert.deepEqual(requests[0].payload.groupItem.tags,model.tags);
  assert.deepEqual(requests[0].payload.groupItem.colorFilament,[{type:'PLA',color:'#ffffff'}]);
  assert.equal(await page.locator('[name=redistribute][value="2"]').isChecked(),true);
  assert.equal(await page.locator('#redistribute').isVisible(),false);
  assert.equal(await page.locator('footer input[type=checkbox]').isChecked(),true);
  assert.equal(await page.evaluate(()=>window.copyrightConfirmations),1);
  assert.equal(await page.evaluate(()=>window.selectedScroll),0);assert.equal(await page.evaluate(()=>window.parentSelections),0);assert.equal(await page.evaluate(()=>window.parentClicks),0);
  assert.equal(await page.locator('.model-instructions-content input').evaluate(el=>el.files.length),0);
  assert.equal(await page.locator('.model-detail-content3 [contenteditable]').innerText(),'');
});
test('reproduce texto cubierto y cierre diferido; selecciona Otro con hover sobre la fila y un solo clic en Otro',async t=>{
  const page=await setup(t);await page.goto(CREATE_MODEL_URL);await page.locator('footer .step-one-btn').click();
  await page.locator('.model-category-content input').click();
  await assert.rejects(page.locator('.category-cascader').getByText(/^Impresoras 3D$/).hover({timeout:500}),/intercepts pointer events/);
  await page.locator('.el-cascader-menu').first().locator('.el-cascader-node').click();
  await assert.rejects(page.locator('#children .el-cascader-node').last().scrollIntoViewIfNeeded({timeout:800}),/Timeout/);
  assert.equal(await page.locator('#categories').isVisible(),false);
  await page.evaluate(()=>{window.parentSelections=0;window.parentClicks=0;});
  await selectUploadCategory(page,page.locator('.second-step'));
  assert.equal(await page.locator('.model-category-content input').inputValue(),'Impresoras 3D / Otro');
  assert.equal(requests.length,0);assert.equal(await page.evaluate(()=>window.parentSelections),0);assert.equal(await page.evaluate(()=>window.parentClicks),0);
});
test('marca No también cuando la tercera pregunta permanece visible',async t=>{
  responseCode=0;const page=await setup(t);await page.addInitScript(()=>window.keepThird=true);
  await submitUploadForm(page,model,{beforeSubmit:async()=>{reserved=true;},timeout:5000});
  assert.equal(await page.locator('#redistribute').isVisible(),true);
  assert.equal(await page.locator('[name=redistribute][value="2"]').isChecked(),true);
});
test('acepta el popup ya abierto y no repite una declaración aceptada',async t=>{
  const page=await setup(t);await page.goto(CREATE_MODEL_URL);await page.locator('footer .step-one-btn').click();
  await page.locator('footer strong').click();
  assert.equal(await page.locator('#agreement').isChecked(),false);
  await acceptCopyrightDeclaration(page);await acceptCopyrightDeclaration(page);
  assert.equal(await page.locator('#agreement').isChecked(),true);
  assert.equal(await page.evaluate(()=>window.copyrightConfirmations),1);
  assert.equal(requests.length,0);
});
test('impide entregar si Confirmar no deja aceptada la declaración',async t=>{
  const page=await setup(t);await page.addInitScript(()=>window.preventAcceptance=true);
  await assert.rejects(submitUploadForm(page,model,{beforeSubmit:async()=>{reserved=true;},timeout:5000}),{code:'UPLOAD_FORM_MISMATCH'});
  assert.equal(await page.evaluate(()=>window.copyrightConfirmations),1);
  assert.equal(requests.length,0);assert.equal(reserved,false);
});
test('bloquea el envío antes de salir si los datos finales cambian',async t=>{
  const page=await setup(t,true);
  await assert.rejects(submitUploadForm(page,model,{beforeSubmit:async()=>{reserved=true;},timeout:5000}),{code:'UPLOAD_FORM_MISMATCH'});
  assert.equal(requests.length,0);assert.equal(reserved,false);
});
test('distingue un rechazo explícito del resultado incierto',async t=>{
  responseCode=1001;const page=await setup(t);
  await assert.rejects(submitUploadForm(page,model,{beforeSubmit:async()=>{reserved=true;},timeout:5000}),{code:'UPLOAD_REJECTED'});assert.equal(requests.length,1);
});

test('sube portada web, portada App y nueve imágenes en orden, sin llenar los campos opcionales de instrucciones',async t=>{
  responseCode=0;const page=await setup(t);const appCoverPath=path.join(base,'portada2.png');await fs.writeFile(appCoverPath,png(90,120));
  const imagePaths=[];for(let i=1;i<=9;i++){const file=path.join(base,'imagen'+i+'.png');await fs.writeFile(file,png());imagePaths.push(file);}
  await submitUploadForm(page,{...model,appCoverPath,imagePaths},{beforeSubmit:async()=>{reserved=true;},timeout:5000});
  assert.deepEqual(await page.evaluate(()=>window.uploadOrder),['web','app',...imagePaths.map(p=>path.basename(p))]);
  assert.equal(requests.length,1);assert.equal(requests[0].payload.groupItem.appCovers.length,1);assert.equal(requests[0].payload.groupItem.covers.length,9);
  assert.equal(await page.locator('.model-instructions-content input').evaluate(el=>el.files.length),0);
  assert.equal(await page.locator('.model-detail-content3 [contenteditable]').innerText(),'');
});
test('bloquea la entrega si la portada App falta en los datos finales',async t=>{
  const page=await setup(t);await page.addInitScript(()=>window.dropAppCover=true);
  await assert.rejects(submitUploadForm(page,{...model,appCoverPath:model.coverPath},{beforeSubmit:async()=>{reserved=true;},timeout:5000}),{code:'UPLOAD_FORM_MISMATCH'});
  assert.equal(requests.length,0);assert.equal(reserved,false);
});
