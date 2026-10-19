// ==UserScript==
// @name         Walmart Order Checker
// @namespace    http://tampermonkey.net/
// @version      1.2.1
// @description  Send Walmart order items to the checker server
// @author       You
// @match        https://www.walmart.com/*
// @match        https://walmart.com/*
// @icon         https://www.walmart.com/favicon.ico
// @run-at       document-idle
// @noframes
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_info
// @connect      *
// ==/UserScript==

(function() {
  'use strict';

  const PANEL_ID = 'walmart-order-checker';
  const isOrderPage = () => /^\/(?:account\/)?orders\/[^/]+\/?$/.test(location.pathname);

  function normalizeServer(value) {
    let input = value.trim();
    if (!/^https?:\/\//i.test(input)) {
      // Accept a bare IPv6 address as well as an IP/hostname or complete URL.
      if (!input.startsWith('[') && (input.match(/:/g) || []).length > 1) input = `[${input}]`;
      input = `http://${input}`;
      const url = new URL(input);
      if (!url.port) url.port = '3000';
      input = url.href;
    }
    const url = new URL(input);
    if (!['http:', 'https:'].includes(url.protocol) || /(^|\.)walmart\.com$/i.test(url.hostname)) {
      throw new Error('Enter the checker server address, not the Walmart address.');
    }
    return url.origin;
  }

  function installedServer() {
    const info = typeof GM_info === 'undefined' ? {} : GM_info;
    for (const value of [info.script?.downloadURL, info.scriptUpdateURL, info.script?.fileURL]) {
      if (!value) continue;
      try {
        const url = new URL(value);
        if (url.pathname.endsWith('/walmart-checker.user.js') || url.pathname === '/userscript.js') {
          return normalizeServer(value);
        }
      } catch (_) { /* A manual install can be configured below. */ }
    }
    return '';
  }

  function getServer(change = false) {
    const previous = GM_getValue('checkerServer', '') || installedServer();
    if (previous && !change) return normalizeServer(previous);
    const input = prompt('Checker server URL or IP address:', previous || '');
    if (!input?.trim()) throw new Error('No server selected. Use Server to set its address.');
    const server = normalizeServer(input);
    GM_setValue('checkerServer', server);
    return server;
  }

  function parseOrderItems() {
    const items = [];
    const rows = document.querySelectorAll('[data-testid="itemtile-stack"]');
    for (const row of rows) {
      // Skip unavailable/cancelled sections, including their collapsed contents.
      let section = row.parentElement;
      let excluded = false;
      while (section && !section.matches('[data-testid="orderInfoCard"]')) {
        const heading = section.firstElementChild?.textContent || '';
        if (/^\s*\d+\s+(?:unavailable|cancell?ed|removed|returned)\s+items?\b/i.test(heading)) {
          excluded = true;
          break;
        }
        section = section.parentElement;
      }
      if (excluded) continue;
      const name = row.querySelector('[data-testid="productName"]')?.textContent.trim();
      const quantityText = row.querySelector('.bill-item-quantity')?.textContent || row.innerText || row.textContent;
      const quantity = quantityText.match(/Qty\s*:?\s*(\d+)/i);
      if (name && quantity) items.push({ name, quantity: Number(quantity[1]) });
    }
    return { items, orderUrl: location.href };
  }

  function sendToServer(data, server) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'POST',
        url: `${server}/api/checklist/create`,
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify(data),
        timeout: 20000,
        onload(response) {
          try {
            if (response.status < 200 || response.status >= 300) throw new Error(`Server returned HTTP ${response.status}.`);
            const result = JSON.parse(response.responseText);
            if (!result.success || !result.checklistId) throw new Error(result.error || 'Invalid server response.');
            // Build from the working server origin, preserving bracketed IPv6.
            resolve(`${server}/?checklist=${encodeURIComponent(result.checklistId)}`);
          } catch (error) { reject(error); }
        },
        onerror: () => reject(new Error(`Cannot reach ${server}. Check the address and Tampermonkey connection permission.`)),
        ontimeout: () => reject(new Error(`Timed out connecting to ${server}.`))
      });
    });
  }

  function syncPanel() {
    const existing = document.getElementById(PANEL_ID);
    if (!isOrderPage()) {
      existing?.remove();
      return;
    }
    if (existing || !document.body) return;
    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:2147483647;max-width:min(360px,calc(100vw - 40px));padding:12px;background:#fff;color:#111;border:1px solid #0071ce;border-radius:8px;box-shadow:0 2px 12px #0005;font:14px Arial,sans-serif;';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '📱 Send to Checker';
    button.style.cssText = 'padding:12px 20px;background:#0071ce;color:#fff;border:0;border-radius:4px;cursor:pointer;font:bold 14px Arial,sans-serif;';
    const settings = document.createElement('button');
    settings.type = 'button';
    settings.textContent = 'Server';
    settings.style.cssText = 'padding:10px;margin-left:8px;background:#fff;color:#0071ce;border:0;cursor:pointer;';
    const status = document.createElement('div');
    status.setAttribute('role', 'status');
    status.style.cssText = 'margin-top:8px;overflow-wrap:anywhere;';
    status.textContent = 'Order Checker ready';
    settings.onclick = () => {
      try { status.textContent = `Server: ${getServer(true)}`; }
      catch (error) { status.textContent = error.message; }
    };
    button.onclick = async () => {
      button.disabled = true;
      button.textContent = '⏳ Sending…';
      try {
        const data = parseOrderItems();
        if (!data.items.length) throw new Error('No order items found. Expand the order items and try again.');
        const server = getServer();
        status.textContent = `Sending ${data.items.reduce((sum, item) => sum + item.quantity, 0)} items…`;
        const url = await sendToServer(data, server);
        GM_setValue('checkerServer', server);
        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = 'Open checklist';
        link.style.cssText = 'color:#0071ce;font-weight:bold;';
        status.replaceChildren(document.createTextNode('✅ Sent! '), link);
      } catch (error) {
        console.error('Walmart Order Checker:', error);
        status.textContent = error.message;
      } finally {
        button.disabled = false;
        button.textContent = '📱 Send to Checker';
      }
    };
    panel.append(button, settings, status);
    document.body.appendChild(panel);
  }

  // Walmart navigates between purchase history and orders without a full load.
  // Matching the site lets the same script handle those transitions and remounts.
  syncPanel();
  setInterval(syncPanel, 1000);
})();
