/* Smaran cockpit rules: reply sorting and plain-language search.
 * Mirrors backend/replies.py and backend/search.py over the same
 * cockpit-keywords.json, so the static demo behaves like the server.
 * Works in the browser (window.SmaranRules) and in Node (module.exports). */
(function (root) {
  'use strict';

  var INTENT_ORDER = ['escalate', 'deceased', 'opt_out', 'wrong_number', 'moved', 'elsewhere', 'callback', 'coming'];
  var ACTIONS = {
    escalate: [false, 'Escalated to clinician'],
    deceased: [true, 'Reported deceased'],
    opt_out: [true, 'Opted out of messages'],
    wrong_number: [true, 'Wrong number'],
    moved: [true, 'Relocated'],
    elsewhere: [true, 'Testing at another facility'],
    callback: [false, 'Call-back requested'],
    coming: [true, 'Visit confirmed'],
    unclear: [false, 'Requires manual review']
  };
  var UNREACHABLE = { opt_out: 1, wrong_number: 1, deceased: 1, moved: 1 };
  var CRITICAL_PRIORITY = 0.5;
  var WINDOWS = [['today', 0], ['week', 7], ['month', 30]];
  var WORD_CHAR = /[\p{L}\p{M}\p{N}_]/u;

  function isAscii(s) { return /^[\x00-\x7f]*$/.test(s); }
  function isDigits(s) { return /^\p{N}+$/u.test(s); }

  function hasWord(text, word) {
    var whole = isAscii(word) || isDigits(word);
    var start = text.indexOf(word);
    while (start !== -1) {
      var end = start + word.length;
      var beforeOk = start === 0 || !WORD_CHAR.test(text[start - 1]);
      var afterOk = !whole || end === text.length || !WORD_CHAR.test(text[end]);
      if (beforeOk && afterOk) return true;
      start = text.indexOf(word, start + 1);
    }
    return false;
  }

  function findPhrase(text, words) {
    var lowered = String(text || '').toLowerCase();
    for (var i = 0; i < words.length; i++) if (hasWord(lowered, words[i])) return words[i];
    return null;
  }

  function classifyReply(text, kw) {
    var intent = 'unclear', matched = null;
    for (var i = 0; i < INTENT_ORDER.length; i++) {
      var hit = findPhrase(text, kw.replies[INTENT_ORDER[i]].words);
      if (hit) { intent = INTENT_ORDER[i]; matched = hit; break; }
    }
    var action = ACTIONS[intent];
    return { intent: intent, label: action[1], leaves_queue: action[0], escalate: intent === 'escalate', matched: matched, by: 'rule' };
  }

  function parseQuery(text, kw) {
    var w = kw.search;
    var f = { statuses: [], critical: false, reachable: false, escalated: false, lang: null, due_within_days: null, min_age: null, max_age: null };
    ['overdue', 'slipping', 'due'].forEach(function (s) { if (findPhrase(text, w[s])) f.statuses.push(s); });
    ['critical', 'reachable', 'escalated'].forEach(function (k) { f[k] = !!findPhrase(text, w[k]); });
    ['bn', 'en'].forEach(function (l) { if (findPhrase(text, w[l])) f.lang = l; });
    for (var i = 0; i < WINDOWS.length; i++) {
      if (findPhrase(text, w[WINDOWS[i][0]])) { f.due_within_days = WINDOWS[i][1]; break; }
    }
    var lowered = String(text || '').toLowerCase();
    var over = lowered.match(/(?:over|above|older than|>)\s*(\d{2})|(\d{2})\s*\+/);
    var under = lowered.match(/(?:under|below|younger than|<)\s*(\d{2})/);
    if (over) f.min_age = parseInt(over[1] || over[2], 10);
    if (under) f.max_age = parseInt(under[1], 10);
    return f;
  }

  function describe(f) {
    var parts = [];
    if (f.statuses.length) parts.push(f.statuses.join(' or '));
    if (f.critical) parts.push('high priority or escalated');
    if (f.escalated) parts.push('escalated');
    if (f.reachable) parts.push('reachable by phone');
    if (f.due_within_days !== null) parts.push(f.due_within_days === 0 ? 'due by today' : 'due within ' + f.due_within_days + ' days');
    if (f.lang) parts.push(f.lang === 'bn' ? 'Bengali' : 'English');
    if (f.min_age) parts.push('age ' + f.min_age + '+');
    if (f.max_age) parts.push('under ' + f.max_age);
    return parts;
  }

  /* p: { status, priority_score, hasPhone, outcome, escalated, lang, age, recall (Date) } */
  function matches(p, f, today) {
    if (f.statuses.length && f.statuses.indexOf(p.status) === -1) return false;
    if (f.critical && !(p.escalated || (p.priority_score || 0) >= CRITICAL_PRIORITY)) return false;
    if (f.escalated && !p.escalated) return false;
    if (f.reachable && (!p.hasPhone || UNREACHABLE[p.outcome])) return false;
    if (f.lang && p.lang !== f.lang) return false;
    if (f.due_within_days !== null) {
      if (!p.recall) return false;
      var limit = new Date(today.getFullYear(), today.getMonth(), today.getDate() + f.due_within_days);
      if (p.recall > limit) return false;
    }
    if (f.min_age && (p.age == null || p.age < f.min_age)) return false;
    if (f.max_age && (p.age == null || p.age >= f.max_age)) return false;
    return true;
  }

  var API = { classifyReply: classifyReply, parseQuery: parseQuery, describe: describe, matches: matches, findPhrase: findPhrase };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.SmaranRules = API;
})(typeof window !== 'undefined' ? window : this);
