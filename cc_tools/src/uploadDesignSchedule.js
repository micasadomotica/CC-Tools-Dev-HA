import { progressDay } from './dailyProgress.js';

export function uploadScheduleItems(task, runs = [], now = new Date()) {
  if (!task?.enabled) return [];
  const today=progressDay(task.timezone,now);
  const isToday=value=>Number.isFinite(Date.parse(value||''))&&progressDay(task.timezone,new Date(value))===today;
  const items=runs.filter(run=>run.taskId==='uploadDesigns'&&run.source==='schedule'&&isToday(run.finishedAt||run.createdAt)).map(run=>({
    taskId:'uploadDesigns',label:'Subir diseños',detail:run.message||'Ejecución de hoy',runAt:run.finishedAt||run.createdAt,
    status:run.status==='success'?'done':run.status==='skipped'?'skipped':'failed'
  }));
  if(isToday(task.nextRunAt))items.push({taskId:'uploadDesigns',label:'Subir diseños',detail:`Hasta ${task.dailyLimit} diseños · escaneo automático`,runAt:task.nextRunAt,status:'pending'});
  return items;
}
