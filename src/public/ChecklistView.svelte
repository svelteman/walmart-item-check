<script>
  import { onMount } from 'svelte';

  export let checklist;
  export let checklistId;

  let items = checklist.items;
  let allReceived = false;
  let showCompleted = false;
  let filterMode = 'all';
  let itemSearch = '';
  let activeImage = null;
  let showColumnMenu = false;
  let showQty = true;
  let showPaid = true;
  let showCurrent = true;
  let showStatus = true;
  let showNotes = true;
  let manualCols = { qty: true, paid: true, current: true, status: true, notes: true };

  const loadColumnPreferences = () => {
    const saved = localStorage.getItem('columnPreferences');
    if (saved) {
      try {
        manualCols = { qty: true, paid: true, current: true, status: true, notes: true, ...JSON.parse(saved) };
      } catch (e) {
        manualCols = { qty: true, paid: true, current: true, status: true, notes: true };
      }
    }
  };

  const saveColumnPreferences = () => {
    localStorage.setItem('columnPreferences', JSON.stringify(manualCols));
  };

  const toggleColumnVisibility = (column) => {
    manualCols[column] = !manualCols[column];
    saveColumnPreferences();
    updateColumnVisibility();
  };

  const updateColumnVisibility = () => {
    const width = window.innerWidth;
    const autoHide = width <= 480
      ? { qty: true, paid: true, current: true, status: true, notes: true }
      : width <= 620
        ? { qty: false, paid: true, current: true, status: true, notes: true }
        : width <= 760
          ? { qty: false, paid: false, current: true, status: true, notes: true }
          : width <= 900
            ? { qty: false, paid: false, current: false, status: true, notes: true }
            : { qty: false, paid: false, current: false, status: false, notes: false };

    showQty = manualCols.qty && !autoHide.qty;
    showPaid = manualCols.paid && !autoHide.paid;
    showCurrent = manualCols.current && !autoHide.current;
    showStatus = manualCols.status && !autoHide.status;
    showNotes = manualCols.notes && !autoHide.notes;
  };

  $: tableColumns = [
    'minmax(0, 2.2fr)',
    ...(showQty ? ['90px'] : []),
    ...(showPaid ? ['110px'] : []),
    ...(showCurrent ? ['110px'] : []),
    ...(showStatus ? ['110px'] : []),
    ...(showNotes ? ['minmax(180px, 1fr)'] : [])
  ].join(' ');

  const syncPendingView = (nextMode) => {
    filterMode = nextMode;
    showCompleted = nextMode === 'pending';
  };

  const handleHideCheckedToggle = (checked) => {
    showCompleted = checked;
    if (checked) {
      filterMode = 'pending';
    } else if (filterMode === 'pending') {
      filterMode = 'all';
    }
  };
  let sortKey = 'name';
  let sortDirection = 'asc';
  let ws = null;
  let instanceId = Math.random().toString(36).substr(2, 9); // unique ID for this browser tab

  const compareValues = (a, b) => {
    const left = typeof a === 'string' ? a.toLowerCase() : a;
    const right = typeof b === 'string' ? b.toLowerCase() : b;
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
  };

  const hasPriceMismatch = (item) => {
    const paid = Number(item?.pricePaid);
    const current = Number(item?.currentPrice);
    if (!Number.isFinite(paid) || !Number.isFinite(current)) return false;
    return Math.abs(paid - current) > 0.009;
  };

  $: receivedCount = items.filter(i => i.received).length;
  $: totalCount = items.length;
  $: progress = totalCount > 0 ? (receivedCount / totalCount) * 100 : 0;
  $: allReceived = items.length > 0 && items.every(i => i.received);
  $: filteredItems = [...items]
    .filter(item => {
      const matchesFilter =
        (filterMode === 'all') ||
        (filterMode === 'pending' && !item.received) ||
        (filterMode === 'received' && item.received);
      const matchesSearch = item.name.toLowerCase().includes(itemSearch.toLowerCase());
      const matchesHideCompleted = !(showCompleted && item.received);
      return matchesFilter && matchesSearch && matchesHideCompleted;
    })
    .sort((a, b) => {
      const dir = sortDirection === 'asc' ? 1 : -1;
      if (sortKey === 'received') return (a.received === b.received ? 0 : a.received ? 1 : -1) * dir;
      if (sortKey === 'quantity') return (Number(a.quantity) - Number(b.quantity)) * dir;
      if (sortKey === 'pricePaid') return ((Number(a.pricePaid ?? 0) - Number(b.pricePaid ?? 0)) || compareValues(a.name, b.name)) * dir;
      if (sortKey === 'currentPrice') return ((Number(a.currentPrice ?? 0) - Number(b.currentPrice ?? 0)) || compareValues(a.name, b.name)) * dir;
      return compareValues(a.name, b.name) * dir;
    });

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
    loadColumnPreferences();
    updateColumnVisibility();
    window.addEventListener('resize', updateColumnVisibility);
    connectWebSocket();

    return () => {
      window.removeEventListener('resize', updateColumnVisibility);
      if (ws) {
        ws.close();
      }
    };
  });

</script>

<div class="checklist-container">
  <div class="header">
    <div class="header-bar">
      <a class="back-link" href="/">← Main page</a>
      <h1>📦 Order Checklist</h1>
    </div>
    <p class="order-url">
      <button type="button" class="view-order-btn" on:click={() => window.open(checklist.orderUrl, '_blank')}>View Order</button>
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

  <div class="toolbar">
    <label class="filter-wrap">
      <span>Filter</span>
      <select value={filterMode} on:change={(event) => syncPendingView(event.target.value)}>
        <option value="all">All</option>
        <option value="pending">Pending</option>
        <option value="received">Received</option>
      </select>
    </label>
    <div class="search-wrap">
      <span>Search</span>
      <input bind:value={itemSearch} placeholder="Item name" />
      {#if itemSearch}
        <button type="button" class="clear-search" on:click={() => itemSearch = ''}>Clear</button>
      {/if}
    </div>
    <label class="hide-toggle">
      <input type="checkbox" checked={showCompleted} on:change={(event) => handleHideCheckedToggle(event.target.checked)} />
      Hide checked
    </label>
    <div class="column-menu-wrapper">
      <button 
        type="button" 
        class="column-toggle-button"
        on:click={() => showColumnMenu = !showColumnMenu}
        title="Toggle column visibility"
      >
        ⚙ Columns
      </button>
      {#if showColumnMenu}
        <div class="column-menu">
          <label class="column-option">
            <input 
              type="checkbox" 
              checked={manualCols.qty}
              on:change={() => toggleColumnVisibility('qty')}
            />
            Qty
          </label>
          <label class="column-option">
            <input 
              type="checkbox" 
              checked={manualCols.paid}
              on:change={() => toggleColumnVisibility('paid')}
            />
            Paid
          </label>
          <label class="column-option">
            <input 
              type="checkbox" 
              checked={manualCols.current}
              on:change={() => toggleColumnVisibility('current')}
            />
            Current
          </label>
          <label class="column-option">
            <input 
              type="checkbox" 
              checked={manualCols.status}
              on:change={() => toggleColumnVisibility('status')}
            />
            Status
          </label>
          <label class="column-option">
            <input 
              type="checkbox" 
              checked={manualCols.notes}
              on:change={() => toggleColumnVisibility('notes')}
            />
            Notes
          </label>
        </div>
      {/if}
    </div>
  </div>

  {#if allReceived}
    <div class="celebration">
      ✅ All items received! Great job!
    </div>
  {/if}

  <div class="items-list">
    <div class="table-head" style:grid-template-columns={tableColumns}>
      <button class="sort-button" type="button" on:click={() => {
        if (sortKey === 'name') {
          sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
          sortKey = 'name';
          sortDirection = 'asc';
        }
      }}>
        Item {sortKey === 'name' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
      </button>
      {#if showQty}
        <button class="sort-button" type="button" on:click={() => {
          if (sortKey === 'quantity') {
            sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
          } else {
            sortKey = 'quantity';
            sortDirection = 'asc';
          }
        }}>
          Qty {sortKey === 'quantity' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
        </button>
      {/if}
      {#if showPaid}
        <button class="sort-button" type="button" on:click={() => {
          if (sortKey === 'pricePaid') {
            sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
          } else {
            sortKey = 'pricePaid';
            sortDirection = 'asc';
          }
        }}>
          Paid {sortKey === 'pricePaid' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
        </button>
      {/if}
      {#if showCurrent}
        <button class="sort-button" type="button" on:click={() => {
          if (sortKey === 'currentPrice') {
            sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
          } else {
            sortKey = 'currentPrice';
            sortDirection = 'asc';
          }
        }}>
          Current {sortKey === 'currentPrice' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
        </button>
      {/if}
      {#if showStatus}
        <button class="sort-button" type="button" on:click={() => {
          if (sortKey === 'received') {
            sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
          } else {
            sortKey = 'received';
            sortDirection = 'asc';
          }
        }}>
          Status {sortKey === 'received' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
        </button>
      {/if}
      {#if showNotes}
        <div class="table-label">Notes</div>
      {/if}
    </div>
    {#each filteredItems as item (item.id)}
      <div
        class="item"
        class:received={item.received}
        class:price-mismatch={hasPriceMismatch(item)}
        role="button"
        tabindex="0"
        style:grid-template-columns={tableColumns}
        on:click={() => updateItem(item.id, !item.received)}
        on:keydown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            updateItem(item.id, !item.received);
          }
        }}
      >
        <div class="item-main">
          <div class="thumbnail-shell">
            {#if item.imageUrl}
              <button type="button" class="thumbnail-wrap" on:click|stopPropagation={() => activeImage = item.imageUrl} aria-label={`Open image preview for ${item.name}`}>
                <img class="item-thumb" src={item.imageUrl} alt={item.name} />
                <span class="image-preview">
                  <img src={item.imageUrl} alt={item.name} />
                </span>
              </button>
            {/if}
          </div>
          <input
            type="checkbox"
            checked={item.received}
            on:click|stopPropagation
            on:change={(e) => updateItem(item.id, e.target.checked)}
            class="item-checkbox"
          />
          <div class="item-content">
            {#if item.productUrl}
              <a class="item-name" href={item.productUrl} target="_blank" rel="noopener" on:click|stopPropagation>{item.name}</a>
            {:else}
              <div class="item-name">{item.name}</div>
            {/if}
            {#if item.quantity > 1}
              <div class="item-qty">Qty: {item.quantity}</div>
            {/if}
          </div>
        </div>
        {#if showQty}
          <div class="item-qty-cell">{item.quantity}</div>
        {/if}
        {#if showPaid}
          <div class="item-price-cell">{item.pricePaid != null ? `$${item.pricePaid.toFixed(2)}` : '—'}</div>
        {/if}
        {#if showCurrent}
          <div class="item-price-cell">{item.currentPrice != null ? `$${item.currentPrice.toFixed(2)}` : '—'}</div>
        {/if}
        {#if showStatus}
          <div class="item-status">
            {#if item.received}
              <span class="badge">✓</span>
            {/if}
          </div>
        {/if}
        {#if showNotes}
          <div class="item-note-cell">{item.notes || '—'}</div>
        {/if}
      </div>
    {/each}
  </div>

  {#if activeImage}
    <div
      class="image-modal"
      role="dialog"
      tabindex="0"
      aria-modal="true"
      on:click={() => activeImage = null}
      on:keydown={(event) => {
        if (event.key === 'Escape') {
          activeImage = null;
        }
      }}
    >
      <div class="image-modal-content" role="document" on:click|stopPropagation>
        <button type="button" class="image-close" on:click={() => activeImage = null}>Close</button>
        <img src={activeImage} alt="Item preview" />
      </div>
    </div>
  {/if}

  <div class="footer">
    <p>Created: {new Date(checklist.createdAt).toLocaleDateString()}</p>
  </div>
</div>

<style>
  .checklist-container {
    background: #fdf6e3;
    border-radius: 14px;
    box-shadow: 0 18px 40px rgba(7, 54, 66, 0.28);
    overflow: hidden;
    max-width: 900px;
    width: 100%;
    margin: 0 auto;
    border: 1px solid rgba(88, 110, 117, 0.35);
    color: #073642;
  }

  .header {
    background: linear-gradient(135deg, #586e75 0%, #6c71c4 100%);
    color: #fdf6e3;
    padding: 24px;
    text-align: center;
  }

  .header-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 8px;
  }

  .back-link {
    color: #fdf6e3;
    text-decoration: none;
    font-weight: 600;
    font-size: 14px;
    opacity: 0.9;
  }

  .header h1 {
    font-size: 28px;
    margin: 0 auto;
    color: #fdf6e3;
  }

  .order-url {
    font-size: 14px;
    opacity: 0.95;
  }

  .order-url a {
    color: #fdf6e3;
    text-decoration: underline;
  }

  .view-order-btn {
    background: none;
    border: none;
    color: #fdf6e3;
    text-decoration: underline;
    font-size: 14px;
    cursor: pointer;
    opacity: 0.95;
    padding: 0;
    font: inherit;
    font-weight: inherit;
  }

  .view-order-btn:hover {
    opacity: 1;
  }

  .progress-section {
    padding: 20px 24px;
    border-bottom: 1px solid rgba(88, 110, 117, 0.35);
    background: rgba(238, 232, 213, 0.45);
  }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
    padding: 16px 24px 10px;
    border-bottom: 1px solid rgba(88, 110, 117, 0.35);
    background: rgba(238, 232, 213, 0.38);
  }

  .filter-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #073642;
    font-size: 14px;
  }

  .filter-wrap select,
  .search-wrap input {
    border: 1px solid rgba(88, 110, 117, 0.7);
    border-radius: 8px;
    background: #fdf6e3;
    padding: 8px 10px;
    font: inherit;
    color: #073642;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.4);
  }

  .search-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #073642;
    font-size: 14px;
  }

  .search-wrap input {
    min-width: 180px;
  }

  .clear-search {
    background: #b58900;
    color: #fdf6e3;
    border: none;
    border-radius: 6px;
    padding: 6px 10px;
    font-size: 12px;
    cursor: pointer;
  }

  .hide-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #073642;
    font-size: 14px;
  }

  .column-menu-wrapper {
    position: relative;
  }

  .column-toggle-button {
    background: #667eea;
    color: #fdf6e3;
    border: none;
    border-radius: 6px;
    padding: 8px 12px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
  }

  .column-toggle-button:hover {
    background: #5568d3;
  }

  .column-menu {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 8px;
    background: white;
    border: 1px solid #ddd;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    padding: 8px;
    z-index: 100;
    min-width: 120px;
  }

  .column-option {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    cursor: pointer;
    font-size: 13px;
    color: #073642;
    white-space: nowrap;
    border-radius: 4px;
    transition: background 0.2s;
  }

  .column-option:hover {
    background: #f0f0f0;
  }

  .column-option input[type="checkbox"] {
    cursor: pointer;
    accent-color: #667eea;
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

  .table-head {
    display: grid;
    gap: 0;
    background: #f7f8fb;
    border-bottom: 1px solid #e3e7ef;
    font-size: 12px;
    font-weight: 700;
    color: #555;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .sort-button {
    appearance: none;
    background: transparent;
    border: none;
    border-right: 1px solid #e3e7ef;
    padding: 12px 16px;
    text-align: left;
    color: inherit;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }

  .table-label {
    border-right: 1px solid #e3e7ef;
    padding: 12px 16px;
    text-align: left;
  }

  .item {
    display: grid;
    align-items: center;
    gap: 0;
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

  .item.price-mismatch {
    background: #fff4df;
    box-shadow: inset 4px 0 0 #cb4b16;
  }

  .item-main {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  .thumbnail-shell {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 56px;
    height: 56px;
    flex-shrink: 0;
  }

  .thumbnail-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 56px;
    height: 56px;
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
  }

  .item-thumb {
    width: 56px;
    height: 56px;
    object-fit: cover;
    border-radius: 10px;
    border: 1px solid rgba(88, 110, 117, 0.35);
    background: #f5f5f5;
    cursor: zoom-in;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
  }

  .image-preview {
    position: absolute;
    left: 64px;
    top: 50%;
    transform: translateY(-50%);
    z-index: 30;
    width: min(180px, 28vw);
    max-width: 180px;
    background: rgba(7, 54, 66, 0.96);
    border: 1px solid rgba(253, 246, 227, 0.3);
    border-radius: 12px;
    padding: 8px;
    box-shadow: 0 18px 40px rgba(7, 54, 66, 0.24);
    pointer-events: none;
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.16s ease, visibility 0.16s ease;
  }

  .thumbnail-wrap:hover .image-preview,
  .thumbnail-wrap:focus-visible .image-preview {
    opacity: 1;
    visibility: visible;
  }

  .image-preview img {
    display: block;
    width: 100%;
    height: auto;
    max-height: 180px;
    object-fit: contain;
    border-radius: 8px;
    background: #fff;
  }

  .item-checkbox {
    width: 24px;
    height: 24px;
    cursor: pointer;
    accent-color: #667eea;
    flex-shrink: 0;
  }

  .item-content {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .item-name {
    font-weight: 500;
    color: #333;
    word-break: break-word;
    text-decoration: none;
  }

  .item.received .item-name {
    text-decoration: line-through;
    color: #999;
  }

  .item-name:hover {
    text-decoration: underline;
  }

  .item-qty {
    font-size: 12px;
    color: #999;
    margin-top: 4px;
  }

  .item-qty-cell,
  .item-price-cell {
    color: #666;
    font-size: 14px;
    font-weight: 500;
    text-align: center;
  }

  .item-status {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 24px;
  }

  .item-note-cell {
    color: #586e75;
    font-size: 12px;
    line-height: 1.35;
    word-break: break-word;
    padding-right: 4px;
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

  .image-modal {
    position: fixed;
    inset: 0;
    background: rgba(7, 54, 66, 0.72);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 24px;
  }

  .image-modal-content {
    position: relative;
    max-width: min(92vw, 1200px);
    max-height: min(92vh, 1200px);
    background: #fff;
    border-radius: 18px;
    padding: 18px 18px 12px;
    box-shadow: 0 30px 60px rgba(0, 0, 0, 0.3);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .image-modal-content img {
    display: block;
    max-width: min(88vw, 1100px);
    max-height: min(82vh, 900px);
    width: auto;
    height: auto;
    object-fit: contain;
    border-radius: 12px;
    background: #f5f5f5;
  }

  .image-close {
    position: absolute;
    right: 12px;
    top: 12px;
    border: none;
    background: rgba(7, 54, 66, 0.9);
    color: #fff;
    border-radius: 999px;
    padding: 8px 12px;
    cursor: pointer;
    font-weight: 600;
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
      max-width: 100vw;
      width: 100vw;
      margin: 0;
    }

    .header {
      padding: 20px 12px;
    }

    .header-bar {
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
    }

    .header h1 {
      font-size: 22px;
      margin: 0;
    }

    .progress-section,
    .celebration,
    .footer {
      padding: 16px 12px;
    }

    .toolbar {
      padding: 12px;
      align-items: stretch;
      gap: 10px;
    }

    .filter-wrap,
    .search-wrap,
    .hide-toggle {
      width: 100%;
      justify-content: space-between;
    }

    .search-wrap {
      flex-wrap: wrap;
    }

    .search-wrap input {
      min-width: 0;
      width: 100%;
    }

    .items-list {
      max-height: none;
      overflow: visible;
    }

    .table-head,
    .item {
      grid-template-columns: minmax(0, 2fr) 48px 66px 66px 52px;
      column-gap: 6px;
      padding-left: 10px;
      padding-right: 10px;
    }

    .sort-button {
      padding: 10px 6px;
      font-size: 10px;
      letter-spacing: 0.02em;
      white-space: nowrap;
    }

    .item {
      min-height: 52px;
      padding-top: 12px;
      padding-bottom: 12px;
    }

    .item-main {
      gap: 8px;
      min-width: 0;
    }

    .thumbnail-shell,
    .thumbnail-wrap,
    .item-thumb {
      width: 42px;
      height: 42px;
    }

    .image-preview {
      left: 52px;
      width: min(150px, 44vw);
      max-width: 150px;
    }

    .item-checkbox {
      width: 18px;
      height: 18px;
    }

    .item-content {
      min-width: 0;
    }

    .item-name {
      font-size: 13px;
      line-height: 1.3;
    }

    .item-qty,
    .item-qty-cell,
    .item-price-cell {
      font-size: 11px;
    }

    .badge {
      width: 20px;
      height: 20px;
      font-size: 10px;
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
