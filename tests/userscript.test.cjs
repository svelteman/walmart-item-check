const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('src/userscript/walmart-checker.user.js', 'utf8');
function load(overrides = {}) {
  const context = {
    URL, location: { pathname: '/orders/123', href: 'https://www.walmart.com/orders/123' },
    document: { getElementById: () => null, body: null }, setInterval() {},
    ...overrides
  };
  vm.createContext(context);
  vm.runInContext(source.replace('  syncPanel();', '  globalThis.api = { normalizeServer, installedServer, parseOrderItems, isOrderPage, sendToServer, syncPanel };\n  syncPanel();'), context);
  return context;
}

test('both Walmart hostnames match and modern/legacy order routes are recognized', () => {
  assert.match(source, /@match\s+https:\/\/www\.walmart\.com\/\*/);
  assert.match(source, /@match\s+https:\/\/walmart\.com\/\*/);
  const c = load();
  for (const path of ['/orders/123', '/account/orders/123/']) {
    c.location.pathname = path;
    assert.equal(c.api.isOrderPage(), true);
  }
  for (const path of ['/orders', '/account/orders', '/ip/product/123']) {
    c.location.pathname = path;
    assert.equal(c.api.isOrderPage(), false);
  }
});

test('server accepts IPv4, IPv6, and URLs but never Walmart', () => {
  const { api } = load();
  assert.equal(api.normalizeServer('192.168.3.20'), 'http://192.168.3.20:3000');
  assert.equal(api.normalizeServer('fdfe::1234'), 'http://[fdfe::1234]:3000');
  assert.equal(api.normalizeServer('[fdfe::1234]:3001'), 'http://[fdfe::1234]:3001');
  assert.equal(api.normalizeServer('https://checker.example:8443/info'), 'https://checker.example:8443');
  for (const value of ['walmart.com', 'https://www.walmart.com/orders/123']) {
    assert.throws(() => api.normalizeServer(value));
  }
});

test('server defaults to the script installation origin', () => {
  const { api } = load({ GM_info: { scriptUpdateURL: 'http://[fdfe::1234]:3000/api/userscripts/walmart-checker.user.js' } });
  assert.equal(api.installedServer(), 'http://[fdfe::1234]:3000');
});

test('parse quantities and substitutions, omit unavailable items and unrelated content', () => {
  const card = { matches: () => true };
  function row(name, text, heading) {
    return {
      parentElement: { firstElementChild: { textContent: heading }, matches: () => false, parentElement: card },
      querySelector: selector => selector.includes('productName') && name ? { textContent: name } : null,
      innerText: text
    };
  }
  const rows = [
    row('Replacement chips', 'Replacement chips 2 substitutedQty 2$7.94', '2 substituted (2 items)'),
    row('Paper cups', 'Paper cups\nMultipack Quantity: 50\nQty 1', '18 shopped'),
    row('Unavailable cups', 'Unavailable cupsQty 1', '1 unavailable item'),
    row('Cancelled item', 'Cancelled item Qty 1', '1 canceled item'),
    row(null, 'Store location', '')
  ];
  const { api } = load({ document: { body: null, getElementById: () => null, querySelectorAll: () => rows } });
  assert.deepEqual(JSON.parse(JSON.stringify(api.parseOrderItems().items)), [
    { name: 'Replacement chips', quantity: 2 }, { name: 'Paper cups', quantity: 1 }
  ]);
});

test('sending uses the configured origin and preserves IPv6 in the checklist link', async () => {
  const { api } = load({ GM_xmlhttpRequest(request) {
    assert.equal(request.url, 'http://[fdfe::1234]:3000/api/checklist/create');
    assert.equal(request.method, 'POST');
    request.onload({ status: 200, responseText: JSON.stringify({ success: true, checklistId: 'abc', url: 'http://broken/' }) });
  } });
  assert.equal(await api.sendToServer({ items: [] }, 'http://[fdfe::1234]:3000'), 'http://[fdfe::1234]:3000/?checklist=abc');
});

test('HTTP and timeout failures reject instead of showing success', async () => {
  for (const fail of [r => r.onload({ status: 500 }), r => r.ontimeout(), r => r.onerror()]) {
    const { api } = load({ GM_xmlhttpRequest: fail });
    await assert.rejects(api.sendToServer({}, 'http://checker:3000'));
  }
});
