import { withIsolatedBrowser } from './browserManager.js';
import { collectionModelIdFromNuxt } from './modelCollectionApi.js';
import { uploadLibrary } from './uploadDesignLibrary.js';
import { progressDay } from './dailyProgress.js';

const modelPath = value => {
  try { const url = new URL(value); return url.origin === 'https://www.crealitycloud.com' ? decodeURIComponent(url.pathname).replace(/^\/es\//,'/').replace(/\/$/,'') : ''; }
  catch { return ''; }
};

// The anonymous browser cannot see private/workbench models. Both the exact
// model ID and its presence in the owner's public list must be confirmed.
export async function verifyPublishedUploads(account, entries, signal, browser = withIsolatedBrowser) {
  if (!/^\d+$/.test(account)) throw new Error('No se pudo identificar el perfil público.');
  return browser({}, async context => {
    const abort = () => context.close().catch(() => {});
    signal?.addEventListener('abort',abort,{once:true});
    try {
      const page=await context.newPage(), targets=new Map();
      for(const entry of entries.slice(0,10)) {
        signal?.throwIfAborted();
        try {
          await page.goto('https://www.crealitycloud.com/es/model-detail/'+encodeURIComponent(entry.id),{waitUntil:'domcontentloaded',timeout:30000});
          const text=await page.locator('#__NUXT_DATA__').textContent({timeout:5000});
          if(collectionModelIdFromNuxt(text,page.url())===entry.id) targets.set(modelPath(page.url()),entry.id);
        } catch { signal?.throwIfAborted(); }
      }
      if(!targets.size)return {account,ids:[],checkedIds:entries.slice(0,10).map(entry=>entry.id),checkedAt:new Date().toISOString()};
      await page.goto(`https://www.crealitycloud.com/es/user/${account}/model`,{waitUntil:'domcontentloaded',timeout:45000});
      await page.locator('.user-model-container a[href*="model-detail"], .user-model-container .empty_comp').first().waitFor({state:'visible',timeout:30000});
      const visibleId=await page.locator('.user-id').first().textContent();
      if(String(visibleId).match(/ID\s*:\s*(\d+)/i)?.[1]!==account)throw new Error('La identidad del perfil público no coincide. Se conservan los archivos.');
      const ids=new Set(), seen=new Set();let stagnant=0;
      for(let round=0;round<40&&stagnant<3&&ids.size<targets.size;round++) {
        signal?.throwIfAborted();
        const before=seen.size;
        const links=await page.locator('.user-model-container a[href*="model-detail"]').evaluateAll(nodes=>nodes.map(node=>node.href));
        for(const href of links){const key=modelPath(href);seen.add(key);if(targets.has(key))ids.add(targets.get(key));}
        stagnant=seen.size===before?stagnant+1:0;
        await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));await page.waitForTimeout(1000);
      }
      return {account,ids:[...ids],checkedIds:entries.slice(0,10).map(entry=>entry.id),checkedAt:new Date().toISOString()};
    } finally {signal?.removeEventListener('abort',abort);}
  });
}
export async function runUploadCleanup(task,options,deps={}) {
  const library=deps.library||uploadLibrary,verify=deps.verify||verifyPublishedUploads;
  const account=options.ownUserId,day=progressDay(task.timezone);
  if(!task.cleanupEnabled)return {success:true,message:'Limpieza de diseños desactivada.',details:{cleanup:true}};
  if(!account||task.accountId!==account)throw new Error('Revisa la cuenta de la programación antes de limpiar diseños.');
  const entries=await library.cleanupCandidates(account,day),cleaned=[];
  if(entries.length){
    const proof=await verify(account,entries,options.signal);
    if (proof.checkedIds) await library.notePublicChecks(account,proof.checkedIds,proof.checkedAt);
    for(const entry of entries)if(proof.ids.includes(entry.id)&&await library.removePublished(account,entry,proof,day,options.signal))cleaned.push({name:entry.name,id:entry.id});
  }
  return {success:true,message:cleaned.length?`${cleaned.length} diseños eliminados de la carpeta tras confirmar su publicación en Creality Cloud.`:entries.length?'Se conservan los diseños: todavía no se ha confirmado su publicación o sus archivos han cambiado.':'No hay diseños pendientes de limpieza.',details:{cleanup:true,cleaned,pending:entries.length-cleaned.length}};
}
