<script>
  import { onMount } from 'svelte';

  export let checklist;
  export let checklistId;

  let items = checklist.items;
  let allReceived = false;
  let ws = null;
  let instanceId = Math.random().toString(36).substr(2, 9); // unique ID for this browser tab

  const updateItem = async (itemId, received) => {
    try {
      const response = await fetch(`/api/checklist/${checklistId}/item/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ received })
      });

      if (response.ok) {
        items = items.map(item =>
          item.id === itemId ? { ...item, received } : item
        );
        allReceived = items.every(i => i.received);
        
        // Notify other instances via WebSocket
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'itemUpdated',
            item: { id: itemId, received },
            source: instanceId
          }));
        }
      }
    } catch (err) {
      console.error('Error updating item:', err);
    }
  };

  const connectWebSocket = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      console.log('WebSocket connected');
      // Subscribe to this checklist
      ws.send(JSON.stringify({
        type: 'subscribe',
        checklistId: checklistId
      }));
    };
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'itemUpdated' && data.source !== instanceId) {
          // Update from another instance
          const { item } = data;
          items = items.map(i =>
            i.id === item.id ? { ...i, received: item.received } : i
          );
          allReceived = items.every(i => i.received);
          console.log(`Item updated from another instance: ${item.id}`);
        }
      } catch (err) {
        console.error('WebSocket message error:', err);
      }
    };
    
    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
    };
    
    ws.onclose = () => {
      console.log('WebSocket disconnected');
      // Attempt to reconnect after 3 seconds
      setTimeout(connectWebSocket, 3000);
    };
  };

  onMount(() => {
    allReceived = items.every(i => i.received);
    connectWebSocket();
    
    return () => {
      if (ws) {
        ws.close();
      }
    };
  });

  const receivedCount = items.filter(i => i.received).length;
  const totalCount = items.length;
  const progress = (receivedCount / totalCount) * 100;

</script>

<div class="checklist-container">
  <div class="header">
    <h1>📦 Order Checklist</h1>
    <p class="order-url">
      <a href={checklist.orderUrl} target="_blank" rel="noopener">View Order</a>
    </p>
  </div>

  <div class="progress-section">
    <div class="progress-info">
      <span class="progress-text">{receivedCount} of {totalCount} items received</span>
      <span class="progress-percentage">{Math.round(progress)}%</span>
    </div>
    <div class="progress-bar">
      <div class="progress-fill" style="width: {progress}%"></div>
    </div>
  </div>

  {#if allReceived}
    <div class="celebration">
      ✅ All items received! Great job!
    </div>
  {/if}

  <div class="items-list">
    {#each items as item (item.id)}
      <div class="item" class:received={item.received}>
        <input
          type="checkbox"
          checked={item.received}
          on:change={(e) => updateItem(item.id, e.target.checked)}
          class="item-checkbox"
        />
        <div class="item-content">
          <div class="item-name">{item.name}</div>
          {#if item.quantity > 1}
            <div class="item-qty">Qty: {item.quantity}</div>
          {/if}
        </div>
        <div class="item-status">
          {#if item.received}
            <span class="badge">✓</span>
          {/if}
        </div>
      </div>
    {/each}
  </div>

  <div class="footer">
    <p>Created: {new Date(checklist.createdAt).toLocaleDateString()}</p>
  </div>
</div>

<style>
  .checklist-container {
    background: white;
    border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
    overflow: hidden;
    max-width: 800px;
    width: 100%;
    margin: 0 auto;
  }

  .header {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 24px;
    text-align: center;
  }

  .header h1 {
    font-size: 28px;
    margin-bottom: 8px;
  }

  .order-url {
    font-size: 14px;
    opacity: 0.9;
  }

  .order-url a {
    color: white;
    text-decoration: underline;
  }

  .progress-section {
    padding: 20px 24px;
    border-bottom: 1px solid #eee;
  }

  .progress-info {
    display: flex;
    justify-content: space-between;
    margin-bottom: 12px;
    font-size: 14px;
    color: #666;
  }

  .progress-text {
    font-weight: 600;
  }

  .progress-percentage {
    color: #667eea;
    font-weight: bold;
  }

  .progress-bar {
    height: 8px;
    background: #eee;
    border-radius: 4px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #667eea, #764ba2);
    transition: width 0.3s ease;
  }

  .celebration {
    background: #e8f5e9;
    color: #2e7d32;
    padding: 16px 24px;
    text-align: center;
    font-weight: 600;
    border-bottom: 1px solid #eee;
  }

  .items-list {
    max-height: 60vh;
    overflow-y: auto;
  }

  .item {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 20px 24px;
    border-bottom: 1px solid #eee;
    transition: background 0.2s;
    cursor: pointer;
    min-height: 60px;
  }

  .item:hover {
    background: #f9f9f9;
  }

  .item.received {
    opacity: 0.7;
    background: #f0f7ff;
  }

  .item-checkbox {
    width: 24px;
    height: 24px;
    cursor: pointer;
    accent-color: #667eea;
    flex-shrink: 0;
  }

  .item-content {
    flex: 1;
  }

  .item-name {
    font-weight: 500;
    color: #333;
    word-break: break-word;
  }

  .item.received .item-name {
    text-decoration: line-through;
    color: #999;
  }

  .item-qty {
    font-size: 12px;
    color: #999;
    margin-top: 4px;
  }

  .item-status {
    flex-shrink: 0;
  }

  .badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    background: #667eea;
    color: white;
    border-radius: 50%;
    font-size: 12px;
    font-weight: bold;
  }

  .footer {
    padding: 16px 24px;
    text-align: center;
    font-size: 12px;
    color: #999;
    border-top: 1px solid #eee;
  }

  @media (max-width: 480px) {
    .checklist-container {
      border-radius: 0;
    }

    .header {
      padding: 20px 16px;
    }

    .header h1 {
      font-size: 24px;
    }

    .progress-section,
    .celebration,
    .item,
    .footer {
      padding: 20px 16px;
    }

    .items-list {
      max-height: calc(100vh - 300px);
    }
  }

  /* iPad and larger tablets */
  @media (min-width: 768px) and (max-width: 1024px) {
    .header {
      padding: 32px;
    }

    .header h1 {
      font-size: 32px;
    }

    .progress-section,
    .celebration,
    .item,
    .footer {
      padding: 24px 32px;
    }

    .item-name {
      font-size: 16px;
    }

    .item-qty {
      font-size: 14px;
    }
  }

  /* Large tablets and desktops */
  @media (min-width: 1025px) {
    .checklist-container {
      max-width: 900px;
    }

    .item-name {
      font-size: 17px;
    }
  }
</style>
