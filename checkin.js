/* Smaran weekly check-in UI. Logic lives in checkin-engine.js. */
(function () {
  'use strict';
  const E = window.SmaranCheckin;
  const KEY = 'smaran.checkin.v1';
  const DAY = 864e5;
  const app = document.getElementById('app');

  /* ---------- storage (safe if blocked) ---------- */
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function save(st) { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* private mode */ } }

  let store = load();
  let lang = store.lang || ((navigator.language || '').startsWith('bn') ? 'bn' : 'en');
  let log = [];          // [[qid, value], ...] for the current check-in
  let pick = null;       // current selection before "Next"
  let view = 'intro';
  let lastAward = null;
  let lastResult = null;

  /* ---------- UI strings ---------- */
  const S = {
    tagline: { en: 'Weekly sugar & heart check-in', bn: 'সাপ্তাহিক সুগার ও হার্ট চেক-ইন' },
    footer: { en: 'Smaran gives reminders and general health information. It does not diagnose. Always confirm with a doctor.',
      bn: 'স্মরণ শুধু মনে করিয়ে দেয় আর সাধারণ স্বাস্থ্য তথ্য দেয়। এটি রোগ নির্ণয় করে না। সবসময় ডাক্তারের সঙ্গে নিশ্চিত হন।' },
    hello: { en: 'Namaskar! 👋', bn: 'নমস্কার! 👋' },
    helloName: { en: n => `Welcome back, ${n}! 👋`, bn: n => `আবার স্বাগতম, ${n}! 👋` },
    lead: { en: 'A 2-minute check on your sugar, BP and habits. We will tell you which test to do next, and when.',
      bn: '২ মিনিটে আপনার সুগার, প্রেসার আর অভ্যাসের খোঁজ। পরের কোন পরীক্ষা কবে করাবেন, আমরা জানিয়ে দেব।' },
    chipQ: { en: '📝 Up to 10 questions', bn: '📝 সর্বোচ্চ ১০টি প্রশ্ন' },
    chipT: { en: '⏱️ About 2 minutes', bn: '⏱️ প্রায় ২ মিনিট' },
    chipP: { en: '⭐ Earn points weekly', bn: '⭐ প্রতি সপ্তাহে পয়েন্ট' },
    name: { en: 'Your first name (optional)', bn: 'আপনার নাম (ইচ্ছা হলে)' },
    consent: { en: '🔒 Your answers stay on this phone. This is not a diagnosis; it helps you plan tests and talk to your doctor.',
      bn: '🔒 আপনার উত্তর এই ফোনেই থাকে। এটি রোগ নির্ণয় নয়; পরীক্ষার পরিকল্পনা আর ডাক্তারের সঙ্গে কথা বলতে সাহায্য করে।' },
    start: { en: 'Start check-in', bn: 'চেক-ইন শুরু করুন' },
    startAgain: { en: 'Start this week\'s check-in', bn: 'এই সপ্তাহের চেক-ইন শুরু করুন' },
    streak: { en: n => `${n}-week streak`, bn: n => `টানা ${E.bnNum(n)} সপ্তাহ` },
    streakSub: { en: 'Check in every week to keep it going and earn bonus points.', bn: 'প্রতি সপ্তাহে চেক-ইন করুন, স্ট্রিক ধরে রাখুন আর বোনাস পয়েন্ট পান।' },
    doneThisWeek: { en: 'You already checked in this week. You can do it again, but points come once a week.',
      bn: 'এই সপ্তাহে চেক-ইন হয়ে গেছে। আবার করতে পারেন, তবে পয়েন্ট সপ্তাহে একবারই মেলে।' },
    qOf: { en: (n, m) => `Question ${n} of up to ${m}`, bn: (n, m) => `প্রশ্ন ${E.bnNum(n)} (সর্বোচ্চ ${E.bnNum(m)})` },
    back: { en: '← Back', bn: '← আগের প্রশ্ন' },
    next: { en: 'Next', bn: 'পরের প্রশ্ন' },
    seeResult: { en: 'See my plan', bn: 'আমার পরিকল্পনা দেখুন' },
    cont: { en: 'Continue', bn: 'এগিয়ে যান' },
    quickCheck: { en: '🤔 Quick check', bn: '🤔 একটু মিলিয়ে নিই' },
    lvl: {
      good: { e: '🟢', en: 'On track', bn: 'ঠিক পথে আছেন' },
      watch: { e: '🟡', en: 'Keep a closer watch', bn: 'একটু বেশি নজর রাখুন' },
      soon: { e: '🟠', en: 'Check with a doctor soon', bn: 'শিগগিরই ডাক্তার দেখান' },
      urgent: { e: '🚨', en: 'Get medical help today', bn: 'আজই চিকিৎসা নিন' }
    },
    lvlSub: { en: 'Based on your answers. This is not a diagnosis.', bn: 'আপনার উত্তরের ভিত্তিতে। এটি রোগ নির্ণয় নয়।' },
    call108: { en: '📞 Call 108 (ambulance)', bn: '📞 ১০৮-এ ফোন করুন (অ্যাম্বুলেন্স)' },
    nextTests: { en: 'Your next tests', bn: 'আপনার পরের পরীক্ষা' },
    ckm: { en: 'Heart, kidney & sugar at a glance', bn: 'এক নজরে হার্ট, কিডনি ও সুগার' },
    ckmSt: {
      good: { en: 'Looks fine', bn: 'ঠিক আছে' }, watch: { en: 'Watch', bn: 'নজর রাখুন' },
      act: { en: 'Needs a check', bn: 'পরীক্ষা দরকার' }, unknown: { en: 'Not checked', bn: 'পরীক্ষা হয়নি' }
    },
    outlook: { en: 'What lies ahead', bn: 'সামনে কী' },
    week: { en: 'This week, try', bn: 'এই সপ্তাহে চেষ্টা করুন' },
    pts: { en: 'Points', bn: 'পয়েন্ট' },
    earned: { en: n => `+${n} points`, bn: n => `+${E.bnNum(n)} পয়েন্ট` },
    already: { en: 'Points already earned this week. Come back next week to keep your streak! 🔥',
      bn: 'এই সপ্তাহের পয়েন্ট পেয়ে গেছেন। স্ট্রিক ধরে রাখতে পরের সপ্তাহে আবার আসুন! 🔥' },
    total: { en: 'Total', bn: 'মোট' },
    bd: {
      answers: { en: 'Answering questions', bn: 'প্রশ্নের উত্তর' }, complete: { en: 'Weekly check-in done', bn: 'সাপ্তাহিক চেক-ইন সম্পূর্ণ' },
      streak: { en: 'Streak bonus 🔥', bn: 'স্ট্রিক বোনাস 🔥' }, testDone: { en: 'Got your test done 🧪', bn: 'টেস্ট করানো 🧪' }
    },
    badges: {
      first: { en: '🌱 First check-in', bn: '🌱 প্রথম চেক-ইন' }, streak4: { en: '🔥 4-week streak', bn: '🔥 টানা ৪ সপ্তাহ' },
      tested: { en: '🧪 Test done', bn: '🧪 টেস্ট সম্পূর্ণ' }, p500: { en: '🏅 500 points', bn: '🏅 ৫০০ পয়েন্ট' }
    },
    remind: { en: '📅 Add reminders', bn: '📅 রিমাইন্ডার যোগ করুন' },
    share: { en: '💬 Share on WhatsApp', bn: '💬 WhatsApp-এ পাঠান' },
    again: { en: 'Done', bn: 'শেষ' },
    restart: { en: 'Redo answers', bn: 'আবার উত্তর দিন' },
    unresolved: { en: 'Some of your answers did not match each other. Please go over them with your doctor.',
      bn: 'আপনার কিছু উত্তর একে অপরের সঙ্গে মেলেনি। ডাক্তারের সঙ্গে একবার মিলিয়ে নিন।' },
    clarified: { en: n => `✅ We double-checked ${n} answer${n > 1 ? 's' : ''} that didn't match, so this plan is more accurate.`,
      bn: n => `✅ মেলেনি এমন ${E.bnNum(n)}টি উত্তর আমরা মিলিয়ে নিয়েছি, তাই এই পরিকল্পনা আরও নির্ভুল।` },
    riskScore: { en: (s, b) => `Indian Diabetes Risk Score: ${s} (${b})`, bn: (s, b) => `ইন্ডিয়ান ডায়াবেটিস রিস্ক স্কোর: ${E.bnNum(s)} (${b})` },
    band: { low: { en: 'low', bn: 'কম' }, medium: { en: 'medium', bn: 'মাঝারি' }, high: { en: 'high', bn: 'বেশি' } },
    home: { en: 'Home', bn: 'হোম' },
    reset: { en: 'Clear my data on this phone', bn: 'এই ফোন থেকে আমার তথ্য মুছুন' },
    resetQ: { en: 'Delete all your check-ins and points from this phone?', bn: 'এই ফোন থেকে সব চেক-ইন আর পয়েন্ট মুছে দেবেন?' },
    shareHead: { en: 'My Smaran health plan', bn: 'আমার স্মরণ স্বাস্থ্য পরিকল্পনা' },
    rel: {
      en: d => d <= 0 ? 'today' : d === 1 ? 'tomorrow' : d < 14 ? `in ${d} days` : d < 60 ? `in ${Math.round(d / 7)} weeks` : `in ${Math.round(d / 30)} months`,
      bn: d => d <= 0 ? 'আজ' : d === 1 ? 'কাল' : d < 14 ? `${E.bnNum(d)} দিন পরে` : d < 60 ? `${E.bnNum(Math.round(d / 7))} সপ্তাহ পরে` : `${E.bnNum(Math.round(d / 30))} মাস পরে`
    }
  };
  const t = (k, ...args) => { const v = S[k][lang]; return typeof v === 'function' ? v(...args) : v; };
  const L = x => (x ? x[lang] : '');
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  /* ---------- shell ---------- */
  function renderShell() {
    document.documentElement.lang = lang === 'bn' ? 'bn' : 'en';
    document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('.lang button').forEach(b => b.classList.toggle('on', b.dataset.lang === lang));
    const p = store.points || 0;
    document.getElementById('ptsVal').textContent = lang === 'bn' ? E.bnNum(p) : p;
  }
  document.querySelectorAll('.lang button').forEach(b => b.onclick = () => {
    lang = b.dataset.lang; store.lang = lang; save(store); renderShell(); render();
  });

  function render() {
    renderShell();
    if (view === 'intro') renderIntro();
    else if (view === 'q') renderQuestion();
    else renderResult();
  }

  /* ---------- intro ---------- */
  function renderIntro() {
    const name = store.name || '';
    const wk = E.weekIndex(new Date());
    const doneWk = store.lastWeek === wk;
    const streakAlive = store.streak && (store.lastWeek === wk || store.lastWeek === wk - 1);
    app.innerHTML = `<section class="card fade">
      <h1 class="hello">${name ? esc(t('helloName', name)) : t('hello')}</h1>
      <p class="lead">${t('lead')}</p>
      <div class="meta-row"><span>${t('chipQ')}</span><span>${t('chipT')}</span><span>${t('chipP')}</span></div>
      ${streakAlive ? `<div class="streak-box"><span class="big">🔥</span><div><b>${t('streak', store.streak)}</b><small>${t('streakSub')}</small></div></div>` : ''}
      ${doneWk ? `<p class="consent">${t('doneThisWeek')}</p>` : ''}
      ${name ? '' : `<label class="field"><span>${t('name')}</span><input id="nameIn" autocomplete="given-name" maxlength="30"></label>`}
      <p class="consent">${t('consent')}</p>
      <button class="primary" id="go">${store.profile ? t('startAgain') : t('start')}</button>
      ${store.profile ? `<button class="link-btn" id="reset">${t('reset')}</button>` : ''}
    </section>`;
    document.getElementById('go').onclick = () => {
      const n = document.getElementById('nameIn');
      if (n && n.value.trim()) { store.name = n.value.trim(); save(store); }
      log = []; pick = null; view = 'q'; render();
    };
    const r = document.getElementById('reset');
    if (r) r.onclick = () => { if (confirm(t('resetQ'))) { store = { lang }; save(store); render(); } };
  }

  /* ---------- questions ---------- */
  function state() { return E.replay(store.profile || null, log, new Date()); }

  function renderQuestion() {
    const s = state();
    const q = E.nextQuestion(s);
    if (!q) return finish(s);
    const text = E.resolveText(q.text, s);
    const n = s.asked.length + 1;
    const multi = q.type === 'multi';
    if (multi && !Array.isArray(pick)) pick = [];
    const tip = !multi && pick != null ? E.tipFor(s, q.id, pick) : null;
    const locked = !multi && pick != null;
    const isLast = (() => { if (pick == null) return false; const s2 = E.replay(store.profile || null, log.concat([[q.id, pick]]), new Date()); return !E.nextQuestion(s2); })();

    app.innerHTML = `<section class="card fade" key="${q.id}">
      <div class="progress">
        ${log.length ? `<button class="back" id="back">${t('back')}</button>` : ''}
        <div class="bar"><i style="width:${Math.round(((n - 1) / E.MAX_Q) * 100)}%"></i></div>
        <small>${t('qOf', n, E.MAX_Q)}</small>
      </div>
      ${q.clarify ? `<span class="clarify-tag">${t('quickCheck')}</span>` : ''}
      <div class="q-emoji" aria-hidden="true">${q.emoji}</div>
      <h2 class="q-title">${esc(L(text))}</h2>
      ${q.help ? `<p class="q-help">${esc(L(q.help))}</p>` : ''}
      <div class="opts" role="${multi ? 'group' : 'radiogroup'}">
        ${q.options.map(o => {
          const sel = multi ? pick.includes(o.v) : pick === o.v;
          return `<button class="opt ${multi ? 'multi' : ''} ${sel ? 'sel' : ''}" data-v="${o.v}" role="${multi ? 'checkbox' : 'radio'}" aria-checked="${sel}" ${locked && !sel ? 'disabled' : ''}>
            <span class="oe" aria-hidden="true">${o.e}</span><span class="ol">${esc(L(o.l))}</span><span class="tick">${sel ? '✓' : ''}</span></button>`;
        }).join('')}
      </div>
      ${tip ? `<div class="tip"><span class="ti">💡</span><span>${esc(L(tip))}</span></div>` : ''}
      ${multi || pick != null ? `<button class="primary next" id="next" ${multi && !pick.length ? 'disabled' : ''}>${isLast ? t('seeResult') : multi ? t('cont') : t('next')}</button>` : ''}
    </section>`;

    app.querySelectorAll('.opt').forEach(b => b.onclick = () => {
      const v = b.dataset.v;
      if (multi) {
        if (v === q.exclusive) pick = pick.includes(v) ? [] : [v];
        else { pick = pick.filter(x => x !== q.exclusive); pick = pick.includes(v) ? pick.filter(x => x !== v) : pick.concat(v); }
        renderQuestion();
      } else {
        if (pick === v) { pick = null; renderQuestion(); return; } // tap again to change
        pick = v;
        if (!E.tipFor(s, q.id, v)) { commit(q.id); return; } // no tip: move on straight away
        renderQuestion();
      }
    });
    const nx = document.getElementById('next');
    if (nx) nx.onclick = () => {
      if (multi) {
        const tp = E.tipFor(s, q.id, pick);
        if (tp && !nx.dataset.tipShown) { showMultiTip(nx, tp); return; }
      }
      commit(q.id);
    };
    const bk = document.getElementById('back');
    if (bk) bk.onclick = () => { const last = log.pop(); pick = last ? last[1] : null; renderQuestion(); };
  }

  /* For multi-select, show the tip once, then the button moves on. */
  function showMultiTip(btn, tip) {
    const d = document.createElement('div');
    d.className = 'tip';
    d.innerHTML = `<span class="ti">💡</span><span>${esc(L(tip))}</span>`;
    btn.before(d);
    btn.dataset.tipShown = '1';
    btn.textContent = t('next');
    app.querySelectorAll('.opt').forEach(o => { o.disabled = true; });
  }

  function commit(qid) {
    log.push([qid, pick]);
    pick = null;
    renderQuestion();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------- finish + result ---------- */
  function finish(s) {
    const result = E.buildResult(s);
    lastAward = E.awardPoints(store, s, new Date());
    store = Object.assign(store, lastAward.store);
    store.profile = E.snapshot(s, result);
    store.history = (store.history || []).concat({ date: s.now.toISOString(), level: result.level, earned: lastAward.earned }).slice(-52);
    save(store);
    view = 'result';
    lastResult = result;
    renderResult(result);
    if (lastAward.earned) { celebrate(); const p = document.getElementById('ptsPill'); p.classList.remove('bump'); void p.offsetWidth; p.classList.add('bump'); }
  }

  function renderResult(result) {
    result = result || lastResult;
    renderShell();
    const lv = S.lvl[result.level];
    const now = Date.now();
    const days = due => Math.max(0, Math.round((due - now) / DAY));
    const aw = lastAward || { earned: 0, already: true, breakdown: [], newBadges: [] };
    const nm = store.name ? esc(store.name) + ', ' : '';

    app.innerHTML = `<div class="fade">
      <section class="level ${result.level}">
        <div class="le">${lv.e}</div>
        <h2>${nm}${lv[lang]}</h2>
        <p>${t('lvlSub')}</p>
        <ul>${result.reasons.filter((r, i, arr) => arr.findIndex(x => x.t.en === r.t.en) === i).slice(0, 4).map(r => `<li>${esc(L(r.t))}</li>`).join('')}</ul>
        ${result.level === 'urgent' ? `<a class="urgent-call" href="tel:108">${t('call108')}</a>` : ''}
      </section>
      ${result.unresolved ? `<div class="warn">⚠️ ${t('unresolved')}</div>` : ''}
      ${result.contradictions.length ? `<p class="note">${t('clarified', result.contradictions.length)}</p>` : ''}

      <h3 class="sec">📅 ${t('nextTests')}</h3>
      <div class="sched">${result.schedule.map((x, i) => `
        <div class="si ${i === 0 ? 'first' : ''}">
          <span class="se">${x.emoji}</span>
          <div class="sm"><b>${esc(L(x.name))}</b><small>${esc(L(x.why))}</small></div>
          <div class="sd"><b>${E.fmtDate(x.due, lang)}</b><small>${S.rel[lang](days(x.due))}</small></div>
        </div>`).join('')}
      </div>

      <h3 class="sec">🫀 ${t('ckm')}</h3>
      <div class="ckm">${result.ckm.map(c => `
        <div class="ck ${c.st}"><div class="ce">${c.emoji}</div><b>${esc(L(c.name))}</b><span>${S.ckmSt[c.st][lang]}</span></div>`).join('')}
      </div>
      ${result.risk.known >= 3 && store.profile.a.status !== 'diabetes' ? `<p class="note">${t('riskScore', result.risk.score, S.band[result.risk.band][lang])}</p>` : ''}

      <h3 class="sec">🔭 ${t('outlook')}</h3>
      <div class="outlook">${esc(L(result.outlook))}</div>

      <h3 class="sec">✨ ${t('week')}</h3>
      <ul class="nudges">${result.nudges.map(n => `<li>${esc(L(n))}</li>`).join('')}</ul>

      <h3 class="sec">⭐ ${t('pts')}</h3>
      <section class="points-card">
        <div class="pc-top">
          <div class="earned">${aw.already ? '⭐ ' + (lang === 'bn' ? E.bnNum(store.points || 0) : (store.points || 0)) : t('earned', aw.earned)}</div>
          <div class="flame"><b>🔥 ${lang === 'bn' ? E.bnNum(store.streak || 0) : (store.streak || 0)}</b>${lang === 'bn' ? 'সপ্তাহের স্ট্রিক' : 'week streak'}</div>
        </div>
        ${aw.already ? `<p class="note" style="margin:8px 0 0">${t('already')}</p>` : `<ul class="bd">${aw.breakdown.map(b => `<li><span>${S.bd[b.k][lang]}</span><b>+${lang === 'bn' ? E.bnNum(b.p) : b.p}</b></li>`).join('')}
          <li><span>${t('total')}</span><b>${lang === 'bn' ? E.bnNum(store.points) : store.points}</b></li></ul>`}
        <div class="badges">${(store.badges || []).map(b => `<span class="${aw.newBadges.includes(b) ? 'new' : ''}">${S.badges[b][lang]}</span>`).join('')}</div>
      </section>

      <div class="actions">
        <button class="ghost" id="ics">${t('remind')}</button>
        <button class="ghost" id="wa">${t('share')}</button>
        <button class="primary" id="home">${t('again')}</button>
      </div>
      <button class="link-btn" id="redo">${t('restart')}</button>
    </div>`;

    document.getElementById('ics').onclick = () => downloadIcs(result);
    document.getElementById('wa').onclick = () => shareWhatsApp(result);
    document.getElementById('home').onclick = () => { view = 'intro'; lastAward = null; render(); window.scrollTo(0, 0); };
    document.getElementById('redo').onclick = () => { log = []; pick = null; view = 'q'; render(); };
  }

  /* ---------- reminders (.ics) ---------- */
  function downloadIcs(result) {
    const pad = n => String(n).padStart(2, '0');
    const ymd = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const ev = result.schedule.filter(x => x.key !== 'bp' || result.schedule.length < 3).slice(0, 5).map((x, i) => {
      const d = new Date(Math.max(x.due, Date.now()));
      const end = new Date(d.getTime() + DAY);
      return ['BEGIN:VEVENT', `UID:smaran-${stamp}-${i}@smaran`, `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${ymd(d)}`, `DTEND;VALUE=DATE:${ymd(end)}`,
        `SUMMARY:Smaran: ${L(x.name)}`, `DESCRIPTION:${L(x.why)}`,
        'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', `DESCRIPTION:${L(x.name)}`, 'END:VALARM', 'END:VEVENT'].join('\r\n');
    });
    // Weekly check-in reminder, 7 days from now
    const wk = new Date(Date.now() + 7 * DAY);
    ev.push(['BEGIN:VEVENT', `UID:smaran-${stamp}-weekly@smaran`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${ymd(wk)}`,
      `DTEND;VALUE=DATE:${ymd(new Date(wk.getTime() + DAY))}`, 'RRULE:FREQ=WEEKLY;COUNT=12',
      `SUMMARY:Smaran: ${lang === 'bn' ? 'সাপ্তাহিক চেক-ইন ⭐' : 'Weekly check-in ⭐'}`, 'END:VEVENT'].join('\r\n'));
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Smaran//Check-in//EN', ...ev, 'END:VCALENDAR'].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    a.download = 'smaran-reminders.ics';
    document.body.appendChild(a); a.click(); a.remove();
  }

  function shareWhatsApp(result) {
    const lines = [`*${t('shareHead')}*`, `${S.lvl[result.level].e} ${S.lvl[result.level][lang]}`, ''];
    result.schedule.forEach(x => lines.push(`${x.emoji} ${L(x.name)}: ${E.fmtDate(x.due, lang)}`));
    lines.push('', t('footer'));
    window.open('https://wa.me/?text=' + encodeURIComponent(lines.join('\n')), '_blank', 'noopener');
  }

  function celebrate() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const box = document.createElement('div');
    box.className = 'confetti';
    const set = ['⭐', '🎉', '✨', '🔥', '💚'];
    for (let i = 0; i < 18; i++) {
      const el = document.createElement('i');
      el.textContent = set[i % set.length];
      el.style.left = Math.random() * 100 + 'vw';
      el.style.animationDelay = Math.random() * 0.5 + 's';
      box.appendChild(el);
    }
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 2400);
  }

  render();
})();
