/* Smaran — diabetes follow-up cockpit (demo)
   All data below is fictional, for demonstration only. */

const patients = [
  {
    id: 'BR-10482', name: 'Madhumita Ghosh', age: 57, phone: '•••• 1824', lang: 'bn',
    status: 'overdue', label: 'Overdue 148 days',
    last: '16 May 2025', next: '16 Aug 2025', reason: '~5 months since last visit',
    conf: 98, ids: 2,
    a1c: [
      { d: 'Nov 2024', v: 7.1 },
      { d: 'Feb 2025', v: 7.8 },
      { d: 'May 2025', v: 8.9 }
    ],
    signals: [
      { text: 'No clinic activity recorded for about 5 months.' },
      { text: 'Two record IDs merged into one patient view.', conf: 98, sub: 'Matched on phone number + Bengali name spelling.' },
      { text: '3 HbA1c results on file across the last year.' }
    ],
    events: [
      ['16 May 2025', 'HbA1c · 8.9%', 'Up from 7.8% at the previous check'],
      ['16 May 2025', 'Billing record · OPD visit', 'Returned for medication refill'],
      ['12 Feb 2025', 'HbA1c · 7.8%', 'Lab result linked from AKTIV']
    ],
    msg: {
      en: "Hello Madhumita, our records show it has been a while since your last visit to Barasat clinic on 16 May 2025 — your routine diabetes follow-up is now due. Reply 1 and our team will help you book a convenient time this week.",
      bn: "নমস্কার মধুমিতা, আমাদের রেকর্ড অনুযায়ী ১৬ মে ২০২৫-এ Barasat clinic-এ আপনার শেষ ভিজিটের পর বেশ কিছুদিন হয়ে গেছে — আপনার নিয়মিত ডায়াবেটিস ফলো-আপের সময় হয়েছে। এই সপ্তাহে সুবিধাজনক সময় বুক করতে ১ রিপ্লাই করুন।"
    }
  },
  {
    id: 'BR-08831', name: 'Subir Dutta', age: 64, phone: '•••• 4408', lang: 'en',
    status: 'overdue', label: 'Overdue 121 days',
    last: '12 Jun 2025', next: '12 Sep 2025', reason: 'Overdue · no recent refill',
    conf: 96, ids: 2,
    a1c: [
      { d: 'Dec 2024', v: 8.1 },
      { d: 'Mar 2025', v: 8.7 },
      { d: 'Jun 2025', v: 9.4 }
    ],
    signals: [
      { text: 'No pharmacy refill logged since June 2025.' },
      { text: 'Two record IDs merged into one patient view.', conf: 96, sub: 'Matched on phone number + name.' },
      { text: 'Past the clinic’s 90-day overdue threshold.' }
    ],
    events: [
      ['12 Jun 2025', 'HbA1c · 9.4%', 'Above the clinic follow-up threshold'],
      ['12 Jun 2025', 'Lipid panel · completed', 'LDL 142 mg/dL'],
      ['04 Mar 2025', 'HbA1c · 8.7%', 'Lab result linked from AKTIV']
    ],
    msg: {
      en: "Hello Subir, it has been about 4 months since your last visit to Barasat clinic (12 Jun 2025) and your diabetes follow-up is now overdue. Reply 1 and our team will call to arrange a convenient time.",
      bn: "নমস্কার সুবীর, Barasat clinic-এ আপনার শেষ ভিজিটের (১২ জুন ২০২৫) পর প্রায় ৪ মাস হয়ে গেছে এবং আপনার ডায়াবেটিস ফলো-আপ এখন বকেয়া। সুবিধাজনক সময় ঠিক করতে ১ রিপ্লাই করুন, আমরা ফোন করব।"
    }
  },
  {
    id: 'BR-11602', name: 'Nasima Khatun', age: 49, phone: '•••• 9072', lang: 'bn',
    status: 'slipping', label: 'Pattern slipping',
    last: '18 Jan 2026', next: '18 Apr 2026', reason: 'Returned after a long gap',
    conf: 94, ids: 2,
    a1c: [
      { d: 'Jul 2023', v: 7.0 },
      { d: 'Oct 2024', v: 7.2 },
      { d: 'Jan 2026', v: 8.1 }
    ],
    signals: [
      { text: 'Returned in January after a 15-month gap.' },
      { text: 'Two record IDs merged into one patient view.', conf: 94, sub: 'Matched on phone number + Bengali name spelling.' },
      { text: 'Longest interval between visits in this record.' }
    ],
    events: [
      ['18 Jan 2026', 'HbA1c · 8.1%', 'Returned after a 15-month gap'],
      ['18 Jan 2026', 'Record linked', 'Phone and Bengali name matched'],
      ['10 Oct 2024', 'HbA1c · 7.2%', 'Last completed follow-up']
    ],
    msg: {
      en: "Hello Nasima, you returned to Barasat clinic in January after a long gap — to keep your diabetes follow-ups on track, your next routine visit is due this month. Reply 1 if you would like us to call you.",
      bn: "নমস্কার নাসিমা, অনেকদিন পর জানুয়ারিতে আপনি Barasat clinic-এ ফিরে এসেছিলেন — আপনার ডায়াবেটিস ফলো-আপ নিয়মিত রাখতে এই মাসে পরবর্তী ভিজিটের সময় হয়েছে। আমরা ফোন করলে ১ রিপ্লাই করুন।"
    }
  },
  {
    id: 'BR-09544', name: 'Arindam Sen', age: 41, phone: '•••• 6619', lang: 'en',
    status: 'due', label: 'Due in 8 days',
    last: '03 Jul 2026', next: '11 Oct 2026', reason: 'Routine recall',
    conf: 99, ids: 1,
    a1c: [
      { d: 'Dec 2025', v: 7.0 },
      { d: 'Apr 2026', v: 6.9 },
      { d: 'Jul 2026', v: 6.8 }
    ],
    signals: [
      { text: 'On schedule — 3 visits in the last 12 months.' },
      { text: 'Single record ID — no merge needed.', conf: 99, sub: 'High-confidence identity match.' },
      { text: 'Routine recall window opens in about a week.' }
    ],
    events: [
      ['03 Jul 2026', 'HbA1c · 6.8%', 'Stable at last follow-up'],
      ['03 Jul 2026', 'BP · 128/82', 'Routine review'],
      ['08 Apr 2026', 'HbA1c · 6.9%', 'Lab result linked from AKTIV']
    ],
    msg: {
      en: "Hello Arindam, your next routine diabetes check at Barasat clinic is coming up in about a week (due 11 Oct 2026). You have kept your recent visits on schedule — reply 1 to confirm a convenient time.",
      bn: "নমস্কার অরিন্দম, Barasat clinic-এ আপনার পরবর্তী নিয়মিত ডায়াবেটিস চেক আর প্রায় এক সপ্তাহ পরে (১১ অক্টোবর ২০২৬)। আপনি সাম্প্রতিক ভিজিটগুলি সময়মতো রেখেছেন — সুবিধাজনক সময় নিশ্চিত করতে ১ রিপ্লাই করুন।"
    }
  },
  {
    id: 'BR-07319', name: 'Bimal Roy', age: 71, phone: '•••• 2380', lang: 'en',
    status: 'overdue', label: 'Overdue 96 days',
    last: '29 Jun 2025', next: '29 Sep 2025', reason: 'Multiple missed recalls',
    conf: 97, ids: 2,
    a1c: [
      { d: 'Dec 2024', v: 8.6 },
      { d: 'Mar 2025', v: 9.1 },
      { d: 'Jun 2025', v: 10.2 }
    ],
    signals: [
      { text: 'Three recall windows have passed with no activity.' },
      { text: 'Two record IDs merged into one patient view.', conf: 97, sub: 'Matched on phone number + name.' },
      { text: 'Oldest overdue entry in today’s queue.' }
    ],
    events: [
      ['29 Jun 2025', 'HbA1c · 10.2%', 'Highest recorded result'],
      ['29 Jun 2025', 'Follow-up missed', 'No billing or lab activity since'],
      ['15 Mar 2025', 'HbA1c · 9.1%', 'Lab result linked from AKTIV']
    ],
    msg: {
      en: "Hello Bimal, our records show a few missed follow-ups since your last visit on 29 Jun 2025. The Barasat diabetes team would like to check in — reply 1 and we will call you.",
      bn: "নমস্কার বিমল, ২৯ জুন ২০২৫-এ আপনার শেষ ভিজিটের পর কয়েকটি ফলো-আপ বাদ গেছে বলে আমাদের রেকর্ডে দেখা যাচ্ছে। Barasat ডায়াবেটিস টিম আপনার খোঁজ নিতে চায় — ১ রিপ্লাই করুন, আমরা ফোন করব।"
    }
  },
  {
    id: 'BR-12177', name: 'Rina Das', age: 52, phone: '•••• 3125', lang: 'bn',
    status: 'slipping', label: 'Pattern slipping',
    last: '07 Dec 2025', next: '07 Mar 2026', reason: '2nd recall missed',
    conf: 95, ids: 2,
    a1c: [
      { d: 'Apr 2025', v: 6.9 },
      { d: 'Aug 2025', v: 7.1 },
      { d: 'Dec 2025', v: 7.9 }
    ],
    signals: [
      { text: 'Second recall missed in a row.' },
      { text: 'Two record IDs merged into one patient view.', conf: 95, sub: 'Matched on phone number + Bengali name spelling.' },
      { text: 'Time between visits is getting longer.' }
    ],
    events: [
      ['07 Dec 2025', 'HbA1c · 7.9%', 'Up from 7.1%'],
      ['07 Dec 2025', 'Follow-up completed', 'Record linked across two IDs'],
      ['23 Aug 2025', 'HbA1c · 7.1%', 'Lab result linked from AKTIV']
    ],
    msg: {
      en: "Hello Rina, it has been a few months since your visit on 07 Dec 2025 and your next diabetes follow-up is now due. Can you come to Barasat clinic this week? Reply 1.",
      bn: "নমস্কার রিনা, ০৭ ডিসেম্বর ২০২৫-এ আপনার ভিজিটের পর কয়েক মাস হয়ে গেছে এবং আপনার পরবর্তী ডায়াবেটিস ফলো-আপের সময় হয়েছে। এই সপ্তাহে Barasat clinic-এ আসতে পারবেন? ১ রিপ্লাই করুন।"
    }
  }
];

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

let active = 'all';
let selected = null;
let msgLang = 'bn';           // language currently shown in the outreach draft
let defaultLang = 'auto';     // from settings drawer

/* ---------- Sparkline ---------- */
function sparkline(series, w, h, opts = {}) {
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
  $('#allCount').textContent = patients.length;
  $('#overdueCount').textContent = count('overdue');
  $('#slippingCount').textContent = count('slipping');
  $('#dueCount').textContent = count('due');
}

/* ---------- Queue list ---------- */
function renderList() {
  const q = $('#search').value.toLowerCase();
  const rows = patients.filter(p =>
    (active === 'all' || p.status === active) &&
    `${p.name} ${p.phone} ${p.id}`.toLowerCase().includes(q)
  );

  if (!rows.length) {
    $('#patientList').innerHTML = '<div class="empty" style="padding:50px 20px"><p>No one matches this view.</p></div>';
    return;
  }

  $('#patientList').innerHTML = rows.map(p => {
    const sp = sparkline(p.a1c, 74, 26);
    return `<div class="patient ${selected === p.id ? 'selected' : ''}" data-id="${p.id}">
      <span class="accent ${p.status}"></span>
      <div class="p-main">
        <div class="patient-name">${p.name}</div>
        <div class="patient-meta">${p.id} · ${p.phone} · ${p.age} yrs</div>
        <span class="badge ${p.status}">${p.label}</span>
      </div>
      <div class="p-trend">
        ${sp.svg}
        <span class="trend-tag ${sp.dir}">${ARROW[sp.dir]} ${TREND_WORD[sp.dir]}</span>
      </div>
    </div>`;
  }).join('');

  $$('.patient').forEach(el =>
    el.onclick = () => renderDetail(patients.find(p => p.id === el.dataset.id))
  );
}

/* ---------- Detail ---------- */
function renderDetail(p) {
  selected = p.id;
  renderList();

  msgLang = defaultLang === 'auto' ? p.lang : defaultLang;

  const sp = sparkline(p.a1c, 300, 54, { pad: 6, stroke: 2 });
  const first = p.a1c[0], latest = p.a1c[p.a1c.length - 1];

  const signals = p.signals.map(s => `
    <div class="signal">
      <span class="dot"></span>
      <div>
        <p>${s.text}</p>
        ${s.conf ? `<div class="meter"><i style="width:${s.conf}%"></i></div><small>${s.conf}% record-match confidence</small>` : ''}
        ${s.sub ? `<small>${s.sub}</small>` : ''}
      </div>
    </div>`).join('');

  const timeline = p.events.map(e =>
    `<div class="event"><time>${e[0]}</time><strong>${e[1]}</strong><p>${e[2]}</p></div>`
  ).join('');

  $('#detail').innerHTML = `
    <div class="detail-top">
      <div>
        <h2>${p.name}</h2>
        <div class="detail-id">${p.id} · ${p.age} years · ${p.phone}</div>
      </div>
      <span class="status-pill ${p.status}">${p.label}</span>
    </div>

    <div class="trend-card">
      <div class="trend-head">
        <span class="lbl">HbA1c trend</span>
        <span class="meta">${p.a1c.length} results · ${TREND_WORD[sp.dir]}</span>
      </div>
      <div class="trend-plot">${sp.svg}</div>
      <div class="trend-axis">
        <span><b>${first.v}%</b> · ${first.d}</span>
        <span><b>${latest.v}%</b> · ${latest.d}</span>
      </div>
    </div>

    <div class="detail-grid">
      <div><span>Last contact</span><b>${p.last}</b></div>
      <div><span>Next recall</span><b>${p.next}</b></div>
      <div><span>Reason to call</span><b>${p.reason}</b></div>
    </div>

    <h3 class="block">What Smaran noticed</h3>
    <div class="signals">${signals}</div>

    <h3 class="block">Linked records — one patient view</h3>
    <div class="timeline">${timeline}</div>

    <div class="callout">
      <div class="callout-head">
        <div class="lead">
          <h3>Suggested outreach</h3>
          <span class="ai-chip">AI drafted</span>
        </div>
        <span class="review-note">Human review required</span>
      </div>

      <div class="lang-toggle">
        <button data-lang="bn" class="${msgLang === 'bn' ? 'on' : ''}">বাংলা</button>
        <button data-lang="en" class="${msgLang === 'en' ? 'on' : ''}">English</button>
      </div>

      <div class="message" id="draft">${p.msg[msgLang]}</div>

      <div class="msg-foot">
        <button class="regen" id="regen">
          <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M12 5V2L7 7l5 5V8a4 4 0 1 1-4 4H6a6 6 0 1 0 6-7Z"/></svg>
          Regenerate
        </button>
        <span class="info-only">Information only — references visit history, not medical advice.</span>
      </div>

      <div class="actions">
        <button class="send" id="sendBtn">Send via WhatsApp</button>
        <button class="secondary" id="doneBtn">Mark contacted</button>
      </div>
    </div>`;

  // wire up detail controls
  $$('.lang-toggle button').forEach(b => b.onclick = () => {
    msgLang = b.dataset.lang;
    $('#draft').textContent = p.msg[msgLang];
    $$('.lang-toggle button').forEach(x => x.classList.toggle('on', x.dataset.lang === msgLang));
  });
  $('#regen').onclick = () => toast('New draft generated · still needs human review');
  $('#sendBtn').onclick = () => toast('Message queued for human approval');
  $('#doneBtn').onclick = () => toast('Marked contacted · queue updated');
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
function openDrawer() {
  $('#drawer').classList.add('show');
  $('#drawer').setAttribute('aria-hidden', 'false');
  $('#drawerBackdrop').classList.add('show');
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

$('#drawerSave').onclick = () => {
  defaultLang = $('#setLang').value;
  $('#syncTime').textContent = 'Last run ' + ($('#setSync').value === 'Hourly' ? '06:10' : $('#setSync').value);
  closeDrawer();
  toast('Settings saved (demo)');
  if (selected) renderDetail(patients.find(p => p.id === selected));
};

/* ---------- Filters / search / sync ---------- */
$$('.chip').forEach(c => c.onclick = () => {
  $$('.chip').forEach(x => x.classList.remove('active'));
  c.classList.add('active');
  active = c.dataset.filter;
  renderList();
});
$('#search').oninput = renderList;
$('#runSync').onclick = () => toast('Nightly sync complete · 18 records linked');
$('#filterBtn').onclick = () => toast('Filters are set to active follow-up risk');

/* ---------- Init ---------- */
renderCounts();
renderList();
