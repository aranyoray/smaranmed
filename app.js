/* Smaran, diabetes follow-up cockpit
   All data below is fictional, for demonstration only. */

const API = window.location.port === '8000'
  ? ''
  : window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:8000'
    : '';

const CONVEX_URL = (document.querySelector('meta[name="convex-url"]') || {}).content || '';
let overdueDays = 90;
let convexClient = null;
let convexApi = null;

const FALLBACK_PATIENTS = [
  {
    id: 'BR-10482', name: 'Madhumita Ghosh', age: 57, phone: '•••• 1824', lang: 'bn',
    status: 'overdue', label: 'Overdue 148 days',
    last: '16 May 2025', next: '16 Aug 2025', reason: '~5 months since last visit',
    conf: 98, ids: 2,
    a1c: [{ d: 'Nov 2024', v: 7.1 }, { d: 'Feb 2025', v: 7.8 }, { d: 'May 2025', v: 8.9 }],
    signals: [
      { text: 'No clinic activity recorded for about 5 months.' },
      { text: 'Two record IDs merged into one patient view.', conf: 98, sub: 'Matched on phone number + Bengali name spelling.' },
      { text: '3 HbA1c results on file across the last year.' }
    ],
    events: [['16 May 2025', 'HbA1c · 8.9%', 'Up from 7.8% at the previous check'], ['16 May 2025', 'Billing record · OPD visit', 'Returned for medication refill'], ['12 Feb 2025', 'HbA1c · 7.8%', 'Lab result linked from AKTIV']],
    msg: { en: "Hello Madhumita, our records show it has been a while since your last visit to Barasat clinic on 16 May 2025. Your routine diabetes follow-up is now due. Reply 1 and our team will help you book a convenient time this week.", bn: "নমস্কার মধুমিতা, আমাদের রেকর্ড অনুযায়ী ১৬ মে ২০২৫-এ Barasat clinic-এ আপনার শেষ ভিজিটের পর বেশ কিছুদিন হয়ে গেছে. আপনার নিয়মিত ডায়াবেটিস ফলো-আপের সময় হয়েছে। এই সপ্তাহে সুবিধাজনক সময় বুক করতে ১ রিপ্লাই করুন।" }
  },
  {
    id: 'BR-08831', name: 'Subir Dutta', age: 64, phone: '•••• 4408', lang: 'en',
    status: 'overdue', label: 'Overdue 121 days',
    last: '12 Jun 2025', next: '12 Sep 2025', reason: 'Overdue · no recent refill',
    conf: 96, ids: 2,
    a1c: [{ d: 'Dec 2024', v: 8.1 }, { d: 'Mar 2025', v: 8.7 }, { d: 'Jun 2025', v: 9.4 }],
    signals: [{ text: 'No pharmacy refill logged since June 2025.' }, { text: 'Two record IDs merged into one patient view.', conf: 96, sub: 'Matched on phone number + name.' }, { text: 'Past the clinic’s 90-day overdue threshold.' }],
    events: [['12 Jun 2025', 'HbA1c · 9.4%', 'Above the clinic follow-up threshold'], ['12 Jun 2025', 'Lipid panel · completed', 'LDL 142 mg/dL'], ['04 Mar 2025', 'HbA1c · 8.7%', 'Lab result linked from AKTIV']],
    msg: { en: "Hello Subir, it has been about 4 months since your last visit to Barasat clinic (12 Jun 2025) and your diabetes follow-up is now overdue. Reply 1 and our team will call to arrange a convenient time.", bn: "নমস্কার সুবীর, Barasat clinic-এ আপনার শেষ ভিজিটের (১২ জুন ২০২৫) পর প্রায় ৪ মাস হয়ে গেছে এবং আপনার ডায়াবেটিস ফলো-আপ এখন বকেয়া। সুবিধাজনক সময় ঠিক করতে ১ রিপ্লাই করুন, আমরা ফোন করব।" }
  },
  {
    id: 'BR-11602', name: 'Nasima Khatun', age: 49, phone: '•••• 9072', lang: 'bn',
    status: 'slipping', label: 'Pattern slipping',
    last: '18 Jan 2026', next: '18 Apr 2026', reason: 'Returned after a long gap',
    conf: 94, ids: 2,
    a1c: [{ d: 'Jul 2023', v: 7.0 }, { d: 'Oct 2024', v: 7.2 }, { d: 'Jan 2026', v: 8.1 }],
    signals: [{ text: 'Returned in January after a 15-month gap.' }, { text: 'Two record IDs merged into one patient view.', conf: 94, sub: 'Matched on phone number + Bengali name spelling.' }, { text: 'Longest interval between visits in this record.' }],
    events: [['18 Jan 2026', 'HbA1c · 8.1%', 'Returned after a 15-month gap'], ['18 Jan 2026', 'Record linked', 'Phone and Bengali name matched'], ['10 Oct 2024', 'HbA1c · 7.2%', 'Last completed follow-up']],
    msg: { en: "Hello Nasima, you returned to Barasat clinic in January after a long gap. To keep your diabetes follow-ups on track, your next routine visit is due this month. Reply 1 if you would like us to call you.", bn: "নমস্কার নাসিমা, অনেকদিন পর জানুয়ারিতে আপনি Barasat clinic-এ ফিরে এসেছিলেন. আপনার ডায়াবেটিস ফলো-আপ নিয়মিত রাখতে এই মাসে পরবর্তী ভিজিটের সময় হয়েছে। আমরা ফোন করলে ১ রিপ্লাই করুন।" }
  },
  {
    id: 'BR-09544', name: 'Arindam Sen', age: 41, phone: '•••• 6619', lang: 'en',
    status: 'due', label: 'Due in 8 days',
    last: '03 Jul 2026', next: '11 Oct 2026', reason: 'Routine recall',
    conf: 99, ids: 1,
    a1c: [{ d: 'Dec 2025', v: 7.0 }, { d: 'Apr 2026', v: 6.9 }, { d: 'Jul 2026', v: 6.8 }],
    signals: [{ text: 'On schedule. 3 visits in the last 12 months.' }, { text: 'Single record ID. No merge needed.', conf: 99, sub: 'High-confidence identity match.' }, { text: 'Routine recall window opens in about a week.' }],
    events: [['03 Jul 2026', 'HbA1c · 6.8%', 'Stable at last follow-up'], ['03 Jul 2026', 'BP · 128/82', 'Routine review'], ['08 Apr 2026', 'HbA1c · 6.9%', 'Lab result linked from AKTIV']],
    msg: { en: "Hello Arindam, your next routine diabetes check at Barasat clinic is coming up in about a week (due 11 Oct 2026). You have kept your recent visits on schedule. Reply 1 to confirm a convenient time.", bn: "নমস্কার অরিন্দম, Barasat clinic-এ আপনার পরবর্তী নিয়মিত ডায়াবেটিস চেক আর প্রায় এক সপ্তাহ পরে (১১ অক্টোবর ২০২৬)। আপনি সাম্প্রতিক ভিজিটগুলি সময়মতো রেখেছেন. সুবিধাজনক সময় নিশ্চিত করতে ১ রিপ্লাই করুন।" }
  },
  {
    id: 'BR-07319', name: 'Bimal Roy', age: 71, phone: '•••• 2380', lang: 'en',
    status: 'overdue', label: 'Overdue 96 days',
    last: '29 Jun 2025', next: '29 Sep 2025', reason: 'Multiple missed recalls',
    conf: 97, ids: 2,
    a1c: [{ d: 'Dec 2024', v: 8.6 }, { d: 'Mar 2025', v: 9.1 }, { d: 'Jun 2025', v: 10.2 }],
    signals: [{ text: 'Three recall windows have passed with no activity.' }, { text: 'Two record IDs merged into one patient view.', conf: 97, sub: 'Matched on phone number + name.' }, { text: 'Oldest overdue entry in today’s queue.' }],
    events: [['29 Jun 2025', 'HbA1c · 10.2%', 'Highest recorded result'], ['29 Jun 2025', 'Follow-up missed', 'No billing or lab activity since'], ['15 Mar 2025', 'HbA1c · 9.1%', 'Lab result linked from AKTIV']],
    msg: { en: "Hello Bimal, our records show a few missed follow-ups since your last visit on 29 Jun 2025. The Barasat diabetes team would like to check in. Reply 1 and we will call you.", bn: "নমস্কার বিমল, ২৯ জুন ২০২৫-এ আপনার শেষ ভিজিটের পর কয়েকটি ফলো-আপ বাদ গেছে বলে আমাদের রেকর্ডে দেখা যাচ্ছে। Barasat ডায়াবেটিস টিম আপনার খোঁজ নিতে চায়. ১ রিপ্লাই করুন, আমরা ফোন করব।" }
  },
  {
    id: 'BR-12177', name: 'Rina Das', age: 52, phone: '•••• 3125', lang: 'bn',
    status: 'slipping', label: 'Pattern slipping',
    last: '07 Dec 2025', next: '07 Mar 2026', reason: '2nd recall missed',
    conf: 95, ids: 2,
    a1c: [{ d: 'Apr 2025', v: 6.9 }, { d: 'Aug 2025', v: 7.1 }, { d: 'Dec 2025', v: 7.9 }],
    signals: [{ text: 'Second recall missed in a row.' }, { text: 'Two record IDs merged into one patient view.', conf: 95, sub: 'Matched on phone number + Bengali name spelling.' }, { text: 'Time between visits is getting longer.' }],
    events: [['07 Dec 2025', 'HbA1c · 7.9%', 'Up from 7.1%'], ['07 Dec 2025', 'Follow-up completed', 'Record linked across two IDs'], ['23 Aug 2025', 'HbA1c · 7.1%', 'Lab result linked from AKTIV']],
    msg: { en: "Hello Rina, it has been a few months since your visit on 07 Dec 2025 and your next diabetes follow-up is now due. Can you come to Barasat clinic this week? Reply 1.", bn: "নমস্কার রিনা, ০৭ ডিসেম্বর ২০২৫-এ আপনার ভিজিটের পর কয়েক মাস হয়ে গেছে এবং আপনার পরবর্তী ডায়াবেটিস ফলো-আপের সময় হয়েছে। এই সপ্তাহে Barasat clinic-এ আসতে পারবেন? ১ রিপ্লাই করুন।" }
  }
];

let patients = [...FALLBACK_PATIENTS];
let apiAvailable = false;
let offlineLoaded = false;
let currentDetail = null;
let keywords = null;
let nlIds = null;
const Rules = window.SmaranRules;

async function loadKeywords() {
  try {
    const res = await fetch('cockpit-keywords.json');
    if (res.ok) keywords = await res.json();
  } catch { /* reply and search rules need this file */ }
}

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

let active = 'all';
let selected = null;
let msgLang = 'bn';
let defaultLang = 'auto';

/* ---------- API helpers ---------- */
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function parseDay(value) {
  if (!value) return null;
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    const [y, m, d] = text.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function fmtDay(d) {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/* Same scheduling-only score as the nightly sync (backend/agents/sync.py). */
function localPriority(p) {
  if (p.escalated) return 1;
  const day = parseDay(p.next);
  const now = new Date();
  const days = day ? Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - day) / 86400000) : 0;
  let score = days > 0 ? Math.min(days / 365, 0.5) : 0;
  if (p.status === 'overdue') score += 0.15;
  else if (p.status === 'slipping') score += 0.10;
  return Math.min(score, 1);
}

function present(p) {
  if (p.escalated) return { ...p, label: 'Escalated to clinician' };
  const day = parseDay(p.next);
  if (!day) return p;
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((start - day) / 86400000);
  let status = p.status;
  let label = p.label;
  if (days > overdueDays) {
    status = 'overdue';
    label = `Overdue ${days} days`;
  } else if (p.status === 'slipping') {
    status = 'slipping';
    label = days > 0 ? `Slipping, ${days} days past recall` : 'Pattern slipping';
  } else if (days > 0) {
    status = 'due';
    label = `Due ${days} days ago`;
  } else {
    status = 'due';
    label = `Due in ${Math.abs(days)} days`;
  }
  return { ...p, status, label };
}

function storageGet(key) {
  try { return localStorage.getItem(key) || ''; } catch { return ''; }
}
function storageSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* private window */ }
}
let staffKey = storageGet('smaran-staff-key');

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'X-Staff-Key': staffKey, ...opts.headers },
  });
  if (!res.ok) {
    const error = new Error(`API ${res.status}`);
    error.status = res.status;
    throw error;
  }
  return res.json();
}

async function getConvex() {
  if (!CONVEX_URL) return null;
  if (!convexClient) {
    const browser = await import('https://esm.sh/convex@1.49.0/browser');
    const server = await import('https://esm.sh/convex@1.49.0/server');
    convexClient = new browser.ConvexClient(CONVEX_URL);
    convexApi = server.anyApi;
  }
  return convexClient;
}

function mapApiPatient(p) {
  const a1c = (p.a1c || []).map(l => ({ d: l.date, v: l.value }));
  const trend = p.a1c_trend || {};
  return {
    id: p.id, name: p.name, age: p.age,
    phone: p.phone_last4 ? `•••• ${p.phone_last4}` : '••••',
    lang: p.lang, status: p.status, label: p.label,
    last: p.last_visit || '', next: p.next_recall || '',
    reason: p.recall_reason || '',
    conf: p.confidence ? Math.round(p.confidence * 100) : null,
    ids: p.linked_ids || 1,
    a1c,
    signals: (p.signals || []).map(s => ({
      text: s.text,
      conf: s.confidence ? Math.round(s.confidence * 100) : null,
      sub: s.sub_text || null,
    })),
    events: (p.events || []).map(e => [e.date, e.title, e.detail]),
    msg: p.outreach ? { en: p.outreach.en, bn: p.outreach.bn } : null,
    escalated: !!p.escalated,
    recall: (p.recall_items || []).map(r => ({ label: r.label, months: r.months, due: r.due, overdue: r.overdue_days })),
    hasPhone: !!p.phone_last4,
  };
}

async function loadPatients() {
  try {
    const data = await api('/api/patients');
    patients = data.map(mapApiPatient).map(present);
    apiAvailable = true;
  } catch (err) {
    // Already offline: keep the page's own changes instead of resetting the demo.
    if (apiAvailable || !offlineLoaded) patients = FALLBACK_PATIENTS.map(withLocalFields).map(present);
    offlineLoaded = true;
    apiAvailable = false;
    if (err && err.status === 401) toast('Enter the staff key in Settings to load clinic data.');
  }
  renderCounts();
  renderList();
}

/* Offline demo rows: fill the fields the server would send. */
function withLocalFields(p) {
  const latest = p.a1c && p.a1c.length ? p.a1c[p.a1c.length - 1].v : null;
  const months = latest !== null && latest >= 7 ? 3 : 6;
  return {
    hasPhone: true,
    recall: [{ label: 'HbA1c', months, due: p.next }],
    ...p,
  };
}

async function loadPatientDetail(id) {
  if (!apiAvailable) {
    const local = patients.find(p => p.id === id);
    return local ? present(local) : null;
  }
  try {
    const data = await api(`/api/patients/${id}`);
    return present(mapApiPatient(data));
  } catch {
    const local = patients.find(p => p.id === id);
    return local ? present(local) : null;
  }
}

/* ---------- Sparkline ---------- */
function sparkline(series, w, h, opts = {}) {
  if (!series.length) return { svg: '', dir: 'flat' };
  const pad = opts.pad ?? 3;
  const sw = opts.stroke ?? 1.6;
  const vals = series.map(p => p.v);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = (max - min) || 1;
  const innerW = w - pad * 2, innerH = h - pad * 2;
  const pts = series.map((p, i) => {
    const x = pad + (series.length === 1 ? innerW / 2 : (i / (series.length - 1)) * innerW);
    const y = pad + innerH - ((p.v - min) / span) * innerH;
    return [x, y];
  });
  const first = vals[0], latest = vals[vals.length - 1];
  const dir = latest > first ? 'up' : (latest < first ? 'down' : 'flat');
  const color = dir === 'up' ? 'var(--up)' : dir === 'down' ? 'var(--down)' : 'var(--flat)';
  const d = pts.map((pt, i) => (i ? 'L' : 'M') + pt[0].toFixed(1) + ' ' + pt[1].toFixed(1)).join(' ');
  const dots = pts.map((pt, i) =>
    `<circle cx="${pt[0].toFixed(1)}" cy="${pt[1].toFixed(1)}" r="${i === pts.length - 1 ? 2.8 : 1.7}" fill="${color}"/>`
  ).join('');
  const svg = `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">` +
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>${dots}</svg>`;
  return { svg, dir };
}

const ARROW = { up: '↑', down: '↓', flat: '→' };
const TREND_WORD = { up: 'rising', down: 'improving', flat: 'steady' };

/* ---------- Counts ---------- */
function count(status) { return patients.filter(p => p.status === status).length; }

function renderCounts() {
  $('#attention').textContent = patients.length;
  $('#overdue').textContent = count('overdue');
  $('#slipping').textContent = count('slipping');
  $('#dueSoon').textContent = count('due');
  $('#allCount').textContent = patients.length;
  $('#overdueCount').textContent = count('overdue');
  $('#slippingCount').textContent = count('slipping');
  $('#dueCount').textContent = count('due');
}

/* ---------- Queue list ---------- */
function tone(p) { return p.escalated ? 'escalated' : p.status; }

function renderList() {
  const q = nlIds ? '' : $('#search').value.toLowerCase();
  const rows = patients.filter(p =>
    (active === 'all' || p.status === active) &&
    (nlIds ? nlIds.includes(p.id) : `${p.name} ${p.phone} ${p.id}`.toLowerCase().includes(q))
  );
  if (nlIds) rows.sort((a, b) => nlIds.indexOf(a.id) - nlIds.indexOf(b.id));

  if (!rows.length) {
    $('#patientList').innerHTML = '<div class="empty" style="padding:50px 20px"><p>No patients match this view.</p></div>';
    return;
  }

  $('#patientList').innerHTML = rows.map(p => {
    const sp = sparkline(p.a1c, 74, 26);
    return `<div class="patient ${selected === p.id ? 'selected' : ''}" data-id="${esc(p.id)}">
      <span class="accent ${esc(tone(p))}"></span>
      <div class="p-main">
        <div class="patient-name">${esc(p.name)}</div>
        <div class="patient-meta">${esc(p.id)} · ${esc(p.phone)} · ${esc(p.age)} yrs</div>
        <span class="badge ${esc(tone(p))}">${esc(p.label)}</span>
      </div>
      <div class="p-trend">
        ${sp.svg}
        <span class="trend-tag ${sp.dir}">${ARROW[sp.dir]} ${TREND_WORD[sp.dir]}</span>
      </div>
    </div>`;
  }).join('');

  $$('.patient').forEach(el =>
    el.onclick = async () => {
      const detail = await loadPatientDetail(el.dataset.id);
      if (detail) renderDetail(detail);
    }
  );
}

/* ---------- Detail ---------- */
function renderDetail(p) {
  selected = p.id;
  currentDetail = p;
  renderList();

  msgLang = defaultLang === 'auto' ? p.lang : defaultLang;

  const series = p.a1c || [];
  const sp = sparkline(series, 300, 54, { pad: 6, stroke: 2 });
  const first = series[0], latest = series[series.length - 1];
  const trendCard = series.length
    ? `<div class="trend-card">
      <div class="trend-head">
        <span class="lbl">HbA1c trend</span>
        <span class="meta">${series.length} results · ${TREND_WORD[sp.dir]}</span>
      </div>
      <div class="trend-plot">${sp.svg}</div>
      <div class="trend-axis">
        <span><b>${esc(first.v)}%</b> · ${esc(first.d)}</span>
        <span><b>${esc(latest.v)}%</b> · ${esc(latest.d)}</span>
      </div>
    </div>`
    : `<div class="trend-card"><p class="trend-empty">No HbA1c on file.</p></div>`;

  const signals = (p.signals || []).map(s => `
    <div class="signal">
      <span class="dot"></span>
      <div>
        <p>${esc(s.text)}</p>
        ${s.conf ? `<div class="meter"><i style="width:${s.conf}%"></i></div><small>${s.conf}% record-match confidence</small>` : ''}
        ${s.sub ? `<small>${esc(s.sub)}</small>` : ''}
      </div>
    </div>`).join('');

  const timeline = (p.events || []).map(e =>
    `<div class="event"><time>${esc(e[0])}</time><strong>${esc(e[1])}</strong><p>${esc(e[2] || '')}</p></div>`
  ).join('');

  const msgText = p.msg ? p.msg[msgLang] || p.msg.en || '' : '';

  const recallBlock = (p.recall || []).length ? `
    <h3 class="block">Recall schedule</h3>
    <div class="recall-list">${p.recall.map(r => `
      <div class="recall-item">
        <strong>${esc(r.label)}</strong>
        <span>every ${esc(r.months)} months</span>
        <span>due ${esc(parseDay(r.due) ? fmtDay(parseDay(r.due)) : r.due)}</span>
      </div>`).join('')}
    </div>
    <p class="recall-note">Intervals per ADA and RSSDI guidance, configurable by the clinician. For scheduling only; not a clinical assessment.</p>` : '';

  $('#detail').innerHTML = `
    <div class="detail-top">
      <div>
        <h2>${esc(p.name)}</h2>
        <div class="detail-id">${esc(p.id)} · ${esc(p.age)} years · ${esc(p.phone)}</div>
      </div>
      <span class="status-pill ${esc(tone(p))}">${esc(p.label)}</span>
    </div>

    ${trendCard}

    <div class="detail-grid">
      <div><span>Last visit</span><b>${esc(p.last)}</b></div>
      <div><span>Next recall</span><b>${esc(p.next)}</b></div>
      <div><span>Follow-up reason</span><b>${esc(p.reason)}</b></div>
    </div>

    ${recallBlock}

    <h3 class="block">Observations</h3>
    <div class="signals">${signals}</div>

    <h3 class="block">Linked records</h3>
    <p class="recall-note">${esc(p.ids)} source record${p.ids === 1 ? '' : 's'}${p.conf ? ` · lowest match confidence ${esc(p.conf)}%` : ''}</p>
    <div class="timeline">${timeline}</div>

    <div class="callout">
      <div class="callout-head">
        <div class="lead">
          <h3>Outreach draft</h3>
          <span class="ai-chip">Draft</span>
        </div>
        <span class="review-note">Requires staff approval</span>
      </div>

      <div class="lang-toggle">
        <button data-lang="bn" class="${msgLang === 'bn' ? 'on' : ''}">বাংলা</button>
        <button data-lang="en" class="${msgLang === 'en' ? 'on' : ''}">English</button>
      </div>

      <div class="message" id="draft">${esc(msgText)}</div>

      <div class="msg-foot">
        <button class="regen" id="regen">
          <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M12 5V2L7 7l5 5V8a4 4 0 1 1-4 4H6a6 6 0 1 0 6-7Z"/></svg>
          Regenerate
        </button>
        <span class="info-only">Administrative reminder only. Contains no clinical advice.</span>
      </div>

      <div class="actions">
        <button class="send" id="sendBtn">Approve and send</button>
        <button class="secondary" id="doneBtn">Mark as contacted</button>
      </div>
    </div>

    <div class="reply-box">
      <h3 class="block">Log patient reply</h3>
      <textarea id="replyText" rows="2" placeholder="Paste the reply (English or বাংলা)"></textarea>
      <div class="reply-foot">
        <button class="secondary" id="replyBtn">Classify reply</button>
        <span class="info-only">Replies mentioning symptoms or medication are escalated to the clinician.</span>
      </div>
      <p class="reply-result" id="replyResult" role="status"></p>
    </div>`;

  $$('.lang-toggle button').forEach(b => b.onclick = () => {
    msgLang = b.dataset.lang;
    if (p.msg) $('#draft').textContent = p.msg[msgLang] || '';
    $$('.lang-toggle button').forEach(x => x.classList.toggle('on', x.dataset.lang === msgLang));
  });

  $('#regen').onclick = () => regenerateDraft(p);
  $('#sendBtn').onclick = () => sendDraft(p);
  $('#replyBtn').onclick = () => logReply(p);
  $('#doneBtn').onclick = () => markContacted(p);
}

function showDraftError(text) {
  const el = $('#draft');
  if (!el) return;
  el.textContent = text;
  el.classList.add('error');
  el.classList.remove('loading');
}

async function regenerateDraft(p) {
  const el = $('#draft');
  el.classList.add('loading');
  el.classList.remove('error');
  el.textContent = 'Generating draft…';
  if (p.unsub) {
    p.unsub();
    p.unsub = null;
  }
  try {
    if (CONVEX_URL) {
      const client = await getConvex();
      const result = await client.action(convexApi.draft.generate, { patientId: p.id, staffKey });
      if (!result || result.error) throw new Error(result && result.error ? result.error : 'Draft failed');
      p.threadId = result.threadId;
      p.msg = { en: result.en, bn: result.bn };
      if (p.unsub) p.unsub();
      try {
        p.unsub = client.onUpdate(convexApi.drafts.latest, { patientId: p.id, staffKey }, row => {
          if (!row || selected !== p.id) return;
          p.msg = { en: row.en, bn: row.bn };
          const box = $('#draft');
          if (box) box.textContent = p.msg[msgLang] || '';
        });
      } catch { /* the action result is already on screen */ }
    } else if (apiAvailable) {
      const draft = await api(`/api/outreach/${p.id}`, { method: 'POST' });
      p.msg = { en: draft.en, bn: draft.bn };
    } else {
      throw new Error('offline');
    }
    el.textContent = p.msg[msgLang] || '';
    el.classList.remove('error');
    toast('Draft generated. Awaiting staff approval.');
  } catch (err) {
    showDraftError(err && err.message === 'offline'
      ? 'Draft generation requires the clinic server.'
      : 'Draft generation failed. Please retry.');
    toast('Draft generation failed.');
  }
  el.classList.remove('loading');
}

async function sendDraft(p) {
  const text = p.msg ? p.msg[msgLang] || p.msg.en || '' : '';
  if (!text) {
    toast('No draft available. Select Regenerate.');
    return;
  }
  // Open the tab now, inside the click, so pop-up blockers allow it.
  const win = window.open('', '_blank');
  if (win) win.opener = null;
  try {
    let link = `https://wa.me/?text=${encodeURIComponent(text)}`;
    let note = 'Demonstration data has no phone numbers. Choose a recipient in WhatsApp.';
    if (p.threadId && CONVEX_URL) {
      const client = await getConvex();
      const result = await client.mutation(convexApi.drafts.approve, { patientId: p.id, staffKey });
      if (!result || result.error) throw Object.assign(new Error('none'), { status: 409 });
    } else if (apiAvailable) {
      const result = await api(`/api/outreach/${p.id}/send?lang=${msgLang}`, { method: 'POST' });
      link = result.link;
      note = `Approved. Message opened in ${result.channel === 'sms' ? 'SMS' : 'WhatsApp'} for sending.`;
    }
    if (win) win.location.href = link;
    else window.location.href = link;
    toast(note);
  } catch (err) {
    if (win) win.close();
    toast(err && err.status === 409 ? 'No draft or phone number on record.' : 'Unable to open WhatsApp. Please retry.');
  }
}

async function logReply(p) {
  const box = $('#replyText');
  const text = box.value.trim();
  if (!text) return;
  let plan;
  try {
    if (apiAvailable) {
      plan = await api(`/api/patients/${p.id}/reply`, { method: 'POST', body: JSON.stringify({ text }) });
    } else {
      if (!keywords) await loadKeywords();
      if (!keywords) throw new Error('rules');
      plan = Rules.classifyReply(text, keywords);
    }
  } catch {
    toast('Unable to classify the reply. Please retry.');
    return;
  }

  // An escalated patient stays on the list until the doctor has seen it.
  if (p.escalated) plan = { ...plan, leaves_queue: false };
  const why = plan.matched ? ` · flagged term: "${plan.matched}"` : '';
  $('#replyResult').textContent = `${plan.label}${why}.`;

  if (plan.leaves_queue) {
    if (apiAvailable) await loadPatients();
    else patients = patients.filter(pt => pt.id !== p.id);
    clearDetail();
    toast(`${p.name}: ${plan.label}. Removed from the queue.`);
    return;
  }
  const updated = { ...p, outcome: plan.intent, escalated: p.escalated || plan.escalate };
  if (!updated.escalated) updated.label = plan.label;
  patients = patients.map(pt => (pt.id === p.id ? present({ ...pt, outcome: updated.outcome, escalated: updated.escalated }) : pt));
  renderCounts();
  renderList();
  renderDetail(present(updated));
  $('#replyResult').textContent = `${plan.label}${why}.`;
  toast(plan.escalate ? `${p.name} escalated to the clinician.` : `${p.name}: ${plan.label}.`);
}

/* ---------- Plain-language search ---------- */
async function runNlSearch(q) {
  const note = $('#searchNote');
  let applied = [];
  try {
    if (apiAvailable) {
      const result = await api('/api/search', { method: 'POST', body: JSON.stringify({ q }) });
      nlIds = result.ids;
      applied = result.applied;
    } else {
      if (!keywords) await loadKeywords();
      if (!keywords) throw new Error('rules');
      const filters = Rules.parseQuery(q, keywords);
      applied = Rules.describe(filters);
      const today = new Date();
      nlIds = patients
        .filter(p => Rules.matches({
          status: p.status, priority_score: localPriority(p), hasPhone: p.hasPhone !== false,
          outcome: p.outcome, escalated: p.escalated, lang: p.lang, age: p.age, recall: parseDay(p.next),
        }, filters, today))
        .sort((a, b) => localPriority(b) - localPriority(a))
        .map(p => p.id);
    }
  } catch {
    nlIds = null;
    note.textContent = 'Query failed. Showing name matches.';
    renderList();
    return;
  }
  if (!applied.length) {
    nlIds = null;
    note.textContent = 'No filters recognised. Showing name matches. Example: overdue, Bengali, over 60.';
  } else {
    note.textContent = `${nlIds.length} ${nlIds.length === 1 ? 'patient' : 'patients'} · ${applied.join(' · ')}`;
  }
  renderList();
}

function clearDetail() {
  selected = null;
  currentDetail = null;
  renderCounts();
  renderList();
  $('#detail').innerHTML = '<div class="empty"><span class="empty-mark" aria-hidden="true">→</span><h2>No patient selected</h2><p>Select a patient to view their record, recall schedule and outreach draft.</p></div>';
}

async function markContacted(p) {
  if (apiAvailable) {
    try {
      await api(`/api/patients/${p.id}/contact`, { method: 'POST' });
      await loadPatients();
      clearDetail();
      toast('Marked as contacted.');
      return;
    } catch {
      toast('Unable to update status. Please retry.');
      return;
    }
  }
  patients = patients.filter(pt => pt.id !== p.id);
  clearDetail();
  toast('Marked as contacted for this session only.');
}

/* ---------- Toast ---------- */
let toastTimer;
function toast(t) {
  const el = $('#toast');
  el.textContent = t;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

/* ---------- Settings drawer ---------- */
function selectOption(select, value) {
  const wanted = String(value).toLowerCase();
  const match = [...select.options].find(option => {
    const text = option.value || option.textContent;
    return text.toLowerCase() === wanted || String(parseInt(text, 10)) === wanted;
  });
  if (match) select.value = match.value || match.textContent;
}

async function openDrawer() {
  $('#drawer').classList.add('show');
  $('#drawer').setAttribute('aria-hidden', 'false');
  $('#drawerBackdrop').classList.add('show');
  $('#setStaffKey').value = staffKey;
  if (!apiAvailable) return;
  try {
    const settings = await api('/api/settings');
    overdueDays = settings.overdue_days || 90;
    selectOption($('#setSync'), settings.sync_schedule);
    selectOption($('#setLang'), settings.default_lang);
    selectOption($('#setThreshold'), settings.overdue_days);
    selectOption($('#setChannel'), settings.outreach_channel);
    defaultLang = $('#setLang').value;
    patients = patients.map(present);
    renderCounts();
    renderList();
  } catch { /* keep the values already on the form */ }
}
function closeDrawer() {
  $('#drawer').classList.remove('show');
  $('#drawer').setAttribute('aria-hidden', 'true');
  $('#drawerBackdrop').classList.remove('show');
}

$('#settingsBtn').onclick = openDrawer;
$('#drawerClose').onclick = closeDrawer;
$('#drawerCancel').onclick = closeDrawer;
$('#drawerBackdrop').onclick = closeDrawer;
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });

$('#drawerSave').onclick = async () => {
  const newKey = $('#setStaffKey').value.trim();
  if (newKey !== staffKey) {
    staffKey = newKey;
    storageSet('smaran-staff-key', staffKey);
    await loadPatients();
  }
  defaultLang = $('#setLang').value;
  overdueDays = parseInt($('#setThreshold').value, 10) || 90;
  const syncVal = $('#setSync').value;
  let savedOnServer = false;
  if (apiAvailable) {
    try {
      await api('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({
          sync_schedule: syncVal,
          default_lang: defaultLang,
          overdue_days: overdueDays,
          outreach_channel: $('#setChannel').value.toLowerCase(),
        }),
      });
      savedOnServer = true;
    } catch { savedOnServer = false; }
  }
  patients = patients.map(present);
  renderCounts();
  renderList();
  closeDrawer();
  toast(savedOnServer ? 'Settings saved.' : 'Settings applied for this session only.');
  if (selected && currentDetail) renderDetail(present(currentDetail));
};

/* ---------- Filters / search / sync ---------- */
$$('.chip').forEach(c => c.onclick = () => {
  $$('.chip').forEach(x => x.classList.remove('active'));
  c.classList.add('active');
  active = c.dataset.filter;
  renderList();
});
$('#search').oninput = () => {
  if (nlIds) {
    nlIds = null;
    $('#searchNote').textContent = '';
  }
  renderList();
};
$('#search').onkeydown = e => {
  if (e.key === 'Enter' && e.target.value.trim()) runNlSearch(e.target.value.trim());
};

$('#runSync').onclick = async () => {
  if (!apiAvailable) {
    toast('Sync requires the clinic server.');
    return;
  }

  const btn = $('#runSync');
  btn.disabled = true;
  btn.classList.add('syncing');
  const strip = $('#aiSummary');
  strip.textContent = 'Connecting to AKTIV…';
  let linkingTimer = setTimeout(() => { strip.textContent = 'Linking records…'; }, 1000);

  try {
    const result = await api('/api/sync', { method: 'POST' });
    clearTimeout(linkingTimer);
    linkingTimer = null;
    strip.textContent = `Sync complete: ${result.records_linked} records linked, ${result.signals_generated} observations added.`;
    $('#syncTime').textContent = 'Last run ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    await loadPatients();
    toast('Sync complete.');
  } catch {
    clearTimeout(linkingTimer);
    strip.textContent = 'Sync failed. The queue is unchanged.';
    toast('Sync failed. Please retry.');
  }

  btn.disabled = false;
  btn.classList.remove('syncing');
};

/* ---------- Dynamic date ---------- */
document.querySelector('.clinic b').textContent = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

/* ---------- Init ---------- */
loadKeywords();
loadPatients();
