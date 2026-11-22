import test from 'node:test';
import assert from 'node:assert/strict';
import {
  commentMaxUses, commentUsageNotifications, enforceCommentUsageLimit, resetReenabledComments
} from '../src/commentUsage.js';

const now = new Date('2026-11-22T18:00:00.000Z');

test('el límite es 50 por defecto y se acota entre 1 y 1000', () => {
  assert.equal(commentMaxUses({}), 50);
  assert.equal(commentMaxUses({ maxUsesPerComment: 0 }), 50);
  assert.equal(commentMaxUses({ maxUsesPerComment: 20 }), 20);
  assert.equal(commentMaxUses({ maxUsesPerComment: 5000 }), 1000);
});

test('desactiva solo los comentarios que llegan al límite y mantiene la programación si queda alguno', () => {
  const task = { enabled: true, maxUsesPerComment: 50, comments: [
    { id: 'a', text: 'Gracias.', enabled: true, usageCount: 221 },
    { id: 'b', text: 'Buen diseño', enabled: true, usageCount: 49 },
    { id: 'c', text: 'Ya desactivado', enabled: false, usageCount: 80 }
  ] };
  const result = enforceCommentUsageLimit(task, now);
  assert.deepEqual(result.disabledComments.map((comment) => comment.id), ['a']);
  assert.equal(task.comments[0].enabled, false);
  assert.equal(task.comments[0].disabledReason, 'usage_limit');
  assert.equal(task.comments[1].enabled, true);
  assert.equal(result.scheduleDisabled, false);
  assert.equal(task.enabled, true);
  const messages = commentUsageNotifications(result);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, 'limit');
  assert.match(messages[0].text, /«Gracias\.» se ha usado 221 veces \(límite 50\)/);
});

test('sin comentarios disponibles desactiva la programación una sola vez y lo avisa', () => {
  const task = { enabled: true, nextRunAt: 'x', comments: [
    { id: 'a', text: 'Uno', enabled: true, usageCount: 50 },
    { id: 'b', text: 'Dos', enabled: false, usageCount: 3 }
  ] };
  const first = enforceCommentUsageLimit(task, now);
  assert.equal(first.scheduleDisabled, true);
  assert.equal(task.enabled, false);
  assert.equal(task.disabledReason, 'no_comments_available');
  assert.equal(task.nextRunAt, '');
  const messages = commentUsageNotifications(first);
  assert.equal(messages.length, 2);
  assert.equal(messages[1].type, 'schedule');
  assert.match(messages[1].text, /Programación de comentarios desactivada/);
  const second = enforceCommentUsageLimit(task, now);
  assert.equal(second.scheduleDisabled, false);
  assert.equal(second.disabledComments.length, 0);
  assert.equal(commentUsageNotifications(second).length, 0);
});

test('una biblioteca vacía con la programación activa también la desactiva', () => {
  const task = { enabled: true, comments: [] };
  assert.equal(enforceCommentUsageLimit(task, now).scheduleDisabled, true);
});

test('reactivar a mano un comentario agotado reinicia su contador; el resto lo conserva', () => {
  const previous = [
    { id: 'a', text: 'Uno', enabled: false, usageCount: 50, disabledReason: 'usage_limit', disabledAt: 'd' },
    { id: 'b', text: 'Dos', enabled: true, usageCount: 12 },
    { id: 'c', text: 'Tres', enabled: false, usageCount: 60, disabledReason: 'usage_limit', disabledAt: 'd' }
  ];
  const next = [
    { id: 'a', text: 'Uno', enabled: true, usageCount: 50 },
    { id: 'b', text: 'Dos', enabled: true, usageCount: 12 },
    { id: 'c', text: 'Tres', enabled: false, usageCount: 60 },
    { id: 'd', text: 'Nuevo', enabled: true, usageCount: 0 }
  ];
  resetReenabledComments(previous, next, 50);
  assert.equal(next[0].usageCount, 0);
  assert.equal(next[0].disabledReason, undefined);
  assert.equal(next[1].usageCount, 12);
  assert.equal(next[2].usageCount, 60);
  assert.equal(next[2].disabledReason, 'usage_limit');
  assert.equal(next[3].usageCount, 0);
});

test('dos comentarios sin recompensa hoy pausan la programación hasta mañana', async () => {
  const { pauseCommentsAfterUncreditedFailures, commentsPausedToday, uncreditedCommentsToday } = await import('../src/commentUsage.js');
  const now = new Date('2026-11-22T17:00:00.000Z');
  const failed = (at, status = 'not_credited') => ({ taskId: 'comments', finishedAt: at, details: { rewardVerification: { status } } });
  const task = { timezone: 'Europe/Madrid', nextRunAt: 'x', commentPlan: ['a', 'b', 'c'], commentPlanCursor: 1 };
  assert.equal(pauseCommentsAfterUncreditedFailures(task, [failed('2026-11-22T10:00:00Z')], now), false);
  assert.equal(pauseCommentsAfterUncreditedFailures(task, [failed('2026-11-21T22:00:00Z'), failed('2026-11-22T10:00:00Z'), failed('2026-11-22T11:00:00Z', 'credited')], now), false);
  const runs = [failed('2026-11-22T10:00:00Z'), failed('2026-11-22T15:00:00Z')];
  assert.equal(uncreditedCommentsToday(runs, 'Europe/Madrid', now), 2);
  assert.equal(pauseCommentsAfterUncreditedFailures(task, runs, now), true);
  assert.equal(task.nextRunAt, '');
  assert.equal(task.commentPlanCursor, 3);
  assert.equal(commentsPausedToday(task, now), true);
  assert.equal(pauseCommentsAfterUncreditedFailures(task, runs, now), false);
  assert.equal(commentsPausedToday(task, new Date('2026-11-23T08:00:00.000Z')), false);
});
