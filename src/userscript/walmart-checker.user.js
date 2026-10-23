// ==UserScript==
// @name         Walmart Order Checker
// @namespace    http://tampermonkey.net/
// @version      1.2.7
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
	const DEFAULT_SERVER_PORT = '7429';
	const SERVER_HINT_QUERY = 'wic_server';
	const isOrderPage = () => /^\/(?:account\/)?orders\/[^/]+\/?$/.test(location.pathname);
	const isOrderDetailPage = () =>
		/^\/(?:account\/)?orders\/[^/]+\/?$/.test(location.pathname);

	const isOrdersListPage = () =>
		/^\/(?:account\/)?orders\/?$/.test(location.pathname);

	const isOrderPage = () =>
		isOrderDetailPage() || isOrdersListPage();

	function gmGetValue(key, fallback = '') {
		try {
			if (typeof GM_getValue === 'function') return GM_getValue(key, fallback);
		} catch (_) {}

		try {
			const raw = localStorage.getItem(`walmart-order-checker:${key}`);
			return raw == null ? fallback : JSON.parse(raw);
		} catch (_) {
			return fallback;
		}
	}

	function gmSetValue(key, value) {
		try {
			if (typeof GM_setValue === 'function') {
				GM_setValue(key, value);
				return;
			}
		} catch (_) {}

		try {
			localStorage.setItem(`walmart-order-checker:${key}`, JSON.stringify(value));
		} catch (_) {}
	}

	function normalizeServer(value) {
		let input = value.trim();
		if (!/^https?:\/\//i.test(input)) {
			// Accept a bare IPv6 address as well as an IP/hostname or complete URL.
			if (!input.startsWith('[') && (input.match(/:/g) || []).length > 1) input = `[${input}]`;
			input = `http://${input}`;
			const url = new URL(input);
			if (!url.port) url.port = DEFAULT_SERVER_PORT;
			input = url.href;
		}
	const url = new URL(input);
	if (!['http:', 'https:'].includes(url.protocol) || /(^|\.)walmart\.com$/i.test(url.hostname)) {
		throw new Error('Enter the checker server address, not the Walmart address.');
	}
	return url.origin;
}

function getHintedServer() {
	const hints = [];
	const fromQuery = new URLSearchParams(location.search).get(SERVER_HINT_QUERY);
	if (fromQuery) hints.push(fromQuery);

	const hashValue = location.hash.startsWith('#') ? location.hash.slice(1) : location.hash;
	if (hashValue) {
		const hashParams = new URLSearchParams(hashValue);
		const fromHash = hashParams.get(SERVER_HINT_QUERY);
		if (fromHash) hints.push(fromHash);
	}

	if (document.referrer) hints.push(document.referrer);

	for (const hint of hints) {
		try {
			return normalizeServer(hint);
		} catch (_) {
			// Ignore invalid hints and continue.
		}
	}
	return '';
}

function cacheHintedServer() {
	const hinted = getHintedServer();
	if (hinted) gmSetValue('checkerServer', hinted);
}

function installedServer() {
	const info = typeof GM_info === 'undefined' ? {} : GM_info;
	for (const value of [info.script?.downloadURL, info.scriptUpdateURL, info.script?.fileURL, typeof document !== 'undefined' ? document.currentScript?.src : '']) {
		if (!value) continue;
		try {
			const url = new URL(value);
			if (url.pathname.endsWith('/walmart-checker.user.js') || url.pathname === '/userscript.js' || /\/api\/userscripts\/.*\.user\.js$/.test(url.pathname)) {
				return normalizeServer(value);
			}
		} catch (_) { /* A manual install can be configured below. */ }
	}
	return '';
}

async function discoverServerCandidates() {
	const seen = new Set();
	const candidates = [];
	const add = (value) => {
		if (!value) return;
		const trimmed = value.trim();
		if (!trimmed || seen.has(trimmed)) return;
		seen.add(trimmed);
		candidates.push(trimmed);
	};

	add(getHintedServer());
	add(gmGetValue('checkerServer', ''));
	add(installedServer());
	add(`http://localhost:${DEFAULT_SERVER_PORT}`);
	add(`http://127.0.0.1:${DEFAULT_SERVER_PORT}`);
	add(`http://[::1]:${DEFAULT_SERVER_PORT}`);

	return candidates;
}

async function canReachServer(server) {
	try {
		const response = await new Promise((resolve) => {
			GM_xmlhttpRequest({
				method: 'GET',
				url: `${server}/api/checklist/test`,
				timeout: 2500,
				onload: (result) => resolve(result),
				onerror: () => resolve(null),
				ontimeout: () => resolve(null)
			});
		});
		return !!(response && response.status >= 200 && response.status < 300);
	} catch (_) {
		return false;
	}
}

async function detectServer() {
	const candidates = await discoverServerCandidates();
	for (const candidate of candidates) {
		try {
			const url = normalizeServer(candidate);
			if (await canReachServer(url)) {
				gmSetValue('checkerServer', url);
				return url;
			}
		} catch (_) {
			// Try the next candidate.
		}
	}
	return '';
}

async function getServer(change = false) {
	const previous = gmGetValue('checkerServer', '') || installedServer();
	if (previous && !change) {
		try {
			const normalized = normalizeServer(previous);
			if (await canReachServer(normalized)) return normalized;
		} catch (_) {
			// Fall through to discovery.
		}
	}

	if (!change) {
		const discovered = await detectServer();
		if (discovered) return discovered;
	}

	const input = prompt('Checker server URL or IP address:', previous || '');
	if (!input?.trim()) throw new Error('No server selected. Use the main page to install the script or set the server address.');
	const server = normalizeServer(input);
	gmSetValue('checkerServer', server);
	return server;
}

function resolveAbsoluteUrl(value) {
	if (!value) return '';
	try {
		return new URL(value, location.origin).href;
	} catch (_) {
		return '';
	}
}

function pickProductLink(row) {
	const links = Array.from(row.querySelectorAll('a[href]'));
	const preferred = links.find(link => /\b(?:ip|product|catalog|item)\b|\/p\//i.test(link.href) || link.textContent?.trim());
		if (preferred) return preferred;
		return row.querySelector('[data-testid="productName"] a') || links[0] || null;
	}

function pickProductImage(row) {
	const candidates = Array.from(row.querySelectorAll('img, source'));
	const image = candidates.find(node => {
		const url = node.currentSrc || node.src || node.dataset?.src || node.dataset?.srcset || node.srcset || '';
		return /^https?:\/\//i.test(url) || /walmartimages\.com|walmart\.com/i.test(url);
	});
	if (!image) return '';
	const rawUrl = image.currentSrc || image.src || image.dataset?.src || image.dataset?.srcset || image.srcset || '';
	if (/^https?:\/\//i.test(rawUrl)) return rawUrl;
	const match = rawUrl.match(/https?:\/\/[^\s,]+/i);
	return match ? match[0] : '';
}

function parseMoneyValues(text) {
	const matches = [...String(text || '').matchAll(/\$\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/g)];
	return matches.map(match => Number(match[1].replace(/,/g, ''))).filter(Number.isFinite);
}

function isSavingsText(text) {
	return /(?:^|\b)(?:from\s+)?savings?\b|save(?:d|s)?\b|discount\b|coupon\b|off\b/i.test(text);
}

function isStruckThrough(node) {
	let current = node;
	while (current && current !== document.body) {
		const tagName = current.tagName ? current.tagName.toLowerCase() : '';
		if (tagName === 's' || tagName === 'del' || tagName === 'strike') return true;
		const style = window.getComputedStyle(current);
		const decoration = style.textDecorationLine || style.textDecoration || '';
		if (String(decoration).includes('line-through')) return true;
		current = current.parentElement;
	}
	return false;
}

function extractPriceInfo(row) {
	const nodes = Array.from(row.querySelectorAll('*')).filter((el) => {
		const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
		if (!text.includes('$')) return false;
		return !Array.from(el.children).some((child) => (child.textContent || '').includes('$'));
	});

	const values = [];
	for (const node of nodes) {
		const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
		const amounts = parseMoneyValues(text);
		if (!amounts.length) continue;
		const savings = isSavingsText(text);
		const struck = isStruckThrough(node);
		for (const amount of amounts) values.push({ amount, savings, struck });
	}

	const nonSavings = values.filter((entry) => !entry.savings);
	const primary = nonSavings.filter((entry) => !entry.struck);
	const paidPool = primary.length ? primary : (nonSavings.length ? nonSavings : values);
	const pricePaid = paidPool[0]?.amount ?? null;
	const struckOriginal = nonSavings.find((entry) => entry.struck && (pricePaid == null || Math.abs(entry.amount - pricePaid) > 0.009))?.amount ?? null;
	const alternateCurrent = primary.find((entry) => pricePaid == null || Math.abs(entry.amount - pricePaid) > 0.009)?.amount ?? null;
	const currentPrice = alternateCurrent ?? struckOriginal ?? pricePaid;

	const savingsAmount = values.find((entry) => entry.savings)?.amount ?? null;
	const notes = [];
	if (savingsAmount != null) notes.push(`Savings: $${savingsAmount.toFixed(2)}`);
	if (struckOriginal != null) notes.push(`Was $${struckOriginal.toFixed(2)}`);
	const priceNote = notes.length ? notes.join(' • ') : '';

	return {
		pricePaid: pricePaid != null ? Number(pricePaid.toFixed(2)) : null,
		currentPrice: currentPrice != null ? Number(currentPrice.toFixed(2)) : null,
		priceNote
	};
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
		const nameEl = row.querySelector('[data-testid="productName"]');
		const name = (nameEl?.textContent || row.querySelector('a[href]')?.textContent || '').trim();
		const productLink = pickProductLink(row) || nameEl?.closest('a');
		const productUrl = productLink?.href ? resolveAbsoluteUrl(productLink.href) : '';
		const imageUrl = pickProductImage(row);
		const quantityText = row.querySelector('.bill-item-quantity')?.textContent || row.innerText || row.textContent;
		const quantity = quantityText.match(/Qty\s*:?\s*(\d+)/i);

		const { pricePaid, currentPrice, priceNote } = extractPriceInfo(row);

		if (name && quantity) items.push({
			name,
			quantity: Number(quantity[1]),
			productUrl,
			imageUrl,
			pricePaid,
			currentPrice,
			notes: priceNote
		});
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
	settings.onclick = async () => {
		try { status.textContent = `Server: ${await getServer(true)}`; }
		catch (error) { status.textContent = error.message; }
	};
	button.onclick = async () => {
		button.disabled = true;
		button.textContent = '⏳ Sending…';
		try {
			const data = parseOrderItems();
			if (!data.items.length) throw new Error('No order items found. Expand the order items and try again.');
			const server = await getServer();
			status.textContent = `Sending ${data.items.reduce((sum, item) => sum + item.quantity, 0)} items…`;
			const url = await sendToServer(data, server);
			gmSetValue('checkerServer', server);
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
cacheHintedServer();
syncPanel();
setInterval(syncPanel, 1000);
})();
