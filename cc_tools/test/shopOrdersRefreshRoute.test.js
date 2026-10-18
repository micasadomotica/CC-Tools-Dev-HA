import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { mergeShopOrdersState, markShopOrdersRefreshError } from '../src/shopOrdersState.js';

const server = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
const route = server.slice(server.indexOf("app.post('/api/shop/orders/refresh'"), server.indexOf("app.patch('/api/shop/orders/:id/archive'"));

function harness(failure = false) {
  let handler;
  const state = { queries: 0, writes: 0, response: null, status: 200 };
  const config = { shopOrders: mergeShopOrdersState({}, [{ id: 'known-order', title: 'Pedido conocido', statusKey: 'pending' }]) };
  vm.runInNewContext(route, {
    app: { post: (_path, callback) => { handler = callback; } },
    readConfig: async () => config, shopOrdersRefreshDue: () => false,
    readShopOrders: async () => {
      state.queries++;
      if (failure) throw new Error('Creality unavailable');
      return [{ id: 'new-order', title: 'Pedido nuevo', statusKey: 'pending' }];
    },
    mergeShopOrdersState, markShopOrdersRefreshError,
    shippedShopOrderTransitions: () => [],
    writeConfig: async () => { state.writes++; },
    appendShippedOrderRuns: async () => {}, notifyShippedShopOrders: async () => {}
  });
  const res = { json: body => { state.response = body; }, status: code => { state.status = code; return res; } };
  return { state, config, run: query => handler({ query }, res) };
}

test('refresco habitual respeta las 24 horas y el manual fuerza una consulta', async () => {
  const h = harness();
  await h.run({});
  assert.equal(h.state.queries, 0);
  assert.equal(h.state.response.refreshed, false);
  await h.run({ force: '1' });
  assert.equal(h.state.queries, 1);
  assert.equal(h.state.response.refreshed, true);
  assert.equal(h.state.writes, 1);
  assert.equal(h.state.response.orders.items[0].id, 'new-order');
});

test('fallo del refresco manual devuelve los pedidos conservados y el error', async () => {
  const h = harness(true);
  const previous = structuredClone(h.config.shopOrders.items);
  assert.equal(previous.length, 1);
  await h.run({ force: '1' });
  assert.equal(h.state.status, 409);
  assert.equal(h.state.response.ok, false);
  assert.deepEqual(h.state.response.orders.items, previous);
});
