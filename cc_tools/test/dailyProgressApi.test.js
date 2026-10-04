import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { progressDay } from '../src/dailyProgress.js';

test('API: datos externos actualizan paneles, HA y planificación; una tarea completa no abre el navegador', async()=>{
  const data = await fs.mkdtemp(path.join(os.tmpdir(),'cctools-progress-api-'));
  const socket=net.createServer(); socket.listen(0,'127.0.0.1'); await once(socket,'listening');
  const port=socket.address().port; await new Promise(resolve=>socket.close(resolve));
  const base=`http://127.0.0.1:${port}`;
  const now=new Date(), timestamp=now.toISOString(),date=progressDay('Europe/Madrid',now);
  const observation=(done,valid)=>({found:true,done,valid,checkedAt:timestamp});
  const plan=Array.from({length:30},(_,i)=>new Date(now.getTime()+(i+1)*600000).toISOString());
  const config={timezone:'Europe/Madrid', setup:{assistantCompleted:false},
    dailyProgress:{status:'current',lastAttemptAt:timestamp,checkedAt:timestamp,tasks:{
      modelDownloads:observation(24,30),modelLikes:observation(1,1),modelCollections:observation(1,1),
      makeNow:observation(1,1),commentImage:observation(5,5),commentText:observation(1,1),finishPrint:observation(3,10),creality:observation(1,1)
    }}, tasks:{modelDownloads:{enabled:true,dailyLimit:30,downloadPlan:plan,downloadPlanCursor:1,downloadPlanDoneCount:1,downloadPlanDate:date,nextRunAt:plan[1]},
      modelLikes:{enabled:true,nextRunAt:plan[1]},makeNow:{enabled:true,nextRunAt:plan[1]}}};
  await fs.writeFile(path.join(data,'config.json'),JSON.stringify(config));
  await fs.writeFile(path.join(data,'runs.json'),JSON.stringify([{id:'download-local',taskId:'modelDownloads',source:'manual',status:'success',finishedAt:timestamp,details:{downloaded:[{rewardStatus:'credited'}]}}]));
  const server=spawn(process.execPath,['src/server.js'],{cwd:fileURLToPath(new URL('..',import.meta.url)),windowsHide:true,
    env:{...process.env,CCTOOLS_HOST:'127.0.0.1',CCTOOLS_PORT:String(port),CCTOOLS_DATA_DIR:data},stdio:['ignore','pipe','pipe']});
  let logs=''; server.stdout.on('data',chunk=>logs+=chunk);server.stderr.on('data',chunk=>logs+=chunk);
  const request=async(url,method='GET',body)=>{
    const response=await fetch(base+url,{method,headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
    return response.json();
  };
  try {
    let status;
    for(let i=0;i<100;i++) {
      try {status=await request('/api/status');if(status.ok)break;}catch{}
      if(server.exitCode!==null)break;
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    assert.equal(status?.ok,true,logs);
    assert.equal(status.dailyCounters.modelDownloads,24);
    assert.equal(status.dailyLimits.modelDownloads,30);
    assert.equal(status.dailyCounters.comments,6);
    assert.equal(status.dailyCounters.finishPrint,3);
    const preview=await request('/api/schedule/preview');
    assert.ok(preview.items.filter(item=>item.taskId==='modelDownloads'&&item.status==='pending').length<=6);
    assert.equal(preview.items.filter(item=>item.taskId==='modelLikes'&&item.status==='pending').length,0);
    const ha=await request('/api/integration/status');
    assert.equal(ha.tasks.downloads.dailyCount,24);
    assert.equal(ha.tasks.downloads.dailyLimit,30);
    const manual=await request('/api/tasks/makenow/run','POST');
    assert.equal(manual.status,'skipped');
    assert.equal((await request('/api/status')).browser.active,false);
    assert.doesNotMatch(logs,/browserType\.launch|chromium.*executable/i);
    const saved=await request('/api/config','PATCH',{modelDownloads:{enabled:true,dailyLimit:20,windowStart:'00:00',windowEnd:'23:59',minIntervalMinutes:10,cleanupAfterHours:1}});
    assert.equal(saved.ok,true);
    const final=await request('/api/status');
    assert.equal(final.config.tasks.modelDownloads.dailyLimit,20);
    assert.equal(final.dailyCounters.modelDownloads,24);
    assert.equal(final.dailyLimits.modelDownloads,30);
    assert.equal(final.config.tasks.modelDownloads.nextRunAt,'');
  } finally {
    if(server.exitCode===null){const exited=once(server,'exit');server.kill();await exited;}
    assert.equal(path.dirname(data),path.resolve(os.tmpdir()));
    await fs.rm(data,{recursive:true,force:true});
  }
});
