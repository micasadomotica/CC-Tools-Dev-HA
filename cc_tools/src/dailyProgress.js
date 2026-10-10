import { scheduleNextRun } from './timeWindow.js';
import { normalizeFinishPrintProfiles, syncActiveFinishPrintProfile, activateNextFinishPrintProfile } from './finishPrintProfiles.js';
import { countCreditedFinishPrintRun } from './finishPrintSelection.js';

export const REWARD_TITLES = {
  uploadDesigns: 'Upload Models',
  modelDownloads: 'Download Models', modelLikes: 'Like 3D Model',
  modelCollections: 'Collection Models', finishPrint: 'Finish a Print',
  commentImage: 'Image comments', commentText: 'Comment on models', makeNow: 'Use MakeNow'
};
export const progressDay = (timezone = 'Europe/Madrid', now = new Date()) => new Intl.DateTimeFormat('en-CA', {
  timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit'
}).format(now);
const count = value => Math.max(0, Number(value) || 0);
const singles = ['creality', 'modelLikes', 'modelCollections', 'makeNow', 'modelBoosts'];

export function applyRewardResult(config, taskId, result, now = new Date()) {
  config.dailyProgress ||= { tasks: {} };
  config.dailyProgress.tasks ||= {};
  const details = result.details || {};
  const fallback = taskId === 'comments' ? (details.commentKind === 'image' ? 'commentImage' : 'commentText') : taskId;
  const save = observation => {
    if (!observation?.found || !Number.isInteger(observation.done) || observation.done < 0 || !(observation.valid > 0) || !Number.isFinite(Date.parse(observation.checkedAt))) return;
    const key = Object.keys(REWARD_TITLES).find(id => REWARD_TITLES[id].toLowerCase() === String(observation.title || '').toLowerCase()) || fallback;
    const previous = config.dailyProgress.tasks[key];
    if (Date.parse(observation.checkedAt) < (Date.parse(previous?.checkedAt) || 0)) return;
    const { found, done, valid, checkedAt, title } = observation;
    const sameDay = previous?.checkedAt && progressDay(config.timezone, new Date(previous.checkedAt)) === progressDay(config.timezone, new Date(checkedAt));
    config.dailyProgress.tasks[key] = { found, done: sameDay && key !== 'makeNow' ? Math.max(done, previous.done) : done, valid, checkedAt, title };
  };
  const inspect = verification => { save(verification?.before); save(verification?.after); };
  inspect(details.rewardVerification);
  inspect(details.actionAttempt?.rewardVerification);
  for (const item of [...(details.downloaded || []), ...(details.acted || []), ...(details.failures || [])]) inspect(item.rewardVerification || item.diagnostic);
  if ((taskId === 'creality' && result.success && !result.skipped) || (taskId === 'modelBoosts' && details.boostConsumed)) {
    save({ found: true, done: 1, valid: 1, checkedAt: now.toISOString() });
  }
}

export function dailyProgress(config, runs = [], now = new Date()) {
  const timezone = config.timezone || 'Europe/Madrid';
  const today = progressDay(timezone, now);
  const sameDay = timestamp => Number.isFinite(Date.parse(timestamp || '')) && progressDay(timezone, new Date(timestamp)) === today;
  const observations = {};
  const add = (key, observation) => {
    if (!observation?.found || !sameDay(observation.checkedAt) || !Number.isInteger(observation.done) || observation.done < 0 || !(observation.valid > 0)) return;
    const previous = observations[key];
    if (key === 'makeNow') {
      if (!previous || Date.parse(observation.checkedAt) >= Date.parse(previous.checkedAt)) observations[key] = { ...observation };
      return;
    }
    observations[key] = { ...observation, done: Math.max(observation.done, previous?.done || 0),
      valid: !previous || Date.parse(observation.checkedAt) >= Date.parse(previous.checkedAt) ? observation.valid : previous.valid };
  };
  // The account snapshot is separate from the execution log: remote work is never fabricated as a local execution.
  for (const [key, value] of Object.entries(config.dailyProgress?.tasks || {})) add(key, value);
  const local = { uploadDesigns: 0, creality: 0, modelDownloads: 0, modelLikes: 0, modelCollections: 0, finishPrint: 0, makeNow: 0, modelBoosts: 0, commentImage: 0, commentText: 0 };
  for (const run of runs) {
    if (!sameDay(run.finishedAt || run.createdAt)) continue;
    const details = run.details || {};
    const key = run.taskId === 'comments' ? (details.commentKind === 'image' ? 'commentImage' : 'commentText') : run.taskId;
    const inspectVerification = verification => {
      for (const observation of [verification?.before, verification?.after]) {
        const resolved = Object.keys(REWARD_TITLES).find(id => REWARD_TITLES[id].toLowerCase() === String(observation?.title || '').toLowerCase()) || key;
        add(resolved, observation);
      }
    };
    inspectVerification(details.rewardVerification);
    for (const item of [...(details.downloaded || []), ...(details.acted || []), ...(details.failures || [])]) inspectVerification(item.rewardVerification || item.diagnostic);
    if (run.taskId === 'creality' && run.status === 'success') local.creality = 1;
    if (run.taskId === 'modelDownloads') local.modelDownloads += (details.downloaded || []).filter(item => item.rewardStatus === 'credited').length;
    if (['modelLikes', 'modelCollections'].includes(run.taskId)) local[run.taskId] += (details.acted || []).length;
    if (run.taskId === 'comments' && details.rewardVerification?.status === 'credited') local[key] += 1;
    if (run.taskId === 'finishPrint') local.finishPrint += countCreditedFinishPrintRun(run);
    if (run.taskId === 'makeNow' && ['credited', 'already_completed'].includes(details.rewardVerification?.status)) local.makeNow = 1;
    if (run.taskId === 'modelBoosts' && details.boostConsumed) local.modelBoosts = 1;
  }
  // Only unambiguous individual history entries supplement task progress; never treat a sum of points as an action count.
  const history = {};
  for (const transaction of config.points?.transactions || []) {
    if (transaction.date !== today || !(transaction.amount > 0)) continue;
    const title = String(transaction.sourceType || '').toLowerCase();
    const key = Object.keys(REWARD_TITLES).find(id => REWARD_TITLES[id].toLowerCase() === title);
    // MakeNow credits can be issued after approval, on a different day from the action.
    if (key && !['makeNow', 'uploadDesigns'].includes(key)) history[key] = (history[key] || 0) + 1;
    if (transaction.type === 'Check-in diario') history.creality = 1;
    if (transaction.type === 'Impulsos dados') history.modelBoosts = 1;
  }
  const counters = {};
  const limits = {};
  for (const key of Object.keys(local)) {
    counters[key] = Math.max(local[key], observations[key]?.done || 0, history[key] || 0);
    if (key === 'makeNow' && observations[key]) counters[key] = observations[key].done;
    if (singles.includes(key)) counters[key] = Math.min(1, counters[key]);
    limits[key] = observations[key]?.valid || ({ uploadDesigns: 5, commentImage: 5, commentText: 1, modelDownloads: 30, finishPrint: 10 }[key] || 1);
  }
  counters.comments = counters.commentImage + counters.commentText;
  limits.comments = limits.commentImage + limits.commentText;
  const targets = {};
  for (const [key, task] of Object.entries(config.tasks || {})) {
    targets[key] = Math.min(limits[key] || 1, count(key === 'finishPrint' ? task.totalDailyLimit ?? task.dailyLimit : task.dailyLimit ?? 1));
  }
  targets.commentImage = Math.min(limits.commentImage, count(config.tasks?.comments?.imageDailyLimit));
  targets.commentText = Math.min(limits.commentText, count(config.tasks?.comments?.textDailyLimit));
  const remaining = Object.fromEntries(Object.keys(targets).map(key => [key, Math.max(0, targets[key] - (counters[key] || 0))]));
  remaining.comments = remaining.commentImage + remaining.commentText;
  return { date: today, counters, limits, remaining, observations };
}

export function reconcileMakeNowCorrection(config, previousCount, now = new Date()) {
  const task = config.tasks?.makeNow;
  const observation = config.dailyProgress?.tasks?.makeNow;
  if (!task?.enabled || !(previousCount > 0) || !observation?.found || observation.done !== 0) return;
  const today = progressDay(config.timezone, now);
  if (progressDay(config.timezone, new Date(observation.checkedAt)) !== today) return;
  if (task.lastAttemptAt && progressDay(config.timezone, new Date(task.lastAttemptAt)) === today) return;
  if (!task.nextRunAt || progressDay(config.timezone, new Date(task.nextRunAt)) !== today) {
    task.nextRunAt = scheduleNextRun(task, now);
  }
}

export function reconcileDailyPlans(config, runs = [], now = new Date()) {
  const before = JSON.stringify(config.tasks);
  const progress = dailyProgress(config, runs, now);
  const trim = (task, planKey, cursorKey, remaining, kinds = null) => {
    const plan = task[planKey] || [];
    const cursor = Math.min(plan.length, count(task[cursorKey]));
    const pending = plan.slice(cursor);
    const selected = [];
    const selectedKinds = [];
    const slots = kinds ? { ...kinds } : null;
    for (let index = 0; index < pending.length && selected.length < remaining; index++) {
      if (slots) {
        const kind = task.commentKindPlan?.[cursor + index];
        if (!(slots[kind] > 0)) continue;
        slots[kind]--; selectedKinds.push(kind);
      }
      selected.push(pending[index]);
    }
    task[planKey] = [...plan.slice(0, cursor), ...selected];
    if (slots) task.commentKindPlan = [...(task.commentKindPlan || []).slice(0, cursor), ...selectedKinds];
    // Keep any scheduler delay on the first retained slot.
    if (!selected.length) task.nextRunAt = '';
    else if (!task.nextRunAt || selected[0] !== pending[0]) task.nextRunAt = selected[0];
  };
  const downloads = config.tasks?.modelDownloads;
  if (downloads?.downloadPlanDate === progress.date) trim(downloads, 'downloadPlan', 'downloadPlanCursor', progress.remaining.modelDownloads);
  const comments = config.tasks?.comments;
  if (comments?.commentPlanDate === progress.date) trim(comments, 'commentPlan', 'commentPlanCursor', progress.remaining.comments, {
    image: progress.remaining.commentImage, text: progress.remaining.commentText
  });
  const print = config.tasks?.finishPrint;
  if (print) {
    syncActiveFinishPrintProfile(print);
    const profiles = normalizeFinishPrintProfiles(print);
    // Remote completion belongs to the account. Allocate the remaining reward slots by time, not by inventing a printer attribution.
    const slots = profiles.flatMap(profile => profile.printPlanDate !== progress.date ? [] : (profile.printPlan || []).slice(count(profile.printPlanCursor)).map(time => ({ id: profile.id, time })));
    slots.sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
    // The scheduler already waits for pendingVerification. Keep its future slot
    // until verification resolves so a failed print does not erase valid work.
    const allowance = slots.slice(0, progress.remaining.finishPrint);
    for (const profile of profiles) {
      if (profile.printPlanDate === progress.date) trim(profile, 'printPlan', 'printPlanCursor', allowance.filter(slot => slot.id === profile.id).length);
    }
    print.printerProfiles = profiles;
    activateNextFinishPrintProfile(print, { sync: false });
  }
  for (const id of singles) {
    const task = config.tasks?.[id];
    if (!task?.enabled || progress.remaining[id] > 0) continue;
    if (!task.nextRunAt || progressDay(config.timezone, new Date(task.nextRunAt)) === progress.date) {
      task.nextRunAt = scheduleNextRun(task, now, { forceNextWindow: true });
    }
  }
  return before !== JSON.stringify(config.tasks);
}
