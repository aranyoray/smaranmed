// Run: node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const E = require('../checkin-engine.js');

const NOW = new Date('2026-10-17T09:00:00+05:30');

/* Answer with a scripted map; first option for anything unscripted. */
function run(script, prev, now = NOW) {
  const s = E.createState(prev, now);
  const seen = [];
  let q;
  while ((q = E.nextQuestion(s))) {
    let v = script[q.id];
    if (v === undefined) v = q.type === 'multi' ? [q.options[0].v] : q.options[0].v;
    seen.push(q.id);
    E.applyAnswer(s, q.id, v);
  }
  return { s, seen, r: E.buildResult(s) };
}

/* Exhaustive-ish fuzz: random answers never exceed 10 questions or crash. */
test('never more than 10 questions on any random path', () => {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 3000; i++) {
    const prev = i % 3 === 0 ? { date: '2026-10-01T00:00:00Z', a: { status: 'diabetes', age: 'a50' }, schedule: [{ key: 'sugar', due: NOW.getTime() - 864e5 }] } : null;
    const s = E.createState(prev, NOW);
    let q, n = 0;
    while ((q = E.nextQuestion(s))) {
      const opts = q.options.map(o => o.v);
      let v = opts[Math.floor(rnd() * opts.length)];
      if (q.type === 'multi') v = opts.filter(() => rnd() < 0.3);
      E.applyAnswer(s, q.id, v);
      n++;
      assert.ok(n <= E.MAX_Q, 'exceeded cap');
    }
    const r = E.buildResult(s);
    assert.ok(['good', 'watch', 'soon', 'urgent'].includes(r.level));
    assert.ok(r.schedule.length >= 2);
    r.schedule.forEach(x => assert.ok(x.due >= NOW.getTime() - 1000));
  }
});

test('diabetes path asks meds and yearly checks, not family or waist', () => {
  const { seen } = run({ status: 'diabetes', symptoms: ['none'], meds: 'daily' });
  assert.ok(seen.includes('meds') && seen.includes('checks') && seen.includes('lows'));
  assert.ok(!seen.includes('family') && !seen.includes('waist'));
});

test('never-tested path skips last test and value, uses IDRS questions', () => {
  const { seen, r } = run({ status: 'never', age: 'a50', symptoms: ['none'], family: 'both', waist: 'large', activity: 'sit' });
  assert.ok(!seen.includes('lastTest') && !seen.includes('value'));
  assert.strictEqual(r.risk.score, 100);
  assert.strictEqual(r.risk.band, 'high');
  assert.strictEqual(r.schedule.find(x => x.key === 'sugar').due, NOW.getTime() + 30 * 864e5);
});

test('contradiction: told normal but picked a high number', () => {
  const { seen, r } = run({ status: 'normal', symptoms: ['none'], lastTest: 'lt3m', value: 'dm', c_normal_but_high: 'no_review' });
  assert.ok(seen.includes('c_normal_but_high'));
  assert.strictEqual(seen.indexOf('c_normal_but_high'), seen.indexOf('value') + 1, 'clarify asked immediately');
  assert.strictEqual(r.level, 'soon');
});

test('contradiction: told borderline yet never tested resolves to old test', () => {
  const { s, seen } = run({ status: 'borderline', symptoms: ['none'], lastTest: 'never', c_told_never: 'long_ago' });
  assert.ok(seen.includes('c_told_never'));
  assert.strictEqual(s.a.lastTest, 'gt3y');
  assert.ok(seen.includes('value'), 'value is now asked after resolving');
});

test('contradiction: very active but breathless', () => {
  const { s, seen } = run({ status: 'never', symptoms: ['breath'], activity: 'vig', c_active_breathless: 'less_active' });
  assert.ok(seen.includes('c_active_breathless'));
  assert.strictEqual(s.a.activity, 'light');
});

test('cross-week contradiction: diabetes last week, "normal" today', () => {
  const prev = { date: '2026-10-08T00:00:00Z', a: { status: 'diabetes', age: 'a50' }, schedule: [] };
  const { s, seen } = run({ status: 'normal', c_prev_status: 'feel_fine', symptoms: ['none'] }, prev);
  assert.ok(seen.includes('c_prev_status'));
  assert.strictEqual(s.a.status, 'diabetes');
  assert.ok(!seen.includes('age'), 'age remembered from last week');
});

test('continuity: follow-up asked when suggested test is due, and done counts', () => {
  const prev = { date: '2026-10-01T00:00:00Z', a: { status: 'borderline', age: 'a35', family: 'one' }, schedule: [{ key: 'sugar', due: NOW.getTime() + 3 * 864e5 }] };
  const { s, seen } = run({ followup: 'done', status: 'borderline', value: 'pre', symptoms: ['none'] }, prev);
  assert.strictEqual(seen[0], 'followup');
  assert.ok(!seen.includes('lastTest'), 'last test inferred from follow-up');
  assert.ok(seen.includes('value'));
  assert.ok(s.flags.testDone);
});

test('red flags lead to urgent, hospital today', () => {
  const { r } = run({ status: 'never', symptoms: ['urination', 'thirst', 'weightloss'], redflag: ['confused'] });
  assert.strictEqual(r.level, 'urgent');
  assert.strictEqual(r.schedule[0].due, NOW.getTime());
});

test('well-controlled diabetes gets HbA1c in about 6 months', () => {
  const { r } = run({ status: 'diabetes', symptoms: ['none'], lastTest: 'lt3m', value: 'normal', meds: 'daily', lows: 'never', checks: ['eye', 'foot', 'kidney', 'lipid'] });
  const due = r.schedule.find(x => x.key === 'sugar').due;
  const days = (due - NOW.getTime()) / 864e5;
  assert.ok(days > 120 && days < 150, 'about 4.5 months from now (6 months after a test ~1.5 months ago): ' + days);
});

test('points: once per week, streak bonus for consecutive weeks', () => {
  const { s } = run({ status: 'never', symptoms: ['none'] });
  let a = E.awardPoints({}, s, NOW);
  assert.ok(a.earned > 0 && a.streak === 1 && a.newBadges.includes('first'));
  const again = E.awardPoints(a.store, s, new Date(NOW.getTime() + 864e5));
  assert.strictEqual(again.earned, 0);
  assert.ok(again.already);
  const next = E.awardPoints(a.store, s, new Date(NOW.getTime() + 7 * 864e5));
  assert.strictEqual(next.streak, 2);
  assert.ok(next.breakdown.some(b => b.k === 'streak'));
  const gap = E.awardPoints(next.store, s, new Date(NOW.getTime() + 28 * 864e5));
  assert.strictEqual(gap.streak, 1, 'streak resets after a missed week');
});

test('every question and option has English and Bengali text', () => {
  const s = E.createState({ date: '2026-10-01T00:00:00Z', a: { status: 'diabetes' }, schedule: [{ key: 'sugar', due: NOW.getTime() }] }, NOW);
  s.a.status = 'normal';
  const all = [...Object.values(E.Q), ...E.RULES.map(r => E.getQ(r.id))];
  for (const q of all) {
    const t = E.resolveText(q.text, s);
    assert.ok(t.en && t.bn, q.id);
    q.options.forEach(o => assert.ok(o.l.en && o.l.bn, q.id + ':' + o.v));
  }
});

test('no em dashes or arrows in any user-facing text', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'checkin-engine.js'), 'utf8');
  const strings = src.match(/'[^'\n]*'|`[^`\n]*`/g).join(' ');
  assert.ok(!/—|->/.test(strings));
});
