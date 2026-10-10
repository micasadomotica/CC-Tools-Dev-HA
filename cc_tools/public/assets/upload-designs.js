const $ = id => document.getElementById(id);
const modal = $('uploads-modal');
let library, busy = false, returnFocus;
let draft = { manual: [], schedule: [] };
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const date = value => value ? new Date(value).toLocaleString('es-ES', {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  ...(library?.timezone ? { timeZone: library.timezone } : {})
}) : '-';
async function api(route = '', method = 'GET', body) {
  const response = await fetch('/api/upload-designs' + route, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.message || 'No se pudo acceder a la biblioteca.');
  return result;
}
function message(text, error = false) { $('uploads-message').textContent = text; $('uploads-message').classList.toggle('is-error', error); }
function updateCard() {
  $('uploads-enabled').checked = library?.schedule.enabled === true;
  $('uploads-enabled').disabled = busy || !library;
  $('uploads-last-run').textContent = date(library?.lastRunAt);
  $('uploads-last-run').classList.toggle('is-error', ['failed', 'error'].includes(library?.lastStatus));
  $('uploads-last-run').classList.toggle('is-success', library?.lastStatus === 'success');
  $('uploads-next-run').textContent = library?.schedule.enabled ? date(library.nextRunAt) : '-';
  $('uploads-daily-badge').textContent = `${library?.rewardCount || 0}/${library?.schedule.dailyLimit || 5}`;
  $('uploads-next').textContent = library?.schedule.enabled ? 'Próxima ejecución: ' + date(library.nextRunAt) : 'Programación desactivada.';
}
function accept(result, reset = false) {
  library = result;
  if (reset) {
    draft = { manual: [...result.manual], schedule: [...result.schedule.selected] };
    $('uploads-limit').value = result.schedule.dailyLimit;
    $('uploads-start').value = result.schedule.windowStart; $('uploads-end').value = result.schedule.windowEnd;
    $('uploads-cleanup').checked = result.schedule.cleanupEnabled === true;
  }
  for (const mode of ['manual','schedule']) draft[mode] = draft[mode].filter(entry => result.inventory.some(item => item.available && item.id === entry.id && item.fingerprint === entry.fingerprint));
  $('uploads-root').textContent = result.root;
  $('uploads-scanned').textContent = result.scannedAt ? 'Último escaneo: ' + date(result.scannedAt) : '';
  updateCard(); render();
}
function controls() {
  const n = Number($('uploads-limit').value), count = draft.manual.length;
  $('uploads-manual-count').textContent = `Seleccionados: ${count}/5`;
  $('uploads-plan-count').textContent = `Seleccionados: ${draft.schedule.length}/${n}`;
  const invalid = busy || !library || !!library.libraryError;
  $('uploads-run').disabled = invalid || !count || count > 5;
  $('uploads-program').disabled = invalid || !Number.isInteger(n) || n < 1 || n > 5 || draft.schedule.length !== n || !$('uploads-start').value || !$('uploads-end').value || $('uploads-start').value >= $('uploads-end').value;
  for (const id of ['uploads-scan','uploads-plan-scan','uploads-import','uploads-limit','uploads-start','uploads-end','uploads-cleanup']) $(id).disabled = busy;
  for (const input of modal.querySelectorAll('[data-upload-id]')) {
    const mode = input.dataset.mode, item = library?.inventory.find(item => item.id === input.dataset.uploadId);
    input.disabled = busy || !item?.available || (!input.checked && draft[mode].length >= (mode === 'manual' ? 5 : n));
  }
}
function render() {
  const items = library?.inventory || [];
  $('uploads-library-error').hidden = !library?.libraryError; $('uploads-library-error').textContent = library?.libraryError || '';
  const check = (item,mode) => `<input type="checkbox" data-upload-id="${item.id}" data-mode="${mode}" aria-label="Seleccionar ${escape(item.name)}${mode === 'schedule' ? ' para programar' : ''}" ${draft[mode].some(entry => entry.id === item.id) ? 'checked' : ''}>`;
  $('uploads-list').innerHTML = items.length ? items.map(item => {
    const status = item.delivery?.status;
    const label = status === 'submitted' ? 'Entregado' : ['submitting','uncertain'].includes(status) ? 'Pendiente de comprobar' : item.valid ? 'Disponible' : 'Revisar';
    return `<article class="upload-model">${check(item,'manual')}${item.coverFile ? `<img class="upload-cover" loading="lazy" src="/api/upload-designs/cover/${item.id}?v=${encodeURIComponent(library.scannedAt)}" alt="Portada de ${escape(item.name)}">` : '<div class="upload-cover upload-cover-empty">Sin portada</div>'}<div class="upload-model-body"><div class="upload-model-heading"><strong>${escape(item.name)}</strong><span class="upload-status ${item.available ? 'is-valid' : 'is-invalid'}">${label}</span></div><small class="muted">${escape(item.folder)}</small>${item.errors.map(error=>`<p class="upload-error">${escape(error)}</p>`).join('')}${item.tags ? `<details><summary>Ver información del diseño</summary><p class="upload-tags">${item.tags.map(escape).join(' · ')}</p><p class="upload-description">${escape(item.description)}</p>${(item.warnings||[]).map(w=>`<p class="muted">${escape(w)}</p>`).join('')}</details>`:''}${['submitting','uncertain'].includes(status) ? '<p>Comprueba el Banco de trabajo de Creality antes de volver a enviar este diseño.</p>' : ''}</div></article>`;
  }).join('') : '<div class="upload-empty">No hay diseños en la biblioteca. Pulsa el botón de carpeta para añadir un diseño.</div>';
  $('uploads-plan-list').innerHTML = items.filter(item=>item.available).map(item=>`<label class="upload-plan-option">${check(item,'schedule')}<span>${escape(item.name)}</span></label>`).join('') || '<p class="muted">No hay nuevos diseños disponibles.</p>';
  controls();
}
async function work(action) {
  if(busy) return; busy=true; modal.setAttribute('aria-busy','true'); updateCard(); controls();
  try { await action(); } catch(error) { message(error.message,true); }
  finally { busy=false; modal.removeAttribute('aria-busy'); updateCard(); controls(); }
}
const changed = () => window.dispatchEvent(new Event('uploads-changed'));
async function scan() { message('Escaneando y validando archivos…'); accept(await api('/scan','POST')); message(library.libraryError || `${library.inventory.filter(i=>i.available).length} diseños disponibles.`,!!library.libraryError); }
function expand(id,button,value) { $(id).hidden=!value; $(button).setAttribute('aria-expanded',String(value)); }
async function open(plan=false) {
  returnFocus=document.activeElement; modal.hidden=false; $('close-uploads').focus();
  if(plan) expand('uploads-plan','uploads-plan-toggle',true);
  await work(async()=>{ message('Cargando diseños…'); accept(await api(),true); await scan(); });
}
function close() { modal.hidden=true; returnFocus?.focus(); }
$('open-uploads-config').addEventListener('click',()=>open()); $('close-uploads').addEventListener('click',close);
modal.addEventListener('click',event=>{if(event.target===modal)close();});
document.addEventListener('keydown',event=>{
  if (modal.hidden) return;
  if(event.key==='Escape')close();
  if(event.key==='Tab') {
    const entries=[...modal.querySelectorAll('button,input,summary,a')].filter(e=>!e.disabled&&e.tabIndex!==-1&&e.getClientRects().length);
    if(event.shiftKey&&document.activeElement===entries[0]){event.preventDefault();entries.at(-1)?.focus();}
    else if(!event.shiftKey&&document.activeElement===entries.at(-1)){event.preventDefault();entries[0]?.focus();}
  }
});
for(const [id,button] of [['uploads-help','uploads-help-toggle'],['uploads-plan','uploads-plan-toggle']]) {
  $(button).setAttribute('aria-expanded','false'); $(button).addEventListener('click',()=>expand(id,button,$(id).hidden));
}
for(const id of ['uploads-scan','uploads-plan-scan']) $(id).addEventListener('click',()=>work(scan));
for(const id of ['uploads-limit','uploads-start','uploads-end']) $(id).addEventListener('input',controls);
modal.addEventListener('change',event=>{
  const {uploadId:id,mode}=event.target.dataset;
  if(!id)return;
  draft[mode]=draft[mode].filter(entry=>entry.id!==id);
  if(event.target.checked){const item=library.inventory.find(item=>item.id===id&&item.available);if(item)draft[mode].push({id:item.id,name:item.name,fingerprint:item.fingerprint,modelHash:item.modelHash});}
  controls();
});
$('uploads-enabled').addEventListener('change',event=>{
  if(event.target.checked){updateCard();open(true);}
  else work(async()=>{accept(await api('/schedule/disable','POST'));changed();message('Programación desactivada.');});
});
$('uploads-program').addEventListener('click',()=>work(async()=>{
  accept(await api('/schedule','PUT',{enabled:true,selected:draft.schedule,dailyLimit:Number($('uploads-limit').value),windowStart:$('uploads-start').value,windowEnd:$('uploads-end').value,cleanupEnabled:$('uploads-cleanup').checked}));
  message('Programación guardada. Puedes consultar la próxima ejecución en Planificación.');changed();
}));
$('uploads-run').addEventListener('click',()=>work(async()=>{
  message('Subiendo los diseños a Creality Cloud. Puedes seguir el resultado en Logs.');
  try {
    const result=await api('/run','POST',{selected:draft.manual});accept(result);message(result.result.message,result.result.status!=='success');changed();
  } catch(error) {
    // The executor persists failures even when the HTTP request returns an error.
    const result=await api().catch(()=>null);if(result)accept(result);changed();throw error;
  }
}));
$('uploads-import').addEventListener('click',()=>work(async()=>{
  await api('/library','POST');$('uploads-files').value='';$('uploads-files').click();message('Selecciona el .3mf, info.txt, la portada y, si las tienes, portada2 e imagen1…imagen9.');
}));
$('uploads-files').addEventListener('change',()=>work(async()=>{
  const files=[...$('uploads-files').files];if(!files.length)return;
  const uploads=[];const slots=new Set();
  for(const file of files){
    let kind;
    if(/\.3mf$/i.test(file.name))kind='model';
    else if(/^info\.txt$/i.test(file.name))kind='info';
    else if(/\.(jpg|jpeg|png|webp)$/i.test(file.name)){
      const stem=file.name.replace(/\.[^.]+$/,'').toLowerCase();
      if(stem==='portada2')kind='appCover';
      else if(/^imagen[1-9]$/.test(stem))kind='image'+stem.slice(6);
      else if(/^imagen\d+$/.test(stem))throw new Error('Usa imagen1 hasta imagen9.');
      else kind='cover';
    }
    if(!kind||slots.has(kind))throw new Error('Selecciona un .3mf, info.txt, una portada y como máximo un archivo para portada2 y cada imagen1…imagen9.');
    slots.add(kind);uploads.push([kind,file]);
  }
  if(!['model','info','cover'].every(kind=>slots.has(kind)))throw new Error('Faltan el .3mf, info.txt o la portada web JPG, PNG o WebP.');
  let token;
  try {
    message('Copiando archivos a la carpeta media de Home Assistant…');token=(await api('/imports','POST')).token;
    for(const [kind,file] of uploads){
      const response=await fetch('/api/upload-designs/imports/'+token+'/'+kind,{method:'PUT',headers:{'Content-Type':'application/octet-stream','X-File-Name':encodeURIComponent(file.name)},body:file});
      const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.message||'No se pudo copiar el archivo.');
    }
    accept(await api('/imports/'+token+'/finish','POST'));message('Diseño añadido y validado. Ya puedes seleccionarlo.');
  }catch(error){if(token)await api('/imports/'+token,'DELETE').catch(()=>{});throw error;}
}));
api().then(result=>accept(result,true)).catch(error=>message(error.message,true));
setInterval(()=>{if(!busy)api().then(result=>accept(result)).catch(()=>{});},60000);
