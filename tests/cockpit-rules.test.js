// Run: node --test tests/
// Same cases as tests/test_backend.py, so browser and server rules agree.
const test = require('node:test');
const assert = require('node:assert');
const R = require('../cockpit-rules.js');
const KW = require('../cockpit-keywords.json');

const TODAY = new Date(2026, 10, 9);

test('red flag beats everything', () => {
  assert.equal(R.classifyReply('Yes I will come, but chest pain since morning', KW).intent, 'escalate');
  assert.equal(R.classifyReply('আসবো, কিন্তু বুকে ব্যথা', KW).intent, 'escalate');
});

test('reply status updates', () => {
  const cases = {
    'We moved to Delhi last year': 'moved',
    'Got tested at another lab': 'elsewhere',
    'Wrong number': 'wrong_number',
    'Please stop': 'opt_out',
    'Yes, coming Saturday': 'coming',
    '১': 'coming',
    'busy, call later': 'callback',
    'অন্য ল্যাব থেকে টেস্ট করিয়েছি': 'elsewhere',
    '10': 'unclear',
  };
  for (const [text, intent] of Object.entries(cases)) assert.equal(R.classifyReply(text, KW).intent, intent, text);
});

const PATIENTS = [
  { id: 'A', status: 'overdue', priority_score: 0.9, hasPhone: true, recall: new Date(2025, 7, 16), lang: 'bn', age: 57 },
  { id: 'B', status: 'due', priority_score: 0.4, hasPhone: true, recall: new Date(2026, 10, 12), lang: 'en', age: 41 },
  { id: 'C', status: 'overdue', priority_score: 0.95, hasPhone: false, recall: new Date(2025, 5, 1), lang: 'en', age: 71 },
  { id: 'D', status: 'slipping', priority_score: 0.8, hasPhone: true, recall: new Date(2026, 2, 7), lang: 'bn', age: 52, outcome: 'moved' },
];
const search = q => { const f = R.parseQuery(q, KW); return PATIENTS.filter(p => R.matches(p, f, TODAY)).map(p => p.id); };

test('pitch search query', () => {
  assert.deepEqual(search('critical and reachable this week'), ['A']);
  assert.ok(R.describe(R.parseQuery('critical and reachable this week', KW)).includes('reachable by phone'));
});

test('search by language, age and window', () => {
  assert.deepEqual(search('overdue english over 60'), ['C']);
  assert.deepEqual(search('due this week'), ['B']);
});
