// Usage limit for the comment library: Creality Cloud hides comments that are
// repeated too often and stops crediting them, so each text is retired after a
// configurable number of uses and the schedule stops when none is left.
export const DEFAULT_COMMENT_MAX_USES = 50;
export const MIN_COMMENT_MAX_USES = 1;
export const MAX_COMMENT_MAX_USES = 1000;

export function commentMaxUses(task = {}) {
  const value = Math.floor(Number(task?.maxUsesPerComment));
  if (!Number.isFinite(value) || value < MIN_COMMENT_MAX_USES) return DEFAULT_COMMENT_MAX_USES;
  return Math.min(MAX_COMMENT_MAX_USES, value);
}

export function commentUsageReached(comment = {}, maxUses = DEFAULT_COMMENT_MAX_USES) {
  return Math.max(0, Number(comment?.usageCount) || 0) >= maxUses;
}

export function commentAvailable(comment = {}, maxUses = DEFAULT_COMMENT_MAX_USES) {
  return comment?.enabled !== false && String(comment?.text || '').trim() !== ''
    && !commentUsageReached(comment, maxUses);
}

/**
 * Disable comments that reached the limit and, when no comment is left, the
 * comment schedule. Mutates the task and returns what changed so the caller can
 * notify once per event.
 */
export function enforceCommentUsageLimit(task = {}, now = new Date()) {
  const maxUses = commentMaxUses(task);
  const comments = Array.isArray(task.comments) ? task.comments : [];
  const disabledComments = [];
  for (const comment of comments) {
    if (comment?.enabled === false || !commentUsageReached(comment, maxUses)) continue;
    comment.enabled = false;
    comment.disabledReason = 'usage_limit';
    comment.disabledAt = now.toISOString();
    disabledComments.push({ id: comment.id, text: comment.text, usageCount: Number(comment.usageCount) || 0 });
  }

  let scheduleDisabled = false;
  if (task.enabled === true && !comments.some((comment) => commentAvailable(comment, maxUses))) {
    task.enabled = false;
    task.disabledReason = 'no_comments_available';
    task.disabledAt = now.toISOString();
    task.nextRunAt = '';
    scheduleDisabled = true;
  }
  return { maxUses, disabledComments, scheduleDisabled };
}

/**
 * A comment the user enables again after it reached the limit starts a new
 * cycle: its counter goes back to 0. Comments enabled without a previous
 * disabled state keep their counter.
 */
export function resetReenabledComments(previous = [], next = [], maxUses = DEFAULT_COMMENT_MAX_USES) {
  const before = new Map((Array.isArray(previous) ? previous : []).map((comment) => [comment.id, comment]));
  for (const comment of Array.isArray(next) ? next : []) {
    const old = before.get(comment.id);
    if (comment.enabled === false) {
      if (old?.disabledReason) {
        comment.disabledReason = old.disabledReason;
        comment.disabledAt = old.disabledAt || '';
      }
      continue;
    }
    if (old && old.enabled === false && commentUsageReached(comment, maxUses)) comment.usageCount = 0;
    delete comment.disabledReason;
    delete comment.disabledAt;
  }
  return next;
}

export function commentUsageNotifications({ maxUses, disabledComments = [], scheduleDisabled = false } = {}) {
  const messages = disabledComments.map((comment) => ({
    type: 'limit',
    text: `♻️ CC Tools Dev: Comentario desactivado\n«${shorten(comment.text)}» se ha usado ${comment.usageCount} veces `
      + `(límite ${maxUses}). Se ha desactivado para que Creality Cloud no lo trate como repetido.`
  }));
  if (scheduleDisabled) {
    messages.push({
      type: 'schedule',
      text: '⏸️ CC Tools Dev: Programación de comentarios desactivada\n'
        + 'No quedan comentarios disponibles en la biblioteca: todos están desactivados o han llegado al límite '
        + `de ${maxUses} usos. Añade comentarios nuevos (o importa un lote) y vuelve a activar la programación.`
    });
  }
  return messages;
}

function shorten(text = '', length = 80) {
  const value = String(text).replace(/\s+/g, ' ').trim();
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}
