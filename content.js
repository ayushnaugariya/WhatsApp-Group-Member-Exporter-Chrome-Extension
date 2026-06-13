// content.js v3 — safe to inject multiple times
(function () {
  'use strict';

  // Guard: don't double-register
  if (window.__waExporterRunning) {
    chrome.runtime.sendMessage({ type: 'SCAN_PROGRESS', current: 0, total: 0, members: [], status: 'Re-using existing scanner...' });
    // Still need to handle the START_SCAN that's coming
  }
  window.__waExporterRunning = true;

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  function send(type, data) {
    try { chrome.runtime.sendMessage({ type, ...data }); } catch(e) {}
  }

  function parseRow(row) {
    let name = '', phone = '', isAdmin = false;
    const clean = (str) => str
      .replace(/[\u200E\u200F\u202A\u202B\u202C\u202D\u202E]/g, '')
      .replace(/[\r\n\t]+/g, ' ')
      .trim();

    const titles = Array.from(row.querySelectorAll('[title]'))
      .map(e => clean(e.getAttribute('title'))).filter(Boolean);
    for (const t of titles) {
      if (/^\+?[\d][\d\s\-(). ]{7,}$/.test(t)) { if (!phone) phone = t.replace(/[^\d+]/g,''); }
      else if (t.startsWith('~ ')) name = t;
      else if (!name && t.length > 0) {
        if (/^(admin|group admin)$/i.test(t)) isAdmin = true;
        else if (!/^(you)$/i.test(t)) name = t;
      }
    }

    const lines = (row.innerText||'').split('\n').map(l=>clean(l)).filter(Boolean);
    for (const l of lines) {
      if (/^\+?[\d][\d\s\-(). ]{7,}$/.test(l)) { if (!phone) phone = l.replace(/[^\d+]/g,''); }
      else if (l.startsWith('~ ')) name = l;
      else if (l.length>1 && !/^hey there/i.test(l)) {
        if (/^(admin|group admin)$/i.test(l)) isAdmin = true;
        else if (!name && !/^(you)$/i.test(l)) name = l;
      }
    }
    
    if (name && /^\+?[\d][\d\s\-(). ]{7,}$/.test(name)) name = '';

    if (!phone) {
      const reactPhone = row.getAttribute('data-wa-phone');
      if (reactPhone) phone = reactPhone.replace(/[^\d+]/g, '');
    }

    return (name||phone) ? {name:name||'',phone:phone||'',isAdmin} : null;
  }

  function parseVisible(root) {
    document.dispatchEvent(new CustomEvent('wa-exporter-extract'));
    return Array.from((root||document).querySelectorAll('[role="listitem"]'))
      .map(r => parseRow(r)).filter(Boolean);
  }

  function mergeInto(map, batch) {
    for (const m of batch) {
      const k = m.phone || ('n:'+m.name.toLowerCase().trim());
      if (!map.has(k)) map.set(k, m);
    }
  }

  async function clickViewAll() {
    const els = Array.from(document.querySelectorAll('*')).filter(el => {
      if (!['SPAN','DIV','A','BUTTON'].includes(el.tagName)) return false;
      const t = el.textContent.trim();
      return (/view all/i.test(t) || (/[\d,.]+\s*more/i.test(t) && el.children.length === 0));
    });
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) { el.click(); await sleep(2000); return true; }
    }
    return false;
  }

  function getTotalHint() {
    for (const e of document.querySelectorAll('span,div')) {
      if (e.childElementCount > 0) continue;
      const m = e.textContent.trim().match(/([\d,.]+)\s*(member|participant)/i);
      if (m) {
        const parsed = parseInt(m[1].replace(/[,.]/g, ''), 10);
        if (!isNaN(parsed)) return parsed;
      }
    }
    return 0;
  }

  // Find the members panel — prefer the one that is scrollable
  function findMembersPanel() {
    const allPanels = Array.from(document.querySelectorAll('div')).filter(d => {
      if (d.scrollHeight <= d.clientHeight + 20) return false;
      if (d.querySelectorAll('[role="listitem"]').length < 2) return false;
      return true;
    });

    const dialogPanels = allPanels.filter(d => d.closest('[role="dialog"]'));
    if (dialogPanels.length > 0) {
      return dialogPanels[dialogPanels.length - 1];
    }

    return allPanels.length ? allPanels[allPanels.length - 1] : null;
  }

  async function scrollAndCollect(panel, totalHint) {
    const map = new Map();
    let stall = 0, lastSize = -1;
    panel.scrollTop = 0;
    await sleep(400);

    while (true) {
      mergeInto(map, parseVisible(panel));
      const size = map.size;
      send('SCAN_PROGRESS', {
        current: size, total: Math.max(totalHint, size),
        members: Array.from(map.values()),
        status: `Scanning... ${size} of ~${Math.max(totalHint,size)} members`
      });

      const atBottom = panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 30;
      if (atBottom) {
        if (size === lastSize) { stall++; if (stall >= 5) break; }
        else stall = 0;
      } else stall = 0;

      panel.scrollTop += Math.ceil(panel.clientHeight * 0.65);
      await sleep(380);
      lastSize = size;
      if (totalHint > 0 && size >= totalHint) { await sleep(600); break; }
    }
    mergeInto(map, parseVisible(panel));
    return Array.from(map.values());
  }

  async function scan() {
    try {
      send('SCAN_PROGRESS', { current:0, total:0, members:[], status:'Looking for members list...' });

      let totalHint = getTotalHint();
      await clickViewAll();
      if (!totalHint) totalHint = getTotalHint();
      await sleep(400);

      const panel = findMembersPanel();
      let members = [];

      if (panel) {
        members = await scrollAndCollect(panel, totalHint);
      } else {
        // No scrollable panel found — parse whatever is visible
        const map = new Map();
        mergeInto(map, parseVisible(null));
        members = Array.from(map.values());
      }

      if (!members.length) {
        send('SCAN_ERROR', { error: 'No members found. Open the Group Info panel first (click the group name at the top), wait for the member list to appear, then scan.' });
        return;
      }
      send('SCAN_DONE', { members });
    } catch(e) {
      send('SCAN_ERROR', { error: e.message || String(e) });
    }
  }

  // Remove old listener if any, then add fresh one
  if (window.__waExporterListener) {
    chrome.runtime.onMessage.removeListener(window.__waExporterListener);
  }
  window.__waExporterListener = (msg) => {
    if (msg.type === 'START_SCAN') scan();
  };
  chrome.runtime.onMessage.addListener(window.__waExporterListener);

})();
