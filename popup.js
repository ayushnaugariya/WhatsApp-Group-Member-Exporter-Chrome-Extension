// popup.js v3 — injects content script directly, no messaging dependency

let collectedMembers = [];

const statusText    = document.getElementById('statusText');
const progressWrap  = document.getElementById('progressWrap');
const progressFill  = document.getElementById('progressFill');
const progressText  = document.getElementById('progressText');
const totalCount    = document.getElementById('totalCount');
const withNumCount  = document.getElementById('withNumCount');
const nameOnlyCount = document.getElementById('nameOnlyCount');
const btnScan       = document.getElementById('btnScan');
const btnExport     = document.getElementById('btnExport');
const btnExportVCF  = document.getElementById('btnExportVCF');
const logBox        = document.getElementById('logBox');
const tipText       = document.getElementById('tipText');

function log(msg) {
  logBox.style.display = 'block';
  const line = document.createElement('div');
  line.className = 'log-line';
  line.textContent = msg;
  logBox.prepend(line);
}

function setStatus(msg, type = '') {
  statusText.textContent = msg;
  statusText.className = 'status-value ' + type;
}

function updateCounters(members) {
  totalCount.textContent    = members.length;
  withNumCount.textContent  = members.filter(m => m.phone).length;
  nameOnlyCount.textContent = members.filter(m => !m.phone).length;
}

function setProgress(current, total) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  progressFill.style.width = pct + '%';
  progressText.textContent = `${current} / ${total}`;
}

// Listen for messages from the injected script via window (same-origin not possible cross-context)
// We use chrome.runtime for content->popup messaging
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'SCAN_PROGRESS') {
    if (msg.status) setStatus(msg.status, 'warn');
    setProgress(msg.current, msg.total);
    updateCounters(msg.members || []);
  }
  if (msg.type === 'SCAN_DONE') {
    collectedMembers = msg.members;
    updateCounters(msg.members);
    setProgress(msg.members.length, msg.members.length);
    setStatus(`✅ Found ${msg.members.length} members!`, 'ok');
    log(`✅ Done — ${msg.members.length} members`);
    btnScan.disabled = false;
    btnScan.textContent = '🔄 Re-Scan';
    btnExport.style.display = 'block';
    btnExportVCF.style.display = 'block';
    tipText.textContent = 'Click Export to download the CSV file.';
  }
  if (msg.type === 'SCAN_ERROR') {
    setStatus('❌ ' + msg.error, 'error');
    log('❌ ' + msg.error);
    btnScan.disabled = false;
    btnScan.textContent = '🔍 Scan Group Members';
  }
});

btnScan.addEventListener('click', async () => {
  collectedMembers = [];
  btnExport.style.display = 'none';
  btnExportVCF.style.display = 'none';
  progressWrap.style.display = 'block';
  setProgress(0, 0);
  updateCounters([]);
  setStatus('Injecting scanner...', 'warn');
  btnScan.disabled = true;
  btnScan.textContent = '⏳ Scanning...';
  log('Starting scan...');

  let tab;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch(e) {
    setStatus('❌ Cannot access tab', 'error');
    btnScan.disabled = false;
    return;
  }

  if (!tab || !tab.url || !tab.url.includes('web.whatsapp.com')) {
    setStatus('❌ Please open WhatsApp Web first', 'error');
    log('Not on web.whatsapp.com');
    btnScan.disabled = false;
    btnScan.textContent = '🔍 Scan Group Members';
    return;
  }

  // Inject the scanner script directly into the page — this always works
  // even if the tab was open before the extension was installed
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: () => {
        if (window.__waBridgeInitialized) return;
        window.__waBridgeInitialized = true;
        
        function searchObjForId(obj, visited = new Set(), depth = 0) {
          if (!obj || typeof obj !== 'object' || depth > 3) return null;
          if (visited.has(obj)) return null;
          visited.add(obj);

          if (obj.user && typeof obj.user === 'string' && /^\d{7,15}$/.test(obj.user) && (obj.server === 'c.us' || obj.server === 's.whatsapp.net')) {
            return '+' + obj.user;
          }
          if (typeof obj.id === 'string') {
              const m = obj.id.match(/^(\d{7,15})(:\d+)?@(c\.us|s\.whatsapp\.net)$/);
              if (m) return '+' + m[1];
          }
          
          for (const key of Object.keys(obj)) {
            if (['children', '_owner', 'style', 'className', 'css', 'participants', 'groupMetadata'].includes(key)) continue;
            const val = obj[key];
            if (typeof val === 'string') {
              const m = val.match(/^(\d{7,15})(:\d+)?@(c\.us|s\.whatsapp\.net)$/);
              if (m) return '+' + m[1];
            } else if (typeof val === 'object') {
              const f = searchObjForId(val, visited, depth + 1);
              if (f) return f;
            }
          }
          return null;
        }

        document.addEventListener('wa-exporter-extract', (e) => {
          const listItems = document.querySelectorAll('[role="listitem"]');
          for (const rootEl of listItems) {
            if (rootEl.hasAttribute('data-wa-phone')) continue;
            const els = [rootEl, ...Array.from(rootEl.querySelectorAll('*'))];
            for (const el of els) {
              const keys = Object.keys(el);
              const reactKey = keys.find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
              if (!reactKey) continue;
              
              let fiber = el[reactKey];
              for (let i = 0; i < 5 && fiber; i++) {
                const props = fiber.memoizedProps;
                if (props) {
                    let phone = null;
                    if (props.contact && props.contact.id && props.contact.id.user) {
                         phone = '+' + props.contact.id.user;
                    } else if (props.data && props.data.id && props.data.id.user) {
                         phone = '+' + props.data.id.user;
                    } else {
                         phone = searchObjForId(props);
                    }
                    if (phone) {
                         rootEl.setAttribute('data-wa-phone', phone);
                         break;
                    }
                }
                fiber = fiber.return;
              }
              if (rootEl.hasAttribute('data-wa-phone')) break;
            }
          }
        });
      }
    });

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });
    log('Scanner injected ✓');
    setStatus('Scanner running...', 'warn');

    // Give it a moment to register, then send start message
    await new Promise(r => setTimeout(r, 300));
    await chrome.tabs.sendMessage(tab.id, { type: 'START_SCAN' });

  } catch(e) {
    setStatus('❌ Injection failed: ' + e.message, 'error');
    log('Error: ' + e.message);
    btnScan.disabled = false;
    btnScan.textContent = '🔍 Scan Group Members';
  }
});

btnExport.addEventListener('click', () => {
  if (!collectedMembers.length) return;
  exportCSV(collectedMembers);
});

btnExportVCF.addEventListener('click', () => {
  if (!collectedMembers.length) return;
  exportVCF(collectedMembers);
});

function splitPhone(phoneStr) {
  if (!phoneStr || !phoneStr.startsWith('+')) return { cc: '', no: phoneStr };
  const cc2 = ['+20','+27','+30','+31','+32','+33','+34','+36','+39','+40','+41','+43','+44','+45','+46','+47','+48','+49','+51','+52','+53','+54','+55','+56','+57','+58','+60','+61','+62','+63','+64','+65','+66','+81','+82','+84','+86','+90','+91','+92','+93','+94','+95','+98'];
  if (phoneStr.startsWith('+1') || phoneStr.startsWith('+7')) {
    return { cc: phoneStr.substring(0, 2), no: phoneStr.substring(2) };
  }
  const prefix3 = phoneStr.substring(0, 3);
  if (cc2.includes(prefix3)) {
    return { cc: prefix3, no: phoneStr.substring(3) };
  }
  return { cc: phoneStr.substring(0, 4), no: phoneStr.substring(4) };
}

function escapeVCardText(value) {
  return String(value || '')
    .replace(/[\\;,]/g, '\\$&')
    .replace(/\r?\n/g, '\\n');
}

function sanitizeVCardPhone(value) {
  return String(value || '').replace(/[^\d+().\-\s]/g, '');
}

function exportCSV(members) {
  const rows = [['#', 'Name', 'Phone Number', 'Country Code', 'Local Number', 'Is Admin']];
  members.forEach((m, i) => {
    let safeName = m.name || '';
    if (/^[=+\-@]/.test(safeName)) safeName = '\t' + safeName;
    
    const phoneStr = m.phone ? '\t' + m.phone : '';
    const { cc, no } = splitPhone(m.phone || '');
    const safeCC = cc ? '\t' + cc : '';
    const safeNo = no ? '\t' + no : '';

    rows.push([i + 1, safeName, phoneStr, safeCC, safeNo, m.isAdmin ? 'Yes' : 'No']);
  });
  const csv = rows.map(r =>
    r.map(cell => {
      const s = String(cell).replace(/"/g, '""');
      return /[,"\n\r]/.test(s) ? `"${s}"` : s;
    }).join(',')
  ).join('\r\n');

  const bom  = '\uFEFF';
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `whatsapp_members_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  log(`📥 Exported ${members.length} members`);
  setStatus(`✅ Exported ${members.length} members`, 'ok');
}

function exportVCF(members) {
  let vcf = '';
  members.forEach(m => {
    const name = escapeVCardText(m.name || m.phone || 'Unknown');
    const phone = sanitizeVCardPhone(m.phone || '');
    
    vcf += 'BEGIN:VCARD\r\n';
    vcf += 'VERSION:3.0\r\n';
    vcf += `FN:${name}\r\n`;
    vcf += `TEL;TYPE=CELL:${phone}\r\n`;
    if (m.isAdmin) vcf += `NOTE:Group Admin\r\n`;
    vcf += 'END:VCARD\r\n';
  });

  const blob = new Blob([vcf], { type: 'text/vcard;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `whatsapp_members_${new Date().toISOString().slice(0,10)}.vcf`;
  a.click();
  URL.revokeObjectURL(url);
  log(`📥 Exported ${members.length} contacts to VCF`);
  setStatus(`✅ Exported ${members.length} contacts to VCF`, 'ok');
}
