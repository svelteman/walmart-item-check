const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const PORT = Number(process.env.PORT) || 7429;
const CHECKLISTS_FILE = path.join(__dirname, 'data', 'checklists.json');

// Create HTTP server for WebSocket
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());

const checklistListeners = new Set();

function ensureStorage() {
  fs.mkdirSync(path.dirname(CHECKLISTS_FILE), { recursive: true });
  if (!fs.existsSync(CHECKLISTS_FILE)) {
    fs.writeFileSync(CHECKLISTS_FILE, '[]', 'utf8');
  }
}

function loadChecklists() {
  ensureStorage();
  try {
    const raw = fs.readFileSync(CHECKLISTS_FILE, 'utf8');
    const data = JSON.parse(raw || '[]');
    return new Map((Array.isArray(data) ? data : []).map(checklist => [checklist.id, checklist]));
  } catch (error) {
    console.error('Failed to load checklists from disk:', error);
    return new Map();
  }
}

function persistChecklists(checklists) {
  ensureStorage();
  const ordered = [...checklists.values()].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  fs.writeFileSync(CHECKLISTS_FILE, JSON.stringify(ordered, null, 2), 'utf8');
}

function toChecklistSummary(checklist) {
  const total = Array.isArray(checklist.items) ? checklist.items.length : 0;
  const received = Array.isArray(checklist.items) ? checklist.items.filter(item => item.received).length : 0;
  return {
    id: checklist.id,
    orderUrl: checklist.orderUrl || '',
    createdAt: checklist.createdAt,
    completed: !!checklist.completed,
    itemCount: total,
    receivedCount: received
  };
}

function getChecklistSummaries() {
  return [...checklists.values()]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(toChecklistSummary);
}

function broadcastChecklistUpdate() {
  const payload = JSON.stringify({ type: 'checklistsUpdated', checklists: getChecklistSummaries() });
  for (const listener of checklistListeners) {
    try {
      listener.write(`data: ${payload}\n\n`);
    } catch (error) {
      checklistListeners.delete(listener);
    }
  }
}

function normalizeItem(item) {
  const name = String(item?.name || '').trim();
  const quantity = Number(item?.quantity || 1);
  const productUrl = String(item?.productUrl || '').trim();
  const imageUrl = String(item?.imageUrl || '').trim();
  const notes = String(item?.notes || '').trim();
  const pricePaid = Number(String(item?.pricePaid || '').replace(/[^\d.-]/g, ''));
  const currentPrice = Number(String(item?.currentPrice || '').replace(/[^\d.-]/g, ''));
  return {
    id: uuidv4(),
    name,
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
    productUrl: /^https?:\/\//i.test(productUrl) ? productUrl : '',
    imageUrl: /^https?:\/\//i.test(imageUrl) ? imageUrl : '',
    notes,
    pricePaid: Number.isFinite(pricePaid) ? Number(pricePaid.toFixed(2)) : null,
    currentPrice: Number.isFinite(currentPrice) ? Number(currentPrice.toFixed(2)) : null,
    received: false,
    timestamp: new Date().toISOString()
  };
}

function makeItemKey(item) {
  return `${String(item?.name || '').trim().toLowerCase()}|${Number(item?.quantity || 1)}`;
}

function mergeChecklistItems(existingItems, incomingItems) {
  const buckets = new Map();
  for (const item of Array.isArray(existingItems) ? existingItems : []) {
    const key = makeItemKey(item);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(item);
  }

  return (Array.isArray(incomingItems) ? incomingItems : []).map((incoming) => {
    const key = makeItemKey(incoming);
    const prior = buckets.get(key)?.shift();
    if (!prior) return incoming;

    return {
      ...incoming,
      id: prior.id || incoming.id,
      received: !!prior.received,
      timestamp: prior.timestamp || incoming.timestamp,
      productUrl: incoming.productUrl || prior.productUrl || '',
      imageUrl: incoming.imageUrl || prior.imageUrl || '',
      notes: incoming.notes || prior.notes || '',
      pricePaid: incoming.pricePaid != null ? incoming.pricePaid : (prior.pricePaid ?? null),
      currentPrice: incoming.currentPrice != null ? incoming.currentPrice : (prior.currentPrice ?? null)
    };
  });
}

function makeChecklistSignature(orderUrl, items) {
  const normalizedItems = Array.isArray(items)
    ? items
        .map(item => `${String(item.name || '').trim().toLowerCase()}|${Number(item.quantity || 1)}`)
        .sort()
        .join(';')
    : '';
  return `${String(orderUrl || '').trim().toLowerCase()}|${normalizedItems}`;
}

// In-memory storage for checklists
const checklists = loadChecklists();

// Map of checklist IDs to connected WebSocket clients
const checklistSubscribers = new Map();

// Get local IP addresses (IPv4 and IPv6)
function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const ipv4 = [];
  const ipv6 = [];
  
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (!iface.internal) {
        if (iface.family === 'IPv4') {
          ipv4.push(iface.address);
        } else if (iface.family === 'IPv6' && !iface.address.startsWith('fe80')) {
          // Skip link-local IPv6 addresses (fe80::)
          ipv6.push(`[${iface.address}]`);
        }
      }
    }
  }
  
  return [...ipv4, ...ipv6];
}

// Landing page and main routes (before static files)
app.get('/', (req, res) => {
  if (req.query.checklist) {
    // If there's a checklist ID, serve the Svelte app
    res.sendFile(path.join(__dirname, 'dist/index.html'));
  } else {
    // Otherwise, serve the landing page
    res.sendFile(path.join(__dirname, 'src/public/landing.html'));
  }
});

// Serve static files
app.use(express.static(path.join(__dirname, 'dist')));

// API Routes

// Receive order data from userscript
app.post('/api/checklist/create', (req, res) => {
  const { items, orderUrl } = req.body;

  if (!items || !Array.isArray(items)) {
    return res.status(400).json({ error: 'Invalid items array' });
  }

  const normalizedItems = items
    .map(item => normalizeItem(item))
    .filter(item => item.name);

  if (!normalizedItems.length) {
    return res.status(400).json({ error: 'Checklist must include at least one item' });
  }

  const signature = makeChecklistSignature(orderUrl, normalizedItems);
  const existingChecklist = [...checklists.values()].find(checklist => {
    return checklist.orderUrl === orderUrl && makeChecklistSignature(checklist.orderUrl, checklist.items) === signature;
  });

  if (existingChecklist) {
    existingChecklist.items = mergeChecklistItems(existingChecklist.items, normalizedItems);
    existingChecklist.orderUrl = orderUrl;
    existingChecklist.completed = existingChecklist.items.length > 0 && existingChecklist.items.every(item => item.received);
    persistChecklists(checklists);
    broadcastChecklistUpdate();
    return res.json({
      success: true,
      checklistId: existingChecklist.id,
      duplicate: true,
      refreshed: true,
      url: `http://${req.hostname}:${PORT}/?checklist=${existingChecklist.id}`
    });
  }

  const checklistId = uuidv4();
  const checklist = {
    id: checklistId,
    orderUrl,
    items: normalizedItems,
    createdAt: new Date().toISOString(),
    completed: false
  };

  checklists.set(checklistId, checklist);
  persistChecklists(checklists);
  broadcastChecklistUpdate();
  res.json({
    success: true,
    checklistId,
    duplicate: false,
    url: `http://${req.hostname}:${PORT}/?checklist=${checklistId}`
  });
});

app.get('/api/checklist/list', (req, res) => {
  res.json({
    success: true,
    checklists: getChecklistSummaries()
  });
});

app.delete('/api/checklist/:id', (req, res) => {
  const checklist = checklists.get(req.params.id);
  if (!checklist) {
    return res.status(404).json({ error: 'Checklist not found' });
  }

  checklists.delete(req.params.id);
  persistChecklists(checklists);
  broadcastChecklistUpdate();
  res.json({ success: true, deleted: true });
});

app.get('/api/checklists/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const listener = { write: payload => res.write(payload) };
  checklistListeners.add(listener);
  res.write('retry: 1000\n\n');

  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 15000);

  res.on('close', () => {
    clearInterval(heartbeat);
    checklistListeners.delete(listener);
  });
});

app.get('/api/checklist/test', (req, res) => {
  res.json({ success: true, message: 'Server is running' });
});

// Get checklist
app.get('/api/checklist/:id', (req, res) => {
  const checklist = checklists.get(req.params.id);
  if (!checklist) {
    return res.status(404).json({ error: 'Checklist not found' });
  }
  res.json(checklist);
});

// Update item received status
app.patch('/api/checklist/:id/item/:itemId', (req, res) => {
  const { received } = req.body;
  const checklist = checklists.get(req.params.id);
  
  if (!checklist) {
    return res.status(404).json({ error: 'Checklist not found' });
  }

  const item = checklist.items.find(i => i.id === req.params.itemId);
  if (!item) {
    return res.status(404).json({ error: 'Item not found' });
  }

  item.received = received;
  checklist.completed = checklist.items.every(i => i.received);
  persistChecklists(checklists);
  broadcastChecklistUpdate();

  res.json(item);
});

// Serve info page
app.get('/info', (req, res) => {
  const ips = getLocalIPs();
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Walmart Item Check - Server Info</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        h1 { color: #0071ce; }
        .ip-list { list-style: none; padding: 0; }
        .ip-list li { padding: 12px; margin: 8px 0; background: #f0f0f0; border-radius: 4px; border-left: 4px solid #0071ce; }
        .ip-list a { color: #0071ce; text-decoration: none; font-weight: bold; }
        .ip-list a:hover { text-decoration: underline; }
        .info { color: #666; margin-top: 30px; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>📦 Walmart Item Check</h1>
        <p>Server is running! Open any of these URLs on your device:</p>
        <ul class="ip-list">
          ${ips.map(ip => `<li><a href="http://${ip}:${PORT}">http://${ip}:${PORT}</a></li>`).join('')}
        </ul>
        <div class="info">
          <p><strong>To install the userscript:</strong></p>
          <ol>
            <li>Install Tampermonkey or Greasemonkey extension</li>
            <li>Visit <a href="http://localhost:${PORT}/userscript.js">the userscript</a></li>
            <li>Click Install</li>
            <li>Open a Walmart order page and the script will automatically send the items</li>
          </ol>
        </div>
      </div>
    </body>
    </html>
  `;
  res.send(html);
});

// Userscript endpoint (primary route with .user.js extension)
app.get('/api/userscripts/walmart-checker.user.js', (req, res) => {
  res.setHeader('Content-Type', 'application/x-javascript; charset=utf-8');
  res.sendFile(path.join(__dirname, 'src/userscript/walmart-checker.user.js'));
});

// Redirect old /userscript.js to the proper .user.js endpoint
app.get('/userscript.js', (req, res) => {
  res.redirect(301, '/api/userscripts/walmart-checker.user.js');
});

// SPA fallback for any other routes that aren't API/static
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'dist/index.html'));
});

// WebSocket connection handling for real-time checklist sync
wss.on('connection', (ws, req) => {
  let subscribedChecklistId = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'subscribe') {
        subscribedChecklistId = data.checklistId;
        if (!checklistSubscribers.has(subscribedChecklistId)) {
          checklistSubscribers.set(subscribedChecklistId, new Set());
        }
        checklistSubscribers.get(subscribedChecklistId).add(ws);
        ws.send(JSON.stringify({ type: 'subscribed', checklistId: subscribedChecklistId }));
      } else if (data.type === 'itemUpdated' && subscribedChecklistId) {
        // Broadcast item update to all connected clients for this checklist
        const subscribers = checklistSubscribers.get(subscribedChecklistId);
        if (subscribers) {
          subscribers.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: 'itemUpdated',
                item: data.item,
                source: data.source // identifier for which instance made the update
              }));
            }
          });
        }
      }
    } catch (e) {
      console.error('WebSocket message error:', e);
    }
  });

  ws.on('close', () => {
    if (subscribedChecklistId) {
      const subscribers = checklistSubscribers.get(subscribedChecklistId);
      if (subscribers) {
        subscribers.delete(ws);
        if (subscribers.size === 0) {
          checklistSubscribers.delete(subscribedChecklistId);
        }
      }
    }
  });
});

server.listen(PORT, '::', () => {
  const ips = getLocalIPs();
  console.log('\n🚀 Walmart Item Check Server Started');
  console.log(`\n📱 Access from your device:`);
  ips.forEach(ip => {
    console.log(`   http://${ip}:${PORT}`);
  });
  console.log(`\n📋 Server info: http://localhost:${PORT}/info`);
  console.log(`\n💾 Userscript: http://localhost:${PORT}/userscript.js\n`);
});
