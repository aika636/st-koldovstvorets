import { heroWords, presetGender } from './gender.mjs';
import {
  FEED_TEXT_MAX, FACT_TEXT_MAX, MOLVA_FACTS_MAX, MOLVA_TOPICS_MAX, MIND_TOPICS, normalizeFeed, normalizeItem, normalizeThreads, addFeedItem, ensureFeed,
  feedItems, hash, feedBanter, feedRegister, feedSamples, feedReactions, pickReacts, toneKey, NO_TONE, THREADS_MAX, CALENDAR_GAP, clipText, cutWords, TEMPER_MAX,
} from './feed.mjs';
import { lastBlock } from './leak.mjs';
import { worldRealities, worldPreset, calendarNames, textKey, similar, foreignSpell, goodProfile, END_MARK } from './feed-text.mjs';
import { feedAuthors, guestsFor, mindOf, nameOfId, openTies, SHARP_TIES } from './authors.mjs';
import { knowersOf, describeKnowers, leakReason } from './knowledge.mjs';
import { assignMinds } from './romance.mjs';
import { planNotes, isMagpieName, surfaceClue, putClueOut, cluesFor, TONE_TEXT, MAGPIE } from './magpie.mjs';
import { nameStems, hasStem } from './secrets.mjs';
import { openThreads, spawnThread, startThread, settleThreads, pruneThreads, noteThreads, threadOver, isStale, isEnding, studyTopics, worldTopicsOf, CALENDAR_HORIZON } from './feed-threads.mjs';
import { bondLabel, bondOf, defaultBond, bondsOff } from './bonds.mjs';
import { holidaysOn, holidaysAhead } from './holidays.mjs';
import { normName } from './stop-names.mjs';
import { diffDays, addDays, preExamWeek, preExamWord } from './time.mjs';
import { isCardParty } from './parse-marker.mjs';

export function loversOf(state) {
  return new Set(Object.entries(normalizeFeed(state && state.feed).minds).filter(([, m]) => m.love).map(([id]) => id));
}

export const WINDOW = 20;

export const MIN_WINDOW = 6;

export const FACT_DAYS = 3;

export const MIN_LETTERS = 3;

export const SWEAR_MODES = ['off', 'mild', 'free'];
export const swearOf = (v) => (SWEAR_MODES.includes(v) ? v : 'mild');

const SWEAR_LINE = {
  off: 'Без мата и грубой ругани.',
  mild: 'Мягкая ругань (блин, чёрт, задолбало, капец, офигеть, да ну нафиг) — без мата.',
  free: 'Мат разрешён, но не обязателен; крепкие слова — из палитры ниже.',
};

export const RECENT_OWN = 3;

export const HABIT_OWN = 12;

export const RECENT_BRANCHES = 6;

export const DELTAS_KEPT = 4;

export const EVENTS_MAX = 3;

export const HOT_FRESH = 1;
export const HOT_ISSUES = 2;
export const HOT_BUDGET = 8;
export const AUTHOR_MAX = 2;
export const REST_AFTER = 2;
export const WEARY_OTHERS = 3;

export const BRANCHES_MAX = 3;
export const BRANCH_DAYS = 0;
export const BRANCH_DAYS_MAIN = 3;
export const TALK_DAYS = 5;
export const TALK_FACTS = 4;
export const BRANCH_ISSUES = 3;
export const WORN_ISSUES = 6;
export const WORN_IN = 3;
export const WORN_MAX = 6;
export const BRANCH_OPEN = 4;
export const BRANCH_REPLIES_MAX = 4;

export const ROT_WINDOW = 20;
export const HEAVY_AT = 4;
export const ROT_OTHERS = 4;
export const NEAR_JACCARD = 0.6;
export const NEAR_COMMON = 3;
export const HOT_WINDOW = 15;
export const HOT_AT = 3;
export const HOT_DROP = 5;
export const SAID_SHOWN = 10;
export const STREAK_MAX = 2;
export const SUBJECT_WINDOW = 6;

export const CHAT_MAX = 10;

export const MATES_SHOWN = 8;
export const MATES_ON_MAIN = 8;
export const MATES_MID = 3;
export const MATES_FAR = 1;
export const MATES_FELT = 3;
export const HEARTS_SHOWN = 2;
export const CHAT_FEW = 6;

export const LIFE_GAP = 4;

export const MEMORY_MAX = 2;
export const MEMORY_TEXT_MAX = 120;

const SRC = 'molva-';

const str = (v) => (typeof v === 'string' ? v.trim() : '');
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const clip = (v, max) => Array.from(str(v).replace(/\s+/g, ' ')).slice(0, max).join('').trim();
const clone = (v) => JSON.parse(JSON.stringify(v));

export function issueBudget(every) {
  const n = Math.trunc(Number(every));
  if (n === 1) return { min: 0, max: 5 };
  if (n === 2) return { min: 0, max: 6 };
  if (n >= 3) return { min: 0, max: 8 };
  return { min: 3, max: 8 };
}

export function everyOf(raw) {
  const n = Math.trunc(Number(raw));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 99) : 3;
}

export function tickMolva(state) {
  const feed = normalizeFeed(state && state.feed);
  return { ...state, feed: { ...feed, molva: { ...feed.molva, since: feed.molva.since + 1 } } };
}

export function molvaDue(state, { every = 3, manual = false } = {}) {
  if (manual) return false;
  const feed = normalizeFeed(state && state.feed);
  return feed.molva.since >= everyOf(every);
}

export function issueWorth(state, preset) {
  const feed = normalizeFeed(state && state.feed);
  const today = state && state.calendar && state.calendar.day;
  const facts = newFacts(state).all.length;
  if (facts) return { go: true, why: `новых событий: ${facts}` };
  if (openThreads(state).some((t) => threadOver(t, today) || isEnding(t))) return { go: true, why: 'в деле последний круг или событие прошло' };
  const issue = feed.molva.issue + 1;
  if (feed.molva.hot.some((h) => issue - h.issue <= HOT_FRESH)) return { go: true, why: 'чат ещё обсуждает громкое о главных' };
  const threads = openThreads(state);
  const fresh = calendarEvents(state, preset).find((e) => e.days === 0
    && !threads.some((t) => similar(t.topic, e.name))
    && !feed.molva.cal.some((c) => similar(c.topic, e.name) && issue - c.issue < CALENDAR_GAP));
  if (fresh) return { go: true, why: `идёт событие календаря: ${fresh.name}` };
  if (feed.molva.since >= LIFE_GAP) return { go: true, why: `с прошлого выпуска прошло ответов: ${feed.molva.since}` };
  return { go: false, why: 'ничего нового: ни событий, ни перемен в делах' };
}

function freshFact(x, day) {
  if (!day || !x.at || !x.at.day) return true;
  try {
    const d = diffDays(x.at.day, day);
    return Number.isFinite(d) && d >= 0 && d <= FACT_DAYS;
  } catch {
    return true;
  }
}

function factAge(x, day) {
  if (!day || !x.at || !x.at.day) return 0;
  try {
    const d = diffDays(x.at.day, day);
    return Number.isFinite(d) ? Math.max(0, d) : 0;
  } catch {
    return 0;
  }
}

const isTail = (x) => x.minor === true && !((x.about || []).includes('@heroine') && /—\s*(?:триумф|провал|оценка)/iu.test(x.gist || ''));

export function newFacts(state) {
  const feed = normalizeFeed(state && state.feed);
  const used = new Set(feed.molva.facts);
  const day = state && state.calendar && state.calendar.day;
  const list = feed.items
    .map((x, i) => ({ x, i }))
    .filter(({ x }) => x.kind === 'fact' && x.status !== 'expired' && !used.has(x.id) && freshFact(x, day) && (x.rumor || !x.private))
    .sort((a, b) => (Number(isTail(a.x)) - Number(isTail(b.x))) || (factAge(a.x, day) - factAge(b.x, day)) || ((b.x.loud ?? 1) - (a.x.loud ?? 1)) || (b.i - a.i))
    .map(({ x }) => x);
  return { open: list.filter((x) => !x.rumor), overheard: list.filter((x) => x.rumor), all: list };
}

export function mainShare(state, window = WINDOW) {
  const roots = feedItems(state).filter((x) => x.kind === 'reaction' && !x.parent).slice(-window);
  return { main: roots.filter((x) => x.heroine).length, total: roots.length };
}

export function mainRoom(state, adding, slots) {
  const { main, total } = mainShare(state);
  return (main + adding) * 3 <= Math.max(total + slots, MIN_WINDOW);
}

const keyOfItem = (x) => (x.who ? `w:${x.who}` : '');
const keyOfAuthor = (a) => `w:${a.id}`;

const OVER_HINT = 'событие уже прошло: подводят итоги, вспоминают, как всё вышло, без планов на него';

const DISPUTE_TAIL = /;[^;]*с этим не согласен\s*$/u;

const ENDING_HINT = 'дело тянется давно — в этом выпуске оно кончается: чем всё вышло (помирились, сдали, бросили, забыли)';

export function calendarEvents(state, preset) {
  const day = state && state.calendar && state.calendar.day;
  if (!day) return [];
  const out = [];
  const world = worldPreset(state, preset);
  try {
    for (const h of holidaysOn(world, day, state)) out.push({ name: clip(h.name, 90), days: 0 });
    for (const a of holidaysAhead(world, day, CALENDAR_HORIZON, state)) out.push({ name: clip(a.holiday.name, 90), days: a.days });
    if (preExamWeek(preset, state, day)) out.push({ name: clip(preExamWord(preset), 90), days: 0 });
  } catch {
    return [];
  }
  return out.filter((e) => e.name);
}

export const PAST_HORIZON = 21;

export function calendarTimeline(state, preset) {
  const day = state && state.calendar && state.calendar.day;
  if (!day) return [];
  const runs = [];
  const world = worldPreset(state, preset);
  try {
    for (let n = -PAST_HORIZON; n <= CALENDAR_HORIZON; n += 1) {
      const at = addDays(day, n);
      for (const h of holidaysOn(world, at, state)) {
        const name = clip(h.name, 90);
        if (!name) continue;
        const run = runs.find((r) => r.name === name && r.last === n - 1);
        if (run) run.last = n;
        else runs.push({ name, first: n, last: n });
      }
    }
  } catch {
    return [];
  }
  const out = [];
  for (const name of new Set(runs.map((r) => r.name))) {
    const mine = runs.filter((r) => r.name === name);
    const now = mine.find((r) => r.first <= 0 && r.last >= 0);
    const ahead = mine.filter((r) => r.first > 0).sort((a, b) => a.first - b.first)[0];
    const past = mine.filter((r) => r.last < 0).sort((a, b) => b.last - a.last)[0];
    if (now) out.push({ name, state: 'now', days: 0 });
    else if (ahead) out.push({ name, state: 'ahead', days: ahead.first });
    else if (past) out.push({ name, state: 'past', days: -past.last });
  }
  return out.sort((a, b) => (a.state === 'past' ? -a.days : a.days) - (b.state === 'past' ? -b.days : b.days));
}

const dayCount = (n) => {
  const a = n % 100;
  const b = a % 10;
  return `${n} ${a > 10 && a < 20 ? 'дней' : b === 1 ? 'день' : b > 1 && b < 5 ? 'дня' : 'дней'}`;
};

export function timelineLine(e) {
  if (e.state === 'now') return `${e.name} — идёт сейчас`;
  if (e.state === 'past') return `${e.name} — уже прошло, ${e.days === 1 ? 'вчера' : `${dayCount(e.days)} назад`}`;
  return `${e.name} — ещё не наступило, будет ${e.days === 1 ? 'завтра' : `через ${dayCount(e.days)}`}`;
}

function futureMention(text, name) {
  const words = String(name).toLowerCase().replace(/ё/g, 'е').match(/\p{L}{3,}/gu) || [];
  const t = textKey(text);
  for (const w of words) {
    const stem = w.length > 5 ? w.slice(0, -2) : w.length > 3 ? w.slice(0, -1) : w;
    const re = new RegExp(`(?:^| )(?:к|ко|на|до|перед|накануне|ждем|ждет|скоро)(?: \\p{L}+)? ${stem}\\p{L}{0,${w.length <= 5 ? 2 : 3}}(?![\\p{L}])`, 'u');
    const hit = re.exec(t);
    if (hit) return hit[0].trim();
  }
  return '';
}

export function prepareThreads(work, preset, opts = {}) {
  const day = work && work.calendar && work.calendar.day;
  settleThreads(work, day);
  const own = new Set((Array.isArray(work.events) ? work.events : []).filter((e) => e && e.auto === true).map((e) => textKey(e.name)));
  if (own.size) work.feed.threads = work.feed.threads.filter((t) => !(t.source === 'calendar' && own.has(textKey(t.topic))));
  pruneThreads(work, opts.roster);
  for (let guard = 0; guard < THREADS_MAX && openThreads(work).length < THREADS_MAX; guard += 1) {
    const res = spawnThread(work, preset, { day, stop: opts.stop, roster: opts.roster });
    if (!res.ok) break;
  }
}

function labelOf(x, state, roster) {
  if (x.chan === 'anon') return 'Сорока на хвосте';
  return nameOfId(x.who, state, roster) || 'кто-то в школе';
}

const aboutMain = (f) => (f.about || []).some((id) => id === '@heroine' || isCardParty(id));

function knowOf(f) {
  if (f.rumor) return 'знают только пересказом от того, кто подслушал: неточно';
  const reach = f.act && f.act.reach ? f.act.reach : (f.loud ?? 1) >= 2 ? 'многие' : 'неизвестно';
  if (reach === 'многие') return 'видели многие';
  if (reach === 'несколько') return 'видели несколько человек, остальные — пересказом';
  return 'кто-то видел';
}

function lastSaid(items, state, roster, threadId) {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const x = items[i];
    if (x.kind === 'reaction' && x.occ && x.occ.kind === 'affair' && x.occ.ref === threadId) return `${labelOf(x, state, roster)}: «${clip(x.text, 80)}»`;
  }
  return '';
}

function mainsOf(opts) {
  if (opts.mains) return { hero: str(opts.mains.hero), card: [].concat(opts.mains.card || []).map(str).filter(Boolean) };
  const stop = Array.isArray(opts.stop) ? opts.stop : [];
  return { hero: str((stop.find((s) => s.kind === 'user') || {}).name), card: stop.filter((s) => s.kind === 'char').map((s) => str(s.name)).filter(Boolean) };
}

const namedMains = (text, names) => names.filter((n) => mentionsStop(text, [{ kind: 'user', tokens: normName(n).split(' ') }]));

export function buildAgenda(state, preset, opts = {}) {
  const feed = normalizeFeed(state && state.feed);
  const issue = Number.isInteger(opts.issue) ? opts.issue : feed.molva.issue + 1;
  let budget = issueBudget(opts.every);
  const roster = opts.roster;
  const authors = feedAuthors(state, roster, { stop: opts.stop });
  const pool = authors;
  if (authors.filter((a) => a.role === 'student').length < 2) return { issue, budget, occasions: [], pool, lastKey: '', past: [], mainDenied: false, notOpening: [], resting: [], carriers: [], weary: [], silent: [], heavy: [], hot: [] };
  const items = feed.items;
  const roots = items.filter((x) => x.kind === 'reaction' && !x.parent);
  const lastKey = roots.length ? keyOfItem(roots[roots.length - 1]) : '';
  const today = state && state.calendar && state.calendar.day;
  const nick = new Map(authors.map((a) => [a.id, a.name]));
  const mains = mainsOf(opts);
  const allMains = [mains.hero, ...mains.card].filter(Boolean);

  const eventRoots = roots.filter((x) => x.occ && x.occ.kind === 'event').slice(-2);
  const hog = eventRoots.length === 2 ? keyOfItem(eventRoots[0]) : '';
  let notOpening = hog && keyOfItem(eventRoots[1]) === hog && authors.some((a) => keyOfAuthor(a) !== hog) ? [hog] : [];
  const prevSrc = new RegExp(`^${SRC}${issue - 1}(?:-|$)`);
  const spoke = new Map();
  for (const x of items) if (x.kind === 'reaction' && prevSrc.test(x.src || '')) spoke.set(keyOfItem(x), (spoke.get(keyOfItem(x)) || 0) + 1);
  const tired = [...spoke].filter(([, n]) => n >= REST_AFTER).map(([k]) => k);
  let resting = authors.filter((a) => !tired.includes(keyOfAuthor(a))).length >= 2 ? tired : [];

  let mainDenied = false;
  const picked = [];
  const offered = new Set(feed.molva.offered);
  for (const f of newFacts(state).all) {
    if (picked.length >= EVENTS_MAX) break;
    const loud = f.rumor ? 1 : (f.loud ?? 1);
    if (!aboutMain(f) || loud >= 2 || !offered.has(f.id) || mainRoom(state, picked.filter(aboutMain).length + 1, budget.max)) picked.push(f);
    else mainDenied = true;
  }
  const shares = (hf, f) => {
    const who = (hf.about || []).filter((id) => !aboutMain({ about: [id] }));
    const ids = who.length ? who : hf.about || [];
    return (f.about || []).some((id) => ids.includes(id));
  };
  const sameFolks = (hf) => picked.some((f) => shares(hf, f));
  const displaced = (hf) => picked.some((f) => aboutMain(f) && !shares(hf, f));
  const hot = feed.molva.hot
    .filter((h) => issue - h.issue <= HOT_ISSUES && !picked.some((f) => f.id === h.id))
    .map((h) => ({ h, f: items.find((x) => x.id === h.id && x.kind === 'fact') }))
    .filter(({ h, f }) => f && !displaced(f) && (issue - h.issue <= HOT_FRESH || sameFolks(f)))
    .map(({ f }) => f);
  const events = [...picked, ...hot].map((f) => {
    const k = roster ? knowersOf(f, state, roster) : null;
    return { f, k };
  }).map(({ f, k }) => ({
    kind: 'event', factId: f.id, hot: hot.includes(f), text: clip(f.gist || f.text, FACT_TEXT_MAX), say: f.act && f.act.say ? clip(f.act.say, 100) : '',
    know: k ? describeKnowers(k, roster) : knowOf(f), ...(k ? { knowIds: k.ids } : {}), rumor: f.rumor === true,
    ...(f.rumor === true && k ? { writer: rumorWriter(f, k, authors) } : {}), heroine: aboutMain(f), about: f.about || [], loud: f.rumor ? 1 : (f.loud ?? 1),
    type: f.act ? f.act.kind : '', linked: aboutMain(f),
  }));

  const threads = openThreads(state);
  const freshNews = events.some((e) => !e.hot);
  const affairs = threads
    .map((t, i) => ({ t, i, over: threadOver(t, today) || isEnding(t) }))
    .filter(({ t, over }) => over || !(freshNews && isStale(t)))
    .sort((a, b) => (Number(b.over) - Number(a.over)) || (Number(isStale(a.t)) - Number(isStale(b.t))) || ((b.t.idle || 0) - (a.t.idle || 0)) || (a.i - b.i))
    .map(({ t, over }) => ({
      kind: 'affair', threadId: t.id, topic: t.topic, memberIds: t.members, members: t.members.map((id) => nick.get(id)).filter(Boolean),
      want: String(t.want || '').replace(DISPUTE_TAIL, '').trim(), last: t.last, question: t.question, said: lastSaid(items, state, roster, t.id), over, ending: !threadOver(t, today) && isEnding(t), stale: isStale(t),
    }));
  const tieNames = (id) => {
    const m = mindOf(state, id);
    return [(m.love || m.fan || (m.jealous && m.jealous.to === '@heroine')) && mains.hero];
  };
  for (const a of affairs) {
    a.about = [...new Set([...namedMains([a.topic, a.want, a.last, a.question].join(' '), allMains), ...a.memberIds.flatMap(tieNames)].filter(Boolean))];
    a.linked = a.about.length > 0;
  }

  const branches = [];
  const branchLink = (x) => {
    const ref = x.occ && x.occ.ref;
    const fact = x.occ && x.occ.kind === 'event' ? items.find((f) => f.id === ref && f.kind === 'fact') : null;
    const own = x.occ && x.occ.kind === 'affair' ? (affairs.find((a) => a.threadId === ref) || {}).about || [] : [];
    const via = fact && aboutMain(fact) ? [...(fact.about.includes('@heroine') ? [mains.hero] : []), ...(fact.about.some(isCardParty) ? mains.card : [])] : [];
    const about = [...new Set([...(x.heroine ? [mains.hero] : []), ...own, ...via, ...namedMains(x.text, allMains)].filter(Boolean))];
    return { about, linked: x.heroine === true || Boolean(fact && aboutMain(fact)) || about.length > 0 };
  };
  const hasNew = (x) => x.occ && x.occ.kind === 'event' && events.some((e) => e.factId === x.occ.ref && !e.hot);
  const feel = (a) => a.fan || a.jealous || a.love;
  const feelers = authors.filter(feel).map(keyOfAuthor);
  const lifeOnly = opts.auto === true && !events.length && !affairs.some((a) => a.over || a.ending) && !feelers.length;
  const young = (x) => {
    if (!today || !x.at || !x.at.day) return true;
    try { const d = diffDays(x.at.day, today); return !Number.isFinite(d) || d <= (x.heroine ? BRANCH_DAYS_MAIN : BRANCH_DAYS); } catch { return true; }
  };
  for (let i = items.length - 1; i >= 0 && branches.length < BRANCHES_MAX; i -= 1) {
    const x = items[i];
    if (x.parent || x.kind !== 'reaction' || x.chan !== 'chat' || x.status === 'expired' || !young(x)) continue;
    if (lifeOnly && x.heroine) continue;
    const replies = items.filter((y) => y.parent === x.id);
    if (replies.length >= BRANCH_OPEN) continue;
    const rounds = new Set(replies.map(issueNo).filter(Boolean)).size;
    const argued = x.heroine === true && rounds < 2 && [keyOfItem(x), ...replies.map(keyOfItem)].some((k) => feelers.includes(k));
    if (replies.some((y) => prevSrc.test(y.src || '')) && !hasNew(x) && !argued) continue;
    if (issueNo(x) && issue - issueNo(x) > BRANCH_ISSUES && !hasNew(x)) continue;
    if (x.occ && x.occ.kind === 'affair' && !affairs.some((a) => a.threadId === x.occ.ref)) continue;
    branches.push({
      kind: 'branch', postId: x.id, author: labelOf(x, state, roster), authorKey: keyOfItem(x), text: cutWords(x.text, 90),
      replies: replies.slice(-2).map((y) => ({ author: labelOf(y, state, roster), text: cutWords(y.text, 60) })),
      lastKey: replies.length ? keyOfItem(replies[replies.length - 1]) : keyOfItem(x),
      spoke: replies.some((y) => keyOfItem(y) !== keyOfItem(x)),
      heroine: x.heroine === true, occ: x.occ || null, keys: [keyOfItem(x), ...replies.map(keyOfItem)], ...branchLink(x),
    });
  }

  const talk = [];
  if (!events.some((e) => e.heroine) && !lifeOnly && allMains.length) {
    const given = new Set(events.map((e) => e.factId));
    const recentFacts = items
      .filter((f) => f.kind === 'fact' && f.status !== 'expired' && aboutMain(f) && !given.has(f.id) && (f.rumor || !f.private) && f.at && f.at.day)
      .map((f) => { let d = NaN; try { d = diffDays(f.at.day, today); } catch {} return { f, d }; })
      .filter(({ d }) => Number.isFinite(d) && d >= 0 && d <= TALK_DAYS)
      .slice(-TALK_FACTS);
    if (recentFacts.length) {
      const when = (d) => (d === 0 ? 'сегодня' : d === 1 ? 'вчера' : `${dayCount(d)} назад`);
      talk.push({
        kind: 'talk', topic: 'о главных сейчас', linked: true, about: allMains,
        facts: recentFacts.map(({ f, d }) => `${when(d)}: ${cutWords(f.gist || f.text, 110)} (${knowOf(f)})`),
      });
    }
  }

  const calendar = calendarEvents(state, preset)
    .filter((e) => !threads.some((t) => similar(t.topic, e.name)))
    .filter((e) => !feed.molva.cal.some((c) => similar(c.topic, e.name) && issue - c.issue < CALENDAR_GAP));
  const recent = [...feed.molva.topics, ...threads.map((t) => t.topic)];
  const fresh = (t) => !recent.some((r) => similar(r, t));
  const homely = worldTopicsOf(state, preset);
  const study = studyTopics(state, preset).map((t) => t.topic);
  const topics = [...homely.filter(fresh), ...study.filter(fresh)];
  const life = [];
  if (calendar.length) life.push({ kind: 'life', topic: calendar[0].name, event: calendar[0] });
  const worthy = events.length > 0 || affairs.some((a) => a.over || a.ending);
  const burning = events.some((e) => e.heroine && e.loud >= 2);
  if (burning && budget.max < HOT_BUDGET) budget = { ...budget, max: HOT_BUDGET };
  const want = opts.auto === true && Math.trunc(Number(opts.every)) === 1 && worthy ? 1 : budget.max >= 6 ? 2 : 1;
  const lifeMax = burning && opts.auto === true ? Math.min(want, 1) : want;
  for (let k = 0; k < topics.length && life.length < lifeMax; k += 1) {
    const topic = topics[(issue - 1 + k) % topics.length];
    if (!life.some((l) => similar(l.topic, topic))) life.push({ kind: 'life', topic });
  }

  const linkedOcc = [...events, ...talk, ...affairs, ...branches].filter((o) => o.linked);
  const recentMain = roots.slice(-RECENT_BRANCHES).filter((x) => x.heroine);
  const recentKeys = recentMain.flatMap((x) => [keyOfItem(x), ...items.filter((y) => y.parent === x.id).map(keyOfItem)]);
  const memberKey = (id) => `w:${id}`;
  const involved = new Set([...recentKeys, ...branches.filter((x) => x.linked).flatMap((x) => x.keys), ...affairs.filter((x) => x.linked).flatMap((x) => x.memberIds.map(memberKey))]);
  const carriers = linkedOcc.length || recentMain.length
    ? authors.filter((a) => feel(a) || involved.has(keyOfAuthor(a))).map(keyOfAuthor)
    : [];
  const wrote = (n) => {
    const src = new RegExp(`^${SRC}${issue - n}(?:-|$)`);
    return new Set(items.filter((x) => x.kind === 'reaction' && src.test(x.src || '')).map(keyOfItem));
  };
  const [was1, was2] = [wrote(1), wrote(2)];
  const worn = carriers.filter((k) => was1.has(k) && was2.has(k));
  const others = authors.filter((a) => !worn.includes(keyOfAuthor(a)));
  const weary = others.length >= WEARY_OTHERS ? worn : [];
  resting = [...new Set([...resting.filter((k) => !carriers.includes(k)), ...weary])];
  notOpening = notOpening.filter((k) => !carriers.includes(k));
  const silent = others.filter((a) => !was1.has(keyOfAuthor(a)) && !was2.has(keyOfAuthor(a))).map(keyOfAuthor);
  const loudFirst = events.filter((e) => e.loud >= 2 && !e.hot);
  const quiet = events.filter((e) => e.loud < 2 && !e.hot);
  const lingering = events.filter((e) => e.hot);
  const prefix = { event: 'с', talk: 'т', affair: 'д', branch: 'в', life: 'б', anon: 'к' };
  const notes = planNotes(state, roster, { issue, stop: opts.stop }).map((n) => ({
    kind: 'anon', writer: n.author, target: n.target, tone: n.tone, why: n.why, fact: n.fact || '', clues: n.clues, about: n.target === '@heroine' ? ['@heroine'] : [n.target],
    targetName: n.target === '@heroine' ? '' : nameOfId(n.target, state, roster), aboutName: n.about ? nameOfId(n.about, state, roster) : '', linked: n.target === '@heroine', text: 'записка',
  }));
  const count = {};
  const occasions = [...loudFirst, ...quiet, ...notes, ...talk, ...affairs, ...lingering, ...branches, ...life].map((o) => {
    count[o.kind] = (count[o.kind] || 0) + 1;
    return { id: `${prefix[o.kind]}${count[o.kind]}`, ...o };
  });
  const people = authors.map((a) => a.full);
  const current = [...events.filter((e) => !e.hot).flatMap((e) => [e.text, e.say]), ...affairs.flatMap((a) => [a.topic, a.last]), ...life.map((l) => l.topic)];
  const motifs = wornMotifs(state, current, nameWords(pool, [...allMains, ...people]));
  const guests = guestsFor(authors, [...events.flatMap((e) => [e.text, e.say]), ...affairs.flatMap((a) => [a.topic, a.want, a.last]), ...life.map((l) => l.topic)], issue);
  const heavy = heavyAuthors(state, authors);
  const hotWords = hotMotifs(state, current, nameWords(pool, [...allMains, ...people]));
  return { issue, budget, occasions, pool, guests, heavy, hot: hotWords, lastKey, past: calendarTimeline(state, preset).filter((e) => e.state === 'past'), mainDenied, notOpening, resting, carriers, weary, silent, worn: motifs };
}

const issueNo = (x) => Number((String((x && x.src) || '').match(/^molva-(\d+)/) || [])[1]) || 0;

const MOTIF_STOP = new Set(['своими', 'своего', 'своему', 'своей', 'своих', 'своим', 'своя', 'свое', 'такой', 'такая', 'такое', 'такие', 'таких', 'такого', 'такими', 'какой', 'какая', 'какое', 'какие', 'каких', 'какого', 'всего', 'всему', 'всеми', 'этого', 'этому', 'этими', 'моего', 'моими', 'твоего', 'твоими', 'нашего', 'вашего', 'самой', 'самого', 'самая', 'самые', 'одного', 'другой', 'другая', 'другие', 'другого', 'любой', 'каждый', 'каждая', 'каждое', 'целый', 'целую', 'через', 'говорят', 'говорит', 'после', 'перед', 'между', 'около', 'возле', 'всегда', 'никогда', 'тоже', 'очень', 'будет', 'может', 'можно', 'нужно', 'только', 'опять', 'снова', 'здесь', 'тогда', 'когда', 'потом', 'сразу', 'утром', 'вечером', 'ничего', 'никто', 'всего', 'этого', 'этому', 'своей', 'своих', 'свою', 'такой', 'такая', 'какой', 'какая', 'всех', 'всеми', 'перед', 'прямо', 'сильно', 'точно', 'будто', 'чтобы', 'пусть', 'разве', 'ладно']);
const motifWords = (text, names) => wordsOf(text).filter((w) => w.length >= 5 && !COMMON_LONG.has(w) && !MOTIF_STOP.has(w) && !names.has(w));
const motifStem = (w) => w.slice(0, 5);

const VOICE_WORD_MIN = 6;
const VOICE_RE = /(?:ый|ий|ой|ая|яя|ое|ее|ые|ие|ого|его|ому|ему|ым|им|ую|юю|ых|их|ыми|ими|ей|о)$/u;

const properStems = (texts) => new Set(texts.flatMap((t) => String(t || '').match(/(?<=[\p{L}\d,;:)»"]\s+)\p{Lu}\p{L}{4,}/gu) || []).map((w) => motifStem(textKey(w))));

export function wornMotifs(state, fresh = [], names = new Set()) {
  const items = feedItems(state);
  const issue = normalizeFeed(state && state.feed).molva.issue + 1;
  const facts = new Set(items.filter((f) => f.kind === 'fact').flatMap((f) => motifWords([f.gist || f.text, f.act && f.act.say].join(' '), names).map(motifStem)));
  const now = new Set(fresh.filter(Boolean).flatMap((t) => motifWords(t, names).map(motifStem)));
  const world = properStems(items.map((x) => x.text));
  for (const n of names) if (n.length >= 5) world.add(motifStem(n));
  const seen = new Map();
  for (const x of items) {
    const n = issueNo(x);
    if (x.kind !== 'reaction' || !n || issue - n > WORN_ISSUES) continue;
    for (const w of new Set(motifWords(x.text, names))) {
      const stem = motifStem(w);
      const voice = !facts.has(stem);
      if (now.has(stem) || world.has(stem) || (voice && (w.length < VOICE_WORD_MIN || !VOICE_RE.test(w)))) continue;
      const e = seen.get(stem) || { issues: new Set(), forms: new Map(), who: new Set(), voice };
      e.issues.add(n);
      e.who.add(x.who || x.nick || '');
      e.forms.set(w, (e.forms.get(w) || 0) + 1);
      seen.set(stem, e);
    }
  }
  return [...seen.values()]
    .filter((e) => e.issues.size >= WORN_IN && (!e.voice || e.who.size >= 2))
    .sort((a, b) => b.issues.size - a.issues.size)
    .slice(0, WORN_MAX)
    .map((e) => [...e.forms].sort((a, b) => b[1] - a[1])[0][0]);
}

const reactionsOf = (state) => feedItems(state).filter((x) => x.kind === 'reaction');

export function heavyAuthors(state, authors) {
  const last = reactionsOf(state).slice(-ROT_WINDOW);
  const count = new Map();
  for (const x of last) count.set(keyOfItem(x), (count.get(keyOfItem(x)) || 0) + 1);
  const heavy = authors.map(keyOfAuthor).filter((k) => (count.get(k) || 0) >= HEAVY_AT);
  return authors.length - heavy.length >= ROT_OTHERS ? heavy : [];
}

const stemBag = (t) => new Set(wordsOf(t).filter((w) => w.length >= 4).map((w) => w.slice(0, 5)));

export function rootSubjects(items, pool, mains = []) {
  return items.filter((x) => x && x.kind === 'reaction' && !x.parent).slice(-SUBJECT_WINDOW).map((x) => {
    const set = subjectKeys(x.text, pool, mains);
    if (x.heroine) set.add('main');
    return set;
  });
}

export function nearRepeat(text, seen = []) {
  const a = stemBag(text);
  if (a.size < NEAR_COMMON) return '';
  for (const o of seen) {
    const b = stemBag(o);
    let common = 0;
    for (const w of a) if (b.has(w)) common += 1;
    if (common >= NEAR_COMMON && common / (a.size + b.size - common) >= NEAR_JACCARD) return String(o);
  }
  return '';
}

export function hotMotifs(state, fresh = [], names = new Set()) {
  const now = new Set(fresh.filter(Boolean).flatMap((t) => motifWords(t, names).map(motifStem)));
  const seen = new Map();
  for (const x of reactionsOf(state).slice(-HOT_WINDOW)) {
    for (const w of new Set(motifWords(x.text, names))) {
      const st = motifStem(w);
      if (now.has(st)) continue;
      const e = seen.get(st) || { n: 0, forms: new Map() };
      e.n += 1;
      e.forms.set(w, (e.forms.get(w) || 0) + 1);
      seen.set(st, e);
    }
  }
  return [...seen.values()].filter((e) => e.n >= HOT_AT).sort((a, b) => b.n - a.n).slice(0, WORN_MAX)
    .map((e) => ({ word: [...e.forms].sort((a, b) => b[1] - a[1])[0][0], n: e.n }));
}

export function hotHit(text, hot = [], min = 0) {
  const by = new Map(hot.filter((h) => h.n >= min).map((h) => [motifStem(h.word), h.word]));
  return wordsOf(text).filter((w) => w.length >= 5).map((w) => by.get(motifStem(w))).find(Boolean) || '';
}

export function subjectKeys(text, pool, mains = []) {
  const words = wordsOf(text);
  const out = new Set();
  const has = (name) => {
    const w = textKey(name);
    return w.length >= 4 && words.some((x) => x.startsWith(w.slice(0, Math.min(w.length, 5))));
  };
  for (const a of pool) {
    if (a.role !== 'student') continue;
    const names = [a.name, ...String(a.full || '').split(/\s+/)].filter(Boolean);
    if (names.some(has)) out.add(keyOfAuthor(a));
  }
  if (mains.some((n) => String(n).split(/\s+/).some(has))) out.add('main');
  return out;
}

export function crowdedSubjects(rootSets, max = STREAK_MAX) {
  const tail = rootSets.slice(-max);
  if (tail.length < max) return [];
  return [...tail[0]].filter((k) => tail.every((s) => s.has(k)));
}

export function wornHit(text, worn = []) {
  const stems = new Set(worn.map(motifStem));
  return wordsOf(text).find((w) => w.length >= 5 && stems.has(motifStem(w))) || '';
}

export const FACT_COPY_WORDS = 5;

export function copiesFact(text, facts = []) {
  const now = ` ${wordsOf(text).join(' ')} `;
  for (const f of facts) {
    const ws = wordsOf(f);
    for (let i = 0; i + FACT_COPY_WORDS <= ws.length; i += 1) {
      const g = ws.slice(i, i + FACT_COPY_WORDS).join(' ');
      if (now.includes(` ${g} `)) return g;
    }
  }
  return '';
}

export function planIssue(state, preset, opts = {}) {
  const work = clone(state);
  ensureFeed(work);
  assignMinds(work, opts.roster, { hero: opts.hero, preset });
  prepareThreads(work, preset, opts);
  return { work, agenda: buildAgenda(work, preset, opts) };
}

const SYSTEM = 'Ты ведёшь школьную молву в ролевой игре: разговоры в трапезной, горницах и коридорах школы волшбы. Все участники — взрослые 18+. Здесь сплетничают, влюбляются, ревнуют, спорят, защищают своих, злорадствуют и ссорятся; параллельно живут учёбой и бытом. Пиши разговор людей с личными интересами: реплики задевают собеседников и вызывают ответы. Факты и доступность сведений берутся из повестки. Отвечай только строками формата, без пояснений, вступлений и markdown.';

export const TONE_LINE = 'Тон: травли в школе нет; конфликты — ссоры, соперничество, ревность и обиды; есть и солидарность.';

export const HOT_SAMPLES = [
  'а со мной он даже не здоровается', 'ТЫ СЕЙЧАС СЕРЬЁЗНО?', 'не за неё бесишься, за себя', 'кому хочу, тому и отвечаю',
  'ещё раз это в общий кинешь — получишь', 'аааа я не могу 😭', 'ну конечно, опять ей всё можно', 'хватит делать вид, что тебе всё равно',
  'ой всё, не хочу это слушать', 'так и знал, что вы этим кончите',
];

export function toneSamples(preset, issue) {
  const n = Math.max(0, Math.trunc(Number(issue)) || 0);
  const turn = (list, step) => list.map((_, i) => list[(i + n * step) % list.length]);
  const calm = feedSamples(preset);
  const calmPick = calm.length ? turn(calm, 3).slice(0, 4) : [];
  const hotPick = turn(HOT_SAMPLES, 3).slice(0, Math.max(5, calmPick.length));
  const out = [];
  for (let i = 0; i < Math.max(calmPick.length, hotPick.length); i += 1) out.push(...[hotPick[i], calmPick[i]].filter(Boolean));
  return out;
}

const when = (days) => (days === 0 ? 'идёт сейчас' : days === 1 ? 'завтра' : `через ${days} дн.`);

function mannerBrief(manner, max = 120, said = []) {
  const m = String(manner || '').replace(/^пишет\s+/i, '').trim();
  if (!m || m.includes(END_MARK)) return '';
  const parts = m.split(/\s*[;]\s*|\.\s+/).map((x) => x.trim()).filter(Boolean)
    .map((p) => unrepeated(p, said)).filter(Boolean);
  let out = '';
  for (const p of parts) {
    const next = out ? `${out}; ${p}` : p;
    if (next.length > max) break;
    out = next;
  }
  return out || cutWords(parts[0] || m, max);
}

function unrepeated(part, said) {
  if (!said.length) return part;
  const spoken = said.map((t) => ` ${normPhrase(t)} `);
  const emoji = new Set(said.flatMap((t) => String(t).match(/\p{Extended_Pictographic}/gu) || []));
  const used = (clause) => catchphrases(clause).some((p) => spoken.some((t) => t.includes(` ${p} `)))
    || (clause.match(/\p{Extended_Pictographic}/gu) || []).some((e) => emoji.has(e));
  return part.split(/,\s*/).filter((c) => !used(c)).join(', ');
}

function rolePhrase(a, roster) {
  if (a.role === 'student') {
    const house = roster && roster.house(a.house);
    return [a.gender === 'f' ? 'ученица' : 'ученик', a.grade && `${a.grade} класса`, house && house.name].filter(Boolean).join(' ');
  }
  if (a.role === 'teacher') return `преподаватель${a.post ? ` (${clip(a.post, 50)})` : ''}`;
  return clip(a.post, 60) || 'работник школы';
}

function feelings(a, state, roster, mains, preset) {
  const w = heroWords(presetGender(preset));
  const f = a.gender === 'f';
  const out = [];
  if (a.fan) out.push(`${f ? 'фанатка' : 'фанат'} ${w.heroGen}: восхищается ${w.her} выходками, защищает, не жалеет`);
  if (a.love) out.push(`${f ? 'влюблена' : 'влюблён'} в ${w.heroAcc}${a.love === 'careful' ? ', но таит это' : ', не прячет'}`);
  const j = a.jealous;
  if (j) {
    const over = j.over ? nameOfId(j.over, state, roster) : '';
    if (j.kind === 'love') out.push(`ревнует романтически${over ? `: любит ${over}` : ''}, колет ${w.heroAcc}`);
    else if (j.kind === 'friend') out.push(`ревнует по-дружески${over ? `: боится потерять ${over}` : ''}, косится на ${w.heroAcc}`);
    else out.push(`ревнует к положению: задевает, когда ${w.heroAcc} зовут, выбирают и доверяются ${w.herDat} раньше`);
  }
  return out;
}

function tiesIn(a, roster, chatIds) {
  const p = roster && roster.get(a.id);
  if (!p) return [];
  const names = (kinds) => openTies(p).filter((t) => kinds(t) && chatIds.has(t.to)).map((t) => ({ t, name: nameOfId(t.to, null, roster) })).filter((x) => x.name);
  const sharp = names((t) => SHARP_TIES.has(t.kind)).slice(0, 2).map(({ t, name }) => `${t.kind === 'rival' ? 'соперничество' : t.kind === 'ex' ? 'в прошлом вместе' : 'не ладят'}: ${name}${t.note ? ` (${clip(t.note, 40)})` : ''}`);
  const warm = names((t) => t.kind === 'close' || t.kind === 'twin' || t.kind === 'sibling').slice(0, 2).map(({ name }) => name);
  return [...sharp, ...(warm.length ? [`близкие: ${warm.join(', ')}`] : [])];
}

const mannerOfVoice = (a) => (a && a.voice && a.voice.speech) || '';

function voiceBrief(a) {
  const v = a.voice;
  const parts = [v.surface, v.notices && `замечает: ${v.notices}`, v.bias && `пристрастен: ${v.bias}`, v.tactic && `приём: ${v.tactic}`, mannerOfVoice(a) && `как пишет: ${mannerBrief(mannerOfVoice(a), 120)}`];
  return parts.filter(Boolean).join('; ');
}

function rumorWriter(f, k, authors) {
  const near = authors.filter((a) => (a.role === 'student' || a.role === 'staff') && ['near', 'duty'].includes(k.how.get(a.id)));
  const pool = near.length ? near : authors.filter((a) => a.role === 'student' && a.tier === 'near');
  if (!pool.length) return '';
  return pool[parseInt(hash(f.id), 36) % pool.length].id;
}

function authorLine(a, state, preset, ctx, said = [], onMain = false) {
  const { roster, mains, chatIds } = ctx;
  const field = (v, max) => goodProfile(v, { min: 2, max });
  let rel = '';
  const mate = a.role === 'student' ? ((state && state.classmates) || []).find((c) => c && c.id === a.id) : null;
  if (mate && !bondsOff(state) && bondOf(state, a.id).tag !== defaultBond('student', { known: mate.known }).tag) rel = bondLabel(state, a.id);
  const threads = openThreads(state).filter((t) => t.members.includes(a.id));
  const affair = threads.map((t) => (t.owner && t.owner !== a.id && / хочет: /.test(t.want) && nameOfId(t.owner, state, roster) ? `${t.topic} (цель: ${nameOfId(t.owner, state, roster)})` : t.topic));
  const hw = heroWords(presetGender(preset));
  const head = [
    rolePhrase(a, roster),
    ...feelings(a, state, roster, mains, preset),
    rel && `к ${hw.heroDat}: ${rel}`,
    affair.length && `дело: ${affair.join(' / ')}`,
    ...(tiesIn(a, roster, chatIds).length ? [`связь: ${tiesIn(a, roster, chatIds).join(', ')}`] : []),
    a.interests.length && onMain && `живёт: ${a.interests.slice(0, 2).join(', ')}`,
    a.topics.length && `недавно говорил(а) о: ${a.topics.join('; ')}`,
  ].filter(Boolean);
  const v = a.voice;
  const voice = [
    field(v.surface, 70),
    field(v.notices, 100) && `замечает: ${field(v.notices, 100)}`,
    field(v.bias, 100) && `пристрастен: ${field(v.bias, 100)}`,
    field(v.tactic, 100) && `приём: ${field(v.tactic, 100)}`,
    field(v.limits, 110) && `не станет: ${field(v.limits, 110)}`,
  ].filter(Boolean);
  const brief = mannerBrief(v.speech, 130, said);
  return `— ${a.name} | кто: ${head.join('; ') || '—'}${voice.length ? ` | характер: ${voice.join('; ')}` : ''}${brief ? ` | как пишет: ${brief}` : ''}`;
}

function chatAuthors(agenda, own, lovers = new Set()) {
  const out = chatPool(agenda, own, lovers);
  const inEvents = new Set(agenda.occasions.filter((o) => o.kind === 'event').flatMap((o) => o.about || []));
  const inAffair = new Set(agenda.occasions.filter((o) => o.kind === 'affair').flatMap((o) => o.memberIds || []));
  const inBranch = new Set(agenda.occasions.filter((o) => o.kind === 'branch').map((o) => o.authorKey));
  const rest = new Set([...(agenda.resting || []), ...(agenda.weary || []), ...(agenda.notOpening || []), ...(agenda.heavy || [])]);
  const kept = out.filter((a) => !rest.has(keyOfAuthor(a)) || inEvents.has(a.id) || inAffair.has(a.id) || inBranch.has(keyOfAuthor(a)));
  return kept.length >= CHAT_FEW ? kept : out;
}

function chatPool(agenda, own, lovers) {
  const occ = agenda.occasions;
  const carriers = new Set(agenda.carriers || []);
  const weary = new Set(agenda.weary || []);
  const fresh = (a) => !weary.has(keyOfAuthor(a));
  const inAffair = new Set(occ.filter((o) => o.kind === 'affair').flatMap((o) => o.memberIds || []));
  const inBranch = new Set(occ.filter((o) => o.kind === 'branch').map((o) => o.authorKey));
  const hasBusiness = (a) => inAffair.has(a.id) || inBranch.has(keyOfAuthor(a));
  const inEvents = new Set(occ.filter((o) => o.kind === 'event').flatMap((o) => o.about || []));
  const lastAt = (a) => own.reduce((at, x, i) => (keyOfItem(x) === keyOfAuthor(a) ? i : at), -1);
  const talked = (a) => own.slice(-ROT_WINDOW).filter((x) => keyOfItem(x) === keyOfAuthor(a)).length;
  const quiet = (list) => list.map((a, i) => ({ a, i, at: lastAt(a), n: talked(a) })).sort((x, y) => x.n - y.n || x.at - y.at || x.i - y.i).map(({ a }) => a);
  const students = agenda.pool.filter((a) => a.role === 'student');
  const onMain = occ.some((o) => o.kind === 'event' && o.heroine);
  const max = onMain ? MATES_ON_MAIN : MATES_SHOWN;
  const inLove = onMain ? quiet(students.filter((a) => lovers.has(a.id))).slice(0, 2) : [];
  const felt = quiet(students.filter((a) => carriers.has(keyOfAuthor(a)) && fresh(a))).slice(0, MATES_FELT);
  const tier = (t) => quiet(students.filter((a) => a.tier === t && fresh(a)));
  const hearts = quiet(students.filter((a) => (a.love || a.fan || a.jealous) && fresh(a))).slice(0, HEARTS_SHOWN);
  const heavy = new Set(agenda.heavy || []);
  const knowing = new Set(occ.filter((o) => o.kind === 'event' && !o.hot).flatMap((o) => o.knowIds || []));
  const knowers = quiet(students.filter((a) => knowing.has(a.id) && !heavy.has(keyOfAuthor(a)))).slice(0, 2);
  const forced = [...new Set([...inLove, ...felt, ...hearts, ...knowers, ...students.filter(hasBusiness), ...students.filter((a) => inEvents.has(a.id))])].slice(0, max);
  const farNow = agenda.issue % 2 === 0 ? MATES_FAR : 0;
  const rest = (list, n) => list.filter((a) => !forced.includes(a)).slice(0, Math.max(0, n));
  const room = Math.max(2, max - forced.length - MATES_MID - farNow);
  const shown = [...forced, ...rest(tier('near'), room), ...rest(tier('mid'), MATES_MID), ...rest(tier('far'), farNow)];
  const guests = agenda.pool.filter((a) => (agenda.guests || []).includes(a.id));
  return [...shown, ...guests.filter((g) => !shown.includes(g))];
}

const aboutMark = (o) => (o.linked && o.kind !== 'event' ? ` — о ${(o.about || []).join(' и ') || 'главных'}` : '');

function occasionLine(o) {
  if (o.kind === 'event' && o.hot) {
    return `${o.id} — ещё обсуждают: ${o.text}. Кто знает: ${o.know}. Все уже слышали — только новое отношение, спор или последствие.`;
  }
  if (o.kind === 'event') {
    return `${o.id} — ${o.text}.${o.say ? ` Деталь: «${o.say}».` : ''} Кто знает: ${o.know}.${o.loud >= 2 ? ' Громкое.' : ''}${o.rumor && o.writer ? ' Пишет «Сорока»: в колонке «автор» — «Сорока», подписи нет.' : ''}`;
  }
  if (o.kind === 'anon') {
    const who = o.target === '@heroine' ? 'героиня' : o.targetName;
    const warn = o.tone === 'warn' && o.aboutName ? `; остеречь от: ${o.aboutName}` : '';
    return `${o.id} — записка в «Сороке на хвосте». Адресат или цель: ${who}${warn}. Тон: ${TONE_TEXT[o.tone] || TONE_TEXT.sharp}. Повод: ${o.why}. Подписи нет: в колонке «автор» — «Сорока», имя автора в тексте не называй.`;
  }
  if (o.kind === 'talk') {
    return `${o.id} — что известно о главных сейчас — о ${o.about.join(' и ')}: ${o.facts.join('; ')}.`;
  }
  if (o.kind === 'affair') {
    const bits = [
      o.members.length && `участвуют: ${o.members.join(', ')}`,
      o.want && `суть: ${o.want}`,
      o.last && `последнее: ${o.last}`,
      o.question && `открытый вопрос: ${o.question}`,
      o.said && `в чате было: ${o.said}`,
      o.ending ? ENDING_HINT : o.over && OVER_HINT,
      o.stale && !o.over && 'давно без новостей — можно закрыть или забыть',
    ].filter(Boolean);
    return `${o.id} — ${o.topic}${aboutMark(o)}${bits.length ? `; ${bits.join('; ')}` : ''}`;
  }
  if (o.kind === 'branch') {
    return `${o.id} — пост ${o.author}: «${o.text}»${o.replies.map((r) => ` → ${r.author}: «${r.text}»`).join('')}${aboutMark(o)}`;
  }
  if (o.event) return `${o.id} — Календарь: «${o.topic}» — ${when(o.event.days)}`;
  return `${o.id} — быт: ${o.topic}`;
}

const PALETTE_RECENT = 40;

const stemsOf = (s) => normPhrase(s).split(' ').filter((w) => w.length >= 4).map((w) => w.slice(0, 5));

export function soundedBefore(entry, recent = []) {
  const phrase = ` ${normPhrase(entry)} `;
  const stems = stemsOf(entry);
  return recent.some((t) => {
    if (` ${normPhrase(t)} `.includes(phrase)) return true;
    const have = new Set(stemsOf(t));
    return stems.length > 0 && stems.every((w) => have.has(w));
  });
}

export function banterPalette(preset, issue, mode, recent = []) {
  const b = feedBanter(preset);
  const fresh = (list) => list.filter((e) => !soundedBefore(e, recent));
  const mix = (a, b) => { let h = Math.imul(a ^ b, 0x9e3779b1); h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); return (h ^ (h >>> 13)) >>> 0; };
  const pick = (list, n, tag) => fresh(list).map((t) => ({ t, k: mix(parseInt(hash(`${tag}:${t}`), 36) | 0, (Number(issue) || 0) * 7919) })).sort((x, y) => x.k - y.k).slice(0, n).map((x) => x.t);
  const free = mode === 'free';
  const on = mode !== 'off';
  const rows = [
    ['сленг', pick(b.slang, 3 + (Number(issue) % 2), 's')],
    ['способы поссориться', pick(b.quarrel, 2, 'q')],
    ['послать', on ? pick([...b.dismiss_mild, ...(free ? b.dismiss_free : [])], 2, 'd') : []],
    ['обозвать', on ? pick([...b.insults_mild, ...(free ? b.insults_free : [])], 2, 'i') : []],
    ['подколка про мать (редко, только в злой ссоре)', on && Number(issue) % 2 === 0 ? pick(b.mom, 1, 'm') : []],
  ].filter(([, list]) => list.length);
  if (!rows.length) return [];
  return ['Палитра мира, необязательный выбор:', ...rows.map(([name, list]) => `${name}: ${list.join(' · ')}`)];
}

export function buildMolvaPrompt(state, preset, agenda, opts = {}) {
  const lines = [];
  const w0 = heroWords(presetGender(preset));
  const real = worldRealities(state, preset);
  if (real.length) lines.push('Мир:', ...real.map((r) => `— ${r}`), '');
  const day = state && state.calendar && state.calendar.day;
  if (opts.statusLine || day) lines.push(`Сегодня: ${opts.statusLine || day}.`);
  const line = calendarTimeline(state, preset);
  const cal = [...new Set([...calendarNames(state, preset), ...line.map((e) => e.name)])];
  lines.push(cal.length
    ? `Календарь мира (праздники и события есть только эти, других не выдумывай): ${cal.join('; ')}.`
    : 'В календаре мира нет ни праздников, ни событий: не выдумывай их.');
  if (line.length) lines.push('Календарь относительно сегодня:', ...line.map((e) => `— ${timelineLine(e)}`));
  lines.push(TONE_LINE, '');

  const own = feedItems(state).filter((x) => x.kind === 'reaction');
  lines.push(`Как говорят в школе: ${feedRegister(preset)}`);
  const samples = toneSamples(preset, agenda.issue);
  if (samples.length) lines.push(`Образцы тона — не темы и не готовые фразы: ${samples.map((x) => `«${x}»`).join(' · ')}`);
  const heroName = str(opts.mains && opts.mains.hero);
  const cardNames = [...new Set(((opts.mains && opts.mains.card) || []).map(str).filter(Boolean))];
  const card = cardNames.join(', ');
  const fd = normalizeFeed(state && state.feed);
  if (heroName || cardNames.length) {
    const cardPart = cardNames.length && `${card} — персонаж карточки`;
    lines.push('', `Главные: ${[heroName && `${heroName} — ${w0.hero} игрока`, cardPart].filter(Boolean).join('; ')}.`);
  }
  const temper = goodProfile(fd.heroineTemper, { min: 8, max: TEMPER_MAX });
  if (temper) lines.push(`${heroName || cap(w0.hero)}: ${temper}`);
  const mains = { hero: heroName, card: cardNames };
  const roster = opts.roster;
  const lovers = loversOf(state);
  lines.push('', 'Кто говорит в школе (пишут только они, кто и сколько — решаешь ты):');
  const onMain = (agenda.occasions || []).some((o) => o.kind === 'event' && o.heroine);
  const chat = chatAuthors(agenda, own, lovers);
  const ctx = { roster, mains, chatIds: new Set(chat.map((a) => a.id)) };
  for (const a of chat) {
    const last = own.filter((x) => keyOfItem(x) === keyOfAuthor(a)).slice(-RECENT_OWN);
    lines.push(authorLine(a, state, preset, ctx, last.map((x) => x.text), onMain));
  }
  const clash = [];
  for (const a of chat) {
    for (const t of openTies(roster && roster.get(a.id))) {
      if (!SHARP_TIES.has(t.kind) || !ctx.chatIds.has(t.to)) continue;
      const pair = [a.id, t.to].sort().join('|');
      if (!clash.some(([k]) => k === pair)) clash.push([pair, `${a.name} и ${nameOfId(t.to, state, roster)}`]);
    }
  }
  if (clash.length) lines.push(`Старые счёты (можно столкнуть лбами): ${clash.map(([, t]) => t).join('; ')}.`);
  const writers = agenda.occasions.filter((o) => o.kind === 'anon' || (o.kind === 'event' && o.rumor && o.writer));
  if (writers.length) {
    lines.push('', `Голоса записок «${MAGPIE}» (подписи нет, имя автора в текст не попадает):`);
    for (const o of writers) {
      const a = agenda.pool.find((x) => x.id === o.writer);
      if (a) lines.push(`— ${o.id}: ${voiceBrief(a)}`);
    }
  }
  lines.push('');

  const items = feedItems(state);
  const inBranches = new Set(agenda.occasions.filter((o) => o.kind === 'branch').map((o) => o.postId));
  const roots = items.filter((x) => x.kind === 'reaction' && !x.parent && !inBranches.has(x.id)).slice(-RECENT_BRANCHES);
  if (roots.length) {
    lines.push('Недавно в молве (для контекста):');
    for (const r of roots) {
      const reps = items.filter((y) => y.parent === r.id).slice(0, 2);
      const who = (x) => labelOf(x, state, roster);
      lines.push(`— ${who(r)}: «${cutWords(r.text, 80)}»${reps.map((y) => ` → ${who(y)}: «${cutWords(y.text, 60)}»`).join('')}`);
    }
    lines.push('');
  }

  const saidNow = own.slice(-SAID_SHOWN);
  if (saidNow.length) {
    lines.push('Уже сказано — не повторяй ни слов, ни мысли, ни образа, у каждого должна быть своя новая реплика:');
    for (const x of saidNow) lines.push(`— ${labelOf(x, state, roster)}: «${cutWords(x.text, 70)}»`);
    lines.push('');
  }
  if ((agenda.hot || []).length) lines.push(`Эти темы уже обсосали, к ним не возвращайся: ${agenda.hot.map((h) => h.word).join(', ')}.`, '');
  const crowd = crowdedSubjects(rootSubjects(own, agenda.pool, [heroName, ...cardNames].filter(Boolean)));
  if (crowd.length) {
    const nm = crowd.map((k) => (k === 'main' ? heroName || cap(w0.hero) : (agenda.pool.find((a) => keyOfAuthor(a) === k) || {}).name)).filter(Boolean);
    if (nm.length) lines.push(`Последние посты подряд были про: ${nm.join(', ')}. Новый пост об этом человеке — только с другим отношением; говорите о ком-то другом или о деле.`, '');
  }

  const { min, max } = agenda.budget;
  lines.push('Поводы выпуска:', ...agenda.occasions.map(occasionLine), '');
  lines.push(min > 0 ? `В выпуске от ${min} до ${max} сообщений (посты и ответы вместе).` : `До ${max} сообщений (посты и ответы вместе).`, '');

  const branchIds = agenda.occasions.filter((o) => o.kind === 'branch').map((o) => o.id);
  const pal = feedReactions(preset);
  const toneList = [...new Set(pal.map((p) => p.tone))];
  const col = pal.length ? NO_TONE : '';
  const [nameA, nameB] = [chat[0], chat[1] || chat[0]].map((a) => (a ? a.name : 'Автор'));
  lines.push(
    'Формат, по строке на сообщение:',
    'id | родитель | автор | отклик | повод | текст',
    `id — номер сообщения выпуска (1, 2, 3…). Родитель — пусто у нового поста, иначе номер сообщения этого выпуска${branchIds.length ? `; ${branchIds.join(', ')} — старая ветка из поводов` : ''}. Повод — id повода (с1, д1, б1…), обязателен у нового поста.`,
    pal.length
      ? `Отклик — одно слово из списка: ${toneList.join(', ')} — или «${NO_TONE}»: как отреагирует чат на реплику, а не тон автора; выбирай по содержанию реплики, не по обстановке.`
      : 'Колонку отклика оставь пустой.',
    `Текст — одна реплика, не длиннее ${FEED_TEXT_MAX - 20} знаков; слова целые, без вставок внутрь слов.`,
    'Автор — имя из списка выше, как там написано. Пример формы (имена условные, пиши от людей из списка и их голосами):',
    `1 |  | ${nameA} | ${col} | д1 | ты зачем это на всю горницу выложил?? я теперь с ним вообще не разговариваю`,
    `2 | 1 | ${nameB} | ${col} |  | ооо, началось. я же говорил, что вы этим кончите 😏`,
    `3 | 1 | ${nameA} | ${col} |  | тебя не спрашивали!! лучше скажи, кто забрал мой конспект`,
    `4 |  | ${nameB} | ${col} | б1 | не отдам ему конспект, пусть хоть на коленях просит`,
    ...(branchIds.length ? [`5 | в1 | ${nameA} | ${col} |  | ты про вчерашнее?? он сам виноват вообще`] : []),
    `Если в деле что-то сдвинулось, перед строкой «${END_MARK}» можно добавить строки памяти (не больше ${MEMORY_MAX}): Д | д1 или новое | имя участника | что изменилось, до ${MEMORY_TEXT_MAX} знаков`,
    `Последняя строка — «${END_MARK}».`,
    '',
  );

  const palette = banterPalette(preset, agenda.issue, swearOf(opts.swear), own.slice(-PALETTE_RECENT).map((x) => x.text));
  const rules = [
    'Это живая школьная молва людей этого мира, не вежливый пересказ. У участников свои желания, привязанности, обиды и дела; каждый говорит своим голосом из списка.',
    'Начни со свежего доступного события. На громкое событие дай несколько связанных реакций людей, которым оно небезразлично. Чат уже слышал, что случилось: люди не пересказывают событие, а отзываются на него — что чувствуют, кого винят, что это меняет для них, что будет дальше; подробность события звучит только внутри своей реакции.',
    'Факты бери из повестки. Сохраняй, кто что сделал, кому, где и когда; не добавляй произошедших действий и результатов. Кого наказали, позвали или выбрали — только как в повестке: автор не вписывает себя в чужое событие.',
    'Каждый знает только то, что мог узнать: участник и свидетель события, тот, кто был рядом (на уроке — класс, в крыле — горница), друзья и близкие — со слов, персонал — по своему делу. О событии говорят только названные в «Кто знает»; остальные его не обсуждают.',
    'Тайны людей, их тяжёлые беды (горе, болезни, зависимости, семейные разрывы) и всё, чего нет в повестке, в молву не выносятся даже намёком.',
    `Записки «${MAGPIE}» и подслушанное пишутся без подписи, голосом их автора из блока «Голоса записок»; в колонке «автор» — «Сорока», имя автора и прямые намёки на него в тексте запрещены. Против одного человека серии записок нет: повод выбран заранее.`,
    'Мотивы и отношения можно толковать пристрастно. Догадка о мотиве не становится фактом или новым эпизодом.',
    'Выбирай автора по связи с поводом и осведомлённости. Участник события может отвечать за себя.',
    `От имени ${w0.heroGen} игрока и персонажа карточки не пиши. Их обсуждают только в поводах, где они указаны («— о …»); в бытовых поводах их не называют. Никто в школе не знает, что это игра.`,
    'В реплике слышна личная ставка: восторг, обида, ревность, страх, нежность, злорадство, желание защитить или задеть. Радость и восхищение могут быть столь же громкими, как злость.',
    'Ответ цепляется за конкретные слова собеседника: спорит, уточняет, подкалывает, признаётся, поддерживает, отказывается или требует ответа.',
    'Чувство может сохраняться несколько выпусков. Продолжение добавляет новый ход, а не повторяет прежнюю позицию.',
    `На публичную близость ${w0.heroGen} с кем-то реагирует хотя бы один осведомлённый, у кого в списке есть «ревнует» или «влюблён»: лично, по своему мотиву и голосу. Влюблённость, ревность и желание контролировать — разные состояния; собственничество не подают как доказательство любви.`,
    'Про одного человека подряд не больше двух постов. Отношение к нему разное: любопытство, симпатия, шутка, защита, удивление, зависть, колкость — не одна колкость хором. Если кто-то уже съязвил, следующий отзывается иначе или заступается; стаей на одного не накидываются, ругань не копится выпуск за выпуском. Новенькую в первые дни встречают интересом, расспросами и теплом, а не «собьём спесь»; проступок обсуждают один-два раза, дальше жизнь идёт.',
    'Слова, образы и реплики, которые уже звучали («Уже сказано»), не повторяй, даже перефразируя: у каждого автора своя новая мысль. Если нового сказать нечего, молчи.',
    'Конфликт может остаться открытым. Примирение и одёргивание возникают из желания участника, а не ради завершения выпуска.',
    'Собственные дела соседствуют со скандалом, не гася его: у них есть участники и конкретное желание, просьба или спор. Пока есть события (с…), большая часть сообщений о них; дела и быт — фон.',
    'Пиши преимущественно коротко, разговорно, по голосу автора («как пишет»): длину и заглавные соблюдай всегда, остальные привычки не обязаны проявляться все сразу.',
    `Капс, обрывки, эмодзи и мат используй по чувству момента и настройкам. ${SWEAR_LINE[swearOf(opts.swear)]} Ругань усиливает смысл, голоса участников остаются разными.${palette.map((l) => `\n   ${l}`).join('')}`,
    `Соблюдай реалии, календарь («Календарь относительно сегодня») и полномочия людей этого мира: прошедшее — в прошедшем времени, преподаватели говорят редко и по делу, ученики не принимают решений за администрацию. Мобильных и интернета нет: слухи ходят устно, запиской, с сорокой. Только заклинания и термины этого мира, ничего из известных книг и фильмов.`,
    'Учитывай состояние дел: выполненное не требуй заново, закрытое продолжай только при новом основании.',
    'В память записывай только подтверждённое изменение дела. Мнения о главных остаются мнениями.',
    `Соблюдай формат и бюджет сообщений. Не заполняй бюджет пустыми репликами; если доступных содержательных продолжений нет, ответь одной строкой «${END_MARK}».`,
  ];
  lines.push('Правила:', ...rules.map((r, i) => `${i + 1}. ${r}`));
  return { system: SYSTEM, user: lines.join('\n') };
}

export function catchphrases(manner) {
  const out = [];
  for (const m of String(manner == null ? '' : manner).matchAll(/[«"“„]([^»"”“]{3,40})[»"”]/gu)) {
    const p = normPhrase(m[1]);
    if (p && !out.includes(p)) out.push(p);
  }
  return out;
}

const normPhrase = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

const mannerOf = (a) => (a && a.voice && a.voice.speech) || '';

export function overusedCatchphrase(text, author, history, said) {
  const phrases = catchphrases(mannerOf(author));
  if (!phrases.length) return '';
  const key = keyOfAuthor(author);
  const past = [
    ...(Array.isArray(history) ? history : []).filter((x) => x && x.kind === 'reaction' && keyOfItem(x) === key).map((x) => x.text),
    ...((said && said.get(key)) || []),
  ].slice(-2);
  if (past.length < 2) return '';
  const now = normPhrase(text);
  return phrases.find((p) => now.includes(p) && past.every((x) => normPhrase(x).includes(p))) || '';
}

export function tailEmoji(text) {
  const m = String(text == null ? '' : text).match(/(?:\p{Extended_Pictographic}[️‍\u{1F3FB}-\u{1F3FF}]*\s*)+$/u);
  return m ? [...new Set(m[0].match(/\p{Extended_Pictographic}/gu))] : [];
}

const COMMON_LONG = new Set(['который', 'которая', 'которые', 'которых', 'которого', 'вообще', 'просто', 'сегодня', 'сейчас', 'теперь', 'конечно', 'наверное', 'вместе', 'почему', 'значит', 'нормально', 'кстати', 'спасибо', 'пожалуйста', 'потому', 'поэтому', 'завтра', 'вчера']);

const SWEAR_RE = /(?<![\p{L}])(?:бля\p{L}*|ху[йяеи]\p{L}*|пизд\p{L}*|еб[аоуыё]\p{L}*|сук[аиу]|муда\p{L}*|дерьм\p{L}*|говн\p{L}*|чёрт\p{L}*|черт\p{L}*|блин|задолб\p{L}*|капец|дебил\p{L}*|идиот\p{L}*|придур\p{L}*|дура\p{L}*|тупиц\p{L}*|мразь)/giu;
const swearsOf = (t) => [...new Set((String(t).toLowerCase().replace(/ё/g, 'е').match(SWEAR_RE) || []).map((w) => w.slice(0, 5)))];

const openingKey = (t, names = new Set()) => {
  const w = wordsOf(t)[0] || '';
  return w.length >= 4 && !names.has(w) ? w : '';
};

export const nameWords = (pool, mains = []) => new Set([...pool.map((a) => a.name), ...mains].flatMap((n) => [...wordsOf(n), ...habitWords(n)]).filter((w) => w.length >= 3));

const habitWords = (s) => textKey(String(s == null ? '' : s).replace(/(\p{L})-(?=\p{L})/gu, '$1')).split(' ').filter(Boolean);

export const PET_WORD_IN = 3;

export function addressees(text, pool, self = '') {
  const t = String(text || '').toLowerCase().replace(/ё/g, 'е');
  const out = new Set();
  for (const a of pool) {
    const k = keyOfAuthor(a);
    if (k === self) continue;
    const proper = String(a.name || '').split(/[\s-]+/).filter((p) => /^\p{Lu}/u.test(p)).map((p) => textKey(p));
    for (const w of [...new Set([...proper, textKey(a.name)])]) {
      if (w.length < 3) continue;
      const re = new RegExp(`(?:(?:^[^\\p{L}]*|[.!?…]\\s*)${w}\\s*(?:[,!]|(?:ты|вы)(?![\\p{L}]))|,\\s*${w}\\s*(?:[,!?.…)]|$))`, 'u');
      if (re.test(t)) { out.add(k); break; }
    }
  }
  return [...out];
}

export function openings(texts, names = new Set()) {
  const seen = new Set();
  const out = [];
  for (const t of texts) {
    const k = openingKey(t, names);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(String(t).replace(/^[^\p{L}]+/u, '').split(/[^\p{L}'’-]/u)[0]);
  }
  return out;
}

export function repeatedStyle(text, author, history, said) {
  if (!author) return '';
  const key = keyOfAuthor(author);
  const past = [
    ...(Array.isArray(history) ? history : []).filter((x) => x && x.kind === 'reaction' && keyOfItem(x) === key).map((x) => x.text),
    ...((said && said.get(key)) || []),
  ];
  if (!past.length) return '';
  const rare = (t) => wordsOf(t).filter((w) => w.length >= 7 && !COMMON_LONG.has(w));
  const stems = (t) => new Set(rare(t).map((w) => w.slice(0, 6)));
  for (const old of past.slice(-2)) {
    const was = stems(old);
    const hit = rare(text).find((w) => was.has(w.slice(0, 6)));
    if (hit) return `слово «${hit}» уже было у «${author.name}» в последних репликах`;
  }
  const oath = swearsOf(text);
  const seen = past.slice(-2).flatMap(swearsOf);
  const again = oath.find((w) => seen.includes(w));
  if (again) return `ругательство «${again}» уже было у «${author.name}» в последних репликах`;
  return '';
}

export const FORMULA_LETTERS = 10;
export const FORMULA_ISSUES = 3;

const formulaGrams = (t, names) => {
  const ws = habitWords(t);
  const out = new Set();
  for (const n of [4, 3, 2]) {
    for (let i = 0; i + n <= ws.length; i += 1) {
      const g = ws.slice(i, i + n);
      if (g.join('').length >= FORMULA_LETTERS && !g.some((w) => names.has(w)) && g.some((w) => w.length >= 5 && !COMMON_LONG.has(w) && !MOTIF_STOP.has(w))) out.add(g.join(' '));
    }
  }
  return out;
};

export function repeatedFormula(text, author, history, said, names = new Set(), issue = 0) {
  if (!author) return '';
  const key = keyOfAuthor(author);
  const past = [
    ...(Array.isArray(history) ? history : []).filter((x) => x && x.kind === 'reaction' && keyOfItem(x) === key && (!issue || issue - issueNo(x) <= FORMULA_ISSUES)).map((x) => x.text),
    ...((said && said.get(key)) || []),
  ];
  if (!past.length) return '';
  const was = new Set(past.flatMap((t) => [...formulaGrams(t, names)]));
  return [...formulaGrams(text, names)].sort((a, b) => b.split(' ').length - a.split(' ').length).find((g) => was.has(g)) || '';
}

const FORCE_STEMS = ['удари', 'влеп', 'шлепн', 'толкн', 'оттолкн', 'схвати', 'поцелов', 'обнял', 'облил', 'пнул', 'швырн', 'отшвырн', 'укусил'];

export function swappedAction(text, facts = []) {
  const words = wordsOf(text);
  const stemOf = (w) => { const k = textKey(w); return k.slice(0, k.length <= 4 ? Math.max(2, k.length - 1) : 4); };
  const has = (stem, before, after) => words.some((w, j) => w.startsWith(stem)
    && words.slice(Math.max(0, j - 3), j).some((x) => x.startsWith(before))
    && words.slice(j + 1, j + 4).some((x) => x.startsWith(after)));
  const triples = [];
  for (const f of facts) {
    const toks = String(f).match(/\p{L}+/gu) || [];
    toks.forEach((tok, i) => {
      const stem = FORCE_STEMS.find((s) => textKey(tok).startsWith(s));
      if (!stem) return;
      const a = toks.slice(Math.max(0, i - 2), i).reverse().find((w) => /^\p{Lu}/u.test(w));
      const b = toks.slice(i + 1, i + 3).find((w) => /^\p{Lu}/u.test(w));
      if (a && b && stemOf(a) !== stemOf(b)) triples.push({ stem, a, b, as: stemOf(a), bs: stemOf(b), tok });
    });
  }
  const swapped = triples.find((t) => has(t.stem, t.bs, t.as));
  if (!swapped || triples.some((t) => has(t.stem, t.as, t.bs))) return '';
  return `${swapped.a} ${swapped.tok} ${swapped.b}`;
}

const OPENER_RE = /^(?:правда|реально|серьезно|неужели|при всех|до сих пор|не может быть)(?: |$)/u;
const openerOf = (t) => /[?!]/.test(String(t)) && OPENER_RE.test(textKey(t));

export function habitPhrases(texts, names = new Set()) {
  const count = new Map();
  const pets = new Map();
  for (const t of texts.slice(-HABIT_OWN)) {
    const ws = habitWords(t);
    for (const w of new Set(ws)) if (w.length >= 6 && !COMMON_LONG.has(w) && !names.has(w)) pets.set(w, (pets.get(w) || 0) + 1);
    const own = new Set();
    for (const n of [4, 3, 2]) {
      for (let i = 0; i + n <= ws.length; i += 1) {
        const g = ws.slice(i, i + n);
        if (g.join('').length >= (n === 2 ? FORMULA_LETTERS : PHRASE_LETTERS) && !g.every((w) => names.has(w))) own.add(g.join(' '));
      }
    }
    for (const g of own) count.set(g, (count.get(g) || 0) + 1);
  }
  const habits = [...count].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1] || b[0].split(' ').length - a[0].split(' ').length).map(([g]) => g);
  const words = [...pets].filter(([w, n]) => n >= PET_WORD_IN && !habits.some((h) => ` ${h} `.includes(` ${w} `))).sort((a, b) => b[1] - a[1]).map(([w]) => w);
  return [...habits.filter((g, i) => !habits.slice(0, i).some((h) => ` ${h} `.includes(` ${g} `))).slice(0, 4), ...words.slice(0, 2)];
}

export function repeatedHabit(text, author, history, said, names = new Set()) {
  if (!author) return '';
  const now = ` ${habitWords(text).join(' ')} `;
  return habitPhrases(ownPast(author, history, said), names).find((g) => now.includes(` ${g} `)) || '';
}

const ownPast = (author, history, said) => {
  const key = keyOfAuthor(author);
  return [
    ...(Array.isArray(history) ? history : []).filter((x) => x && x.kind === 'reaction' && keyOfItem(x) === key).map((x) => x.text),
    ...((said && said.get(key)) || []),
  ];
};

export function repeatedOpening(text, author, history, said, names = new Set()) {
  if (!author) return '';
  const first = wordsOf(text)[0] || '';
  if (first.length < 4 || names.has(first)) return '';
  const same = ownPast(author, history, said).slice(-RECENT_OWN).filter((x) => (wordsOf(x)[0] || '') === first).length;
  return same >= 1 ? `тот же зачин «${first}…», что и в последних репликах «${author.name}»` : '';
}

export function dropRepeatedEmoji(text, author, history, said) {
  if (!author) return text;
  const e = tailEmoji(text);
  const past = ownPast(author, history, said);
  const prev = tailEmoji(past[past.length - 1]);
  if (!e.length || !e.some((x) => prev.includes(x))) return text;
  return String(text).replace(/(?:\p{Extended_Pictographic}[️‍\u{1F3FB}-\u{1F3FF}]*\s*)+$/u, '').trim();
}

const META_RE = /(?:для|по|в)\s+сюжет[аеу](?![\p{L}])|ролев(?:ая|ой|ую)|персонаж\s+игрока|(?<![\p{L}])npc(?![\p{L}])|(?<![\p{L}])нпс(?![\p{L}])/iu;
const META_OK_RE = /(?:для|по|в)\s+сюжет[аеу]\s+(?:фильма|книги|сериала|пьесы)/iu;

const SHORT_MAX = 18;

const wordsOf = (s) => textKey(s).split(' ').filter(Boolean);

const PHRASE_LETTERS = 11;

export function repeatedPhrase(text, author, history, said) {
  if (!author) return '';
  const key = keyOfAuthor(author);
  const past = [
    ...(Array.isArray(history) ? history : []).filter((x) => x && x.kind === 'reaction' && keyOfItem(x) === key).map((x) => x.text),
    ...((said && said.get(key)) || []),
  ].slice(-RECENT_OWN);
  if (!past.length) return '';
  const now = wordsOf(text);
  const letters = (ws) => ws.join('').length;
  for (const old of past) {
    const was = wordsOf(old);
    for (const n of [3, 2]) {
      if (now.length >= n && was.length >= n && now.slice(0, n).join(' ') === was.slice(0, n).join(' ') && letters(now.slice(0, n)) >= (n === 2 ? 14 : PHRASE_LETTERS)) {
        return now.slice(0, n).join(' ');
      }
    }
    const grams = new Set();
    for (let i = 0; i + 3 <= was.length; i += 1) grams.add(was.slice(i, i + 3).join(' '));
    for (let i = 0; i + 3 <= now.length; i += 1) {
      const g = now.slice(i, i + 3);
      if (grams.has(g.join(' ')) && letters(g) >= PHRASE_LETTERS) return g.join(' ');
    }
  }
  return '';
}

const DANGLING_HARD = new Set([
  'и', 'а', 'но', 'или', 'либо', 'что', 'чтобы', 'чтоб', 'как', 'если', 'когда', 'пока', 'хотя', 'будто', 'словно', 'потому',
  'про', 'о', 'об', 'обо', 'на', 'в', 'во', 'с', 'со', 'к', 'ко', 'у', 'из', 'за', 'для', 'по', 'от', 'до', 'без', 'над', 'под',
  'при', 'через', 'между', 'перед',
  'который', 'которая', 'которые', 'кого', 'чего', 'чей',
]);
const DANGLING_SOFT = new Set(['ли', 'бы', 'же', 'не', 'ни', 'то', 'вот', 'этот', 'эта', 'эти', 'его', 'её', 'их', 'мой', 'моя', 'свой', 'свою', 'такой', 'такая']);

export function isCutOff(text) {
  const raw = String(text == null ? '' : text).trim();
  const t = raw.replace(/[\p{Extended_Pictographic}️‍\s]+$/u, '').trim();
  if (!t) return !raw;
  const open = (t.match(/«/g) || []).length - (t.match(/»/g) || []).length;
  const par = (t.match(/\(/g) || []).length - (t.match(/\)/g) || []).length;
  if (open > 0 || par > 0) return true;
  if (/[,:;\-–—(«]$/.test(t)) return true;
  if (/(?:\p{Lu}\.){2,}$/u.test(t)) return false;
  const body = t.replace(/[.…!?»)"\s]+$/u, '');
  const last = textKey(body).split(' ').pop() || '';
  if (DANGLING_HARD.has(last)) return !/[!?]$/.test(t);
  if (DANGLING_SOFT.has(last)) return !/[.…!?]$/.test(t);
  return false;
}

function cleanLine(line) {
  const t = String(line).replace(/[*`]+/g, '').replace(/^\s*#+\s*/, '').replace(/^\s*[-–—•>]+\s*/, '').trim();
  return t.replace(/^[|\s]+/, '').replace(/[|\s]+$/, '').trim();
}

const OCC_LATIN = { c: 'с', d: 'д', b: 'б', v: 'в', t: 'т', k: 'к' };
const occKey = (raw) => String(raw == null ? '' : raw).toLowerCase().replace(/[\s#№]+/g, '').replace(/^[a-z]/, (ch) => OCC_LATIN[ch] || ch);

const ADMIN_RE = /отчисл|исключ|приказ|администрац|директор|ректор|декан|завуч|комендант|правил[оа]\s+(?:изменил|измен)|запрет(?:или|ил)/iu;

const MEMORY_NEW = /^(?:нов(?:ое|ый|ая)|new)$/iu;

function splitRow(body, tones = null) {
  const cols = body.split('|').map((c) => c.trim());
  if (cols.length < 5) return null;
  const tail = body.split('|').slice(5).join('|').trim();
  const id = cols[0].replace(/[#№.)\s]/g, '');
  if (!/^\d{1,2}$/.test(id)) return null;
  let parent = cols[1];
  const who = cols[2];
  let tone = '';
  let occ;
  let text;
  if (cols.length === 5) {
    if (cols[3] && !/^[a-zа-я]\s*\d{1,2}$/iu.test(cols[3])) return null;
    occ = cols[3];
    text = cols[4];
  } else {
    const k = toneKey(cols[3]);
    tone = tones && tones.has(k) ? k : '';
    occ = cols[4];
    text = tail;
  }
  if (/^(?:нет|-|–|—|0|none|пусто)$/iu.test(parent)) parent = '';
  if (!who || !text) return null;
  return { id: Number(id), parent: parent.replace(/[#№\s.)]/g, ''), who, tone, occ: occKey(occ), body: text };
}

export function parseIssue(text, agenda, opts = {}) {
  const history = Array.isArray(opts.history) ? opts.history : [];
  const said = new Map();
  const rowId = (l) => Number((String(l).split('|')[0].match(/\d+/) || [NaN])[0]);
  const raw = lastBlock(String(text == null ? '' : text)
    .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '')
    .replace(/<!--[\s\S]*?(?:-->|$)/g, '')
    .replace(/\r/g, ''), { mark: END_MARK, restart: (cur, prev) => rowId(cur) <= 1 && rowId(prev) > 1 });
  const endRe = new RegExp(`^[\\s#*=>_\`[(-]*${END_MARK}(?![\\p{L}])`, 'iu');
  const complete = raw.split('\n').some((l) => endRe.test(l)) && opts.truncated !== true;
  const pool = Array.isArray(opts.pool) ? opts.pool : [];
  const stop = Array.isArray(opts.stop) ? opts.stop : [];
  const nameSet = nameWords(pool, stop.filter((s) => s.kind === 'user' || s.kind === 'char').map((s) => s.name));
  const rejected = [];
  const warned = [];
  const past = (Array.isArray(opts.past) ? opts.past : agenda.past || []).filter((e) => e && e.name);
  const pal = feedReactions(opts.preset);
  const tones = pal.length ? new Set([...pal.map((p) => toneKey(p.tone)), NO_TONE]) : null;
  const rows = [];
  raw.split('\n').forEach((line, i) => {
    const body = cleanLine(line);
    if (!body || endRe.test(body) || /^[\s|:\-–—]+$/.test(body)) return;
    if (/^[дd]\s*\|/iu.test(body)) {
      rows.push({ memory: true, raw: body, line: i + 1, cols: body.split('|').map((c) => c.trim()) });
      return;
    }
    const row = splitRow(body, tones);
    if (!row) {
      if (body.includes('|') && !/^(?:id|№|номер)\s*\|/iu.test(body)) rejected.push({ raw: body, line: i + 1, reason: 'строка не по формату' });
      return;
    }
    rows.push({ ...row, raw: body, line: i + 1 });
  });
  const silent = !rows.length && complete && raw.split('\n').every((l) => !cleanLine(l) || endRe.test(cleanLine(l)));
  if (!rows.length && !silent) {
    rejected.push({
      raw: clip(raw, 160),
      reason: raw.trim() ? 'в ответе нет ни одной строки формата «id | родитель | автор | отклик | повод | текст»' : 'пустой ответ модели',
    });
  }

  if (!complete && rows.length) {
    const last = rows[rows.length - 1];
    const tidyLast = tidy(last.memory ? last.cols.slice(3).join('|') : last.body);
    if (opts.truncated === true || !tidyLast || isCutOff(tidyLast)) {
      rows.pop();
      rejected.push({ raw: last.raw, line: last.line, reason: 'ответ оборван на этой строке' });
    }
  }

  const occasions = new Map((agenda.occasions || []).map((o) => [o.id, o]));
  const factTexts = [
    ...(agenda.occasions || []).filter((o) => o.kind === 'event').map((o) => o.text),
    ...history.filter((x) => x && x.kind === 'fact').slice(-10).map((x) => x.gist || x.text),
  ].filter(Boolean);
  const budgetMax = ((agenda.budget && agenda.budget.max) || 8) + 1;
  const seen = [...(opts.existing || []).map(String)];
  const dup = (t) => seen.some((x) => sameText(x, t));
  const lost = new Map();
  const orphan = new Map();
  const heir = new Map();
  const fail = (row, reason) => {
    rejected.push({ raw: row.raw, line: row.line, reason });
    if (row.parent && row.id != null) lost.set(String(row.id), row.parent);
    else if (row.id != null && row.occ) orphan.set(String(row.id), row.occ);
  };

  const authorStems = (a) => nameStems({ name: a.full, short: a.name, aliases: a.aliases });
  const checkText = (row, mention, author, anonPost = false) => {
    let t = tidy(row.body);
    if (t === null) return { reason: `реплика длиннее ${FEED_TEXT_MAX} знаков` };
    const emojiOnly = row.parent && /\p{Extended_Pictographic}/u.test(t) && !/[\p{L}\p{N}]/u.test(t);
    if (!emojiOnly && (t.match(/\p{L}/gu) || []).length < MIN_LETTERS) return { reason: 'пустая реплика' };
    if (isCutOff(t)) return { reason: 'реплика оборвана на полуслове' };
    if (!mention && mentionsStop(t, stop)) return { reason: 'речь о персонаже игрока или карточки вне повода, где они участвуют или обсуждаются' };
    if (META_RE.test(t) && !META_OK_RE.test(t)) return { reason: 'мета-язык игры' };
    const leak = leakReason(t, { roster: opts.roster, revealed: opts.revealed });
    if (leak) return { reason: leak };
    if (anonPost && author && hasStem(t, authorStems(author))) return { reason: 'в записке названо имя автора' };
    const piece = brokenWords(t);
    if (piece) return { reason: `в словах вставлен кусок «${piece}» — написание искажено` };
    if (dup(t)) return { reason: 'повтор уже сказанного' };
    const near = nearRepeat(t, seen.slice(-40));
    if (near) return { reason: `почти повтор уже сказанного («${clip(near, 50)}»)` };
    const hotWord = hotHit(t, agenda.hot, HOT_DROP);
    if (hotWord) return { reason: `обсосанная тема «${hotWord}»` };
    const hotWarn = hotHit(t, agenda.hot);
    if (hotWarn) warned.push({ raw: row.raw, line: row.line, reason: `тему «${hotWarn}» уже обсудили несколько раз` });
    const worn = wornHit(t, agenda.worn);
    if (worn) warned.push({ raw: row.raw, line: row.line, reason: `заезженная деталь «${worn}»: её обсуждали уже в нескольких выпусках` });
    const copy = copiesFact(t, factTexts);
    if (copy) return { reason: `пересказ факта слово в слово («${copy}»)` };
    const swap = swappedAction(t, factTexts);
    if (swap) return { reason: `перепутаны участники или направление действия: в событии «${swap}»` };
    const spell = foreignSpell(t);
    if (spell) return { reason: `заклинание из чужого произведения «${spell}»` };
    const tic = author ? overusedCatchphrase(t, author, history, said) : '';
    if (tic) warned.push({ raw: row.raw, line: row.line, reason: `присказка «${tic}» в третьей реплике автора подряд` });
    const again = repeatedPhrase(t, author, history, said);
    if (again) warned.push({ raw: row.raw, line: row.line, reason: `оборот «${again}» уже был у автора в последних репликах` });
    const habit = repeatedHabit(t, author, history, said, nameSet);
    if (habit) warned.push({ raw: row.raw, line: row.line, reason: `фирменный оборот «${habit}» уже был у автора не раз` });
    const formula = repeatedFormula(t, author, history, said, nameSet, agenda.issue);
    if (formula) warned.push({ raw: row.raw, line: row.line, reason: `формула «${formula}» уже была у автора в последних выпусках` });
    const opening = repeatedOpening(t, author, history, said, nameSet);
    if (opening) warned.push({ raw: row.raw, line: row.line, reason: opening });
    if (openerOf(t) && lines.some((l) => openerOf(l.text))) warned.push({ raw: row.raw, line: row.line, reason: 'однотипный зачин («правда…?!», «реально…?!») уже был в этом выпуске' });
    t = dropRepeatedEmoji(t, author, history, said);
    const style = repeatedStyle(t, author, history, said);
    if (style) warned.push({ raw: row.raw, line: row.line, reason: style });
    for (const e of past) {
      const hit = futureMention(t, e.name);
      if (hit) warned.push({ raw: row.raw, line: row.line, reason: `«${e.name}» уже прошло, а реплика говорит как о будущем («${hit}»)` });
    }
    const nw = t.split(/\s+/).length;
    if (author && /коротк/i.test(mannerOf(author)) && nw > SHORT_MAX) warned.push({ raw: row.raw, line: row.line, reason: `у «${author.name}» примета «коротко», а в реплике ${nw} слов` });
    if (author) said.set(keyOfAuthor(author), [...(said.get(keyOfAuthor(author)) || []), t]);
    return { text: t };
  };

  const mainNames = stop.filter((x) => x.kind === 'user' || x.kind === 'char').map((x) => x.name);
  const rootSets = rootSubjects(history, pool, mainNames);
  const lines = [];
  const byKey = new Map();
  const trees = new Map();
  let prevPost = opts.lastKey ?? agenda.lastKey ?? '';
  const memoryRows = [];
  const ghost = new Map();

  for (const row of rows) {
    if (row.memory) { memoryRows.push(row); continue; }
    if (byKey.has(row.id)) { fail(row, 'повторный номер строки'); continue; }
    let author = null;
    if (isMagpieName(row.who)) {
      const own = !row.parent ? occasions.get(row.occ) : null;
      const writer = own && (own.kind === 'anon' || (own.kind === 'event' && own.rumor)) ? own.writer : '';
      author = writer ? pool.find((a) => a.id === writer) || null : null;
      if (!author) { fail(row, '«Сорока» пишет только записку по своему поводу'); continue; }
    } else author = resolveAuthor(row.who, pool);
    if (!author) { fail(row, `автор «${clip(row.who, 30)}» — не из людей школы`); continue; }
    const key = keyOfAuthor(author);

    let parentKey = '';
    let branch = null;
    let occasion = null;
    let rootKey = '';
    if (row.parent && !/^\d{1,2}$/.test(row.parent) && (occasions.get(occKey(row.parent)) || {}).kind !== 'branch') {
      const was = ghost.get(row.parent);
      if (was != null && byKey.has(was)) row.parent = String(was);
      else {
        const own = occasions.get(row.occ);
        const to = own && own.kind !== 'branch' ? own : (agenda.occasions || []).find((o) => o.kind === 'event' && !o.hot);
        if (to) { ghost.set(row.parent, row.id); row.occ = to.id; row.parent = ''; }
      }
    }
    for (let guard = 0; guard < 8 && /^\d{1,2}$/.test(row.parent) && !byKey.has(Number(row.parent)) && (lost.has(row.parent) || heir.has(row.parent)); guard += 1) {
      row.parent = heir.get(row.parent) || lost.get(row.parent);
    }
    let heirOf = '';
    if (/^\d{1,2}$/.test(row.parent) && !byKey.has(Number(row.parent)) && orphan.has(row.parent)) {
      heirOf = row.parent;
      row.occ = orphan.get(row.parent);
      row.parent = '';
    }
    if (/^\d{1,2}$/.test(row.parent)) {
      const parent = byKey.get(Number(row.parent));
      if (!parent) { fail(row, `родителя «${row.parent}» нет среди принятых строк выше`); continue; }
      parentKey = parent.key;
      rootKey = parent.root;
    } else if (row.parent) {
      branch = occasions.get(occKey(row.parent));
      if (!branch || branch.kind !== 'branch') { fail(row, `ветки «${clip(row.parent, 12)}» нет в повестке`); continue; }
      rootKey = `b:${branch.postId}`;
    } else {
      occasion = occasions.get(row.occ);
      if (occasion && occasion.kind === 'branch') { branch = occasion; occasion = null; rootKey = `b:${branch.postId}`; }
      else if (!occasion) { fail(row, 'пост без повода из повестки'); continue; }
      else if (heirOf && occasion.rumor) { fail(row, 'ответ на отброшенный слух сам слухом не становится'); continue; }
    }
    const reply = Boolean(rootKey);

    if (lines.length >= budgetMax) { fail(row, 'сверх бюджета выпуска'); continue; }
    if (lines.filter((l) => keyOfAuthor(l.author) === key).length >= AUTHOR_MAX) { fail(row, `у автора уже ${AUTHOR_MAX} сообщения в выпуске`); continue; }

    let tree = trees.get(rootKey);
    if (reply) {
      if (!tree) {
        tree = { authorKey: branch.authorKey, lastKey: branch.lastKey, spoke: branch.spoke, count: 0, mention: branch.heroine || branch.linked === true, occ: branch.occ || { kind: 'branch', ref: branch.postId }, voices: new Set(branch.keys || [branch.authorKey]) };
        trees.set(rootKey, tree);
      }
      if (tree.count >= BRANCH_REPLIES_MAX) { fail(row, `в ветке больше ${BRANCH_REPLIES_MAX} ответов за выпуск`); continue; }
      if (key === tree.authorKey && !tree.spoke) { fail(row, 'ответ автора самому себе до чужого ответа'); continue; }
      if (key === tree.lastKey) { fail(row, 'тот же автор подряд в одной ветке'); continue; }
      const stranger = addressees(row.body, pool, key).find((k) => !tree.voices.has(k));
      if (stranger) warned.push({ raw: row.raw, line: row.line, reason: `обращается к «${pool.find((a) => keyOfAuthor(a) === stranger).name}», а тот в этой ветке не писал` });
    } else {
      if (occasion.kind === 'event' && !occasion.rumor && Array.isArray(occasion.knowIds) && occasion.knowIds.length && !occasion.knowIds.includes(author.id)) {
        fail(row, `${author.name} не мог знать об этом событии`);
        continue;
      }
      if (occasion.rumor && author.role === 'teacher') { fail(row, 'слух пишет не преподаватель'); continue; }
      if (occasion.writer && (occasion.kind === 'anon' || occasion.rumor) && author.id !== occasion.writer) { fail(row, 'записку этого повода пишет другой автор'); continue; }
      if ((agenda.resting || []).includes(key)) warned.push({ raw: row.raw, line: row.line, reason: `${author.name} писал две реплики в прошлом выпуске` });
      if (occasion.kind === 'event' && (agenda.notOpening || []).includes(key)) { warned.push({ raw: row.raw, line: row.line, reason: `${author.name} открывал две последние ветки о событиях` }); }
      if (key === prevPost) warned.push({ raw: row.raw, line: row.line, reason: 'тот же автор уже писал пост перед этим' });
    }

    const mention = reply ? tree.mention === true : (occasion.kind === 'event' && occasion.heroine === true) || occasion.linked === true;
    const c = checkText(row, mention, author, !reply && (occasion.kind === 'anon' || (occasion.kind === 'event' && occasion.rumor === true)));
    if (c.reason) { fail(row, c.reason); continue; }
    let subj = null;
    if (!reply) {
      subj = subjectKeys(c.text, pool, mainNames);
      if (occasion.kind === 'event' && occasion.heroine) subj.add('main');
      const crowd = crowdedSubjects(rootSets).filter((k) => subj.has(k));
      if (crowd.length) { fail(row, `третий пост подряд про одного и того же (${crowd.length})`); continue; }
    }
    if (!reply && occasion.hot && !lines.length && (agenda.occasions || []).some((o) => o.kind === 'event' && !o.hot)) warned.push({ raw: row.raw, line: row.line, reason: 'выпуск открыт уже обсуждённым событием при свежих' });
    seen.push(c.text);

    const occRef = reply ? tree.occ : occasionRef(occasion);
    const out = {
      key: String(row.id), kind: reply ? 'reply' : 'post', author, text: c.text, tone: row.tone,
      occ: { id: reply ? '' : occasion.id, kind: occRef.kind, ref: occRef.ref }, mention,
    };
    if (!reply && occasion.kind === 'anon') out.note = { target: occasion.target, tone: occasion.tone, fact: occasion.fact, clues: occasion.clues, why: occasion.why };
    if (!reply && occasion.kind === 'event' && occasion.rumor) out.note = { target: (occasion.about || []).find((id) => id !== '@heroine') || '@heroine', tone: 'rumor', fact: occasion.factId, clues: null };
    if (reply) {
      Object.assign(out, { parentKey, root: rootKey, ...(branch ? { parentId: branch.postId } : {}) });
      tree.count += 1;
      tree.lastKey = key;
      tree.voices.add(key);
      if (key !== tree.authorKey) tree.spoke = true;
    } else {
      out.root = out.key;
      out.parentKey = '';
      trees.set(out.key, { authorKey: key, lastKey: key, spoke: false, count: 0, mention, occ: occRef, voices: new Set([key]) });
      prevPost = key;
      rootSets.push(subj);
      if (heirOf) heir.set(heirOf, out.key);
    }
    byKey.set(row.id, out);
    lines.push(out);
  }
  const memory = acceptMemory(memoryRows, { occasions, pool, stop, fail });
  return { lines, memory, rejected, warned, rows: rows.length, complete, silent };
}

function occasionRef(o) {
  if (o.kind === 'event') return { kind: 'event', ref: o.factId };
  if (o.kind === 'affair') return { kind: 'affair', ref: o.threadId };
  if (o.kind === 'talk') return { kind: 'talk', ref: 'main' };
  if (o.kind === 'anon') return { kind: 'anon', ref: o.target || '' };
  return { kind: 'life', ref: clip(o.topic, 90) };
}

function acceptMemory(rows, { occasions, pool, stop, fail }) {
  const out = [];
  for (const row of rows) {
    const [, ref = '', who = '', ...rest] = row.cols;
    const text = rest.join('|');
    const change = clipText(text, MEMORY_TEXT_MAX);
    if (out.length >= MEMORY_MAX) { fail(row, 'больше двух строк памяти Д за выпуск'); continue; }
    const fresh = MEMORY_NEW.test(ref);
    const affair = fresh ? null : occasions.get(occKey(ref));
    if (!fresh && (!affair || affair.kind !== 'affair')) { fail(row, `дела «${clip(ref, 12)}» нет в повестке`); continue; }
    const member = resolveAuthor(who, pool);
    if (!member) { fail(row, `участник «${clip(who, 30)}» — не из людей школы`); continue; }
    if ((change.match(/\p{L}/gu) || []).length < MIN_LETTERS * 2 || isCutOff(change)) { fail(row, 'перемена пустая или оборвана'); continue; }
    if (mentionsStop(change, stop)) { fail(row, 'в памяти дела названы главные — это жизнь школы'); continue; }
    if (ADMIN_RE.test(change)) { fail(row, 'решение администрации — не дело учеников'); continue; }
    if (META_RE.test(change) && !META_OK_RE.test(change)) { fail(row, 'мета-язык игры'); continue; }
    out.push({ thread: fresh ? 'новое' : affair.id, threadId: affair ? affair.threadId : '', memberId: member.id, change, line: row.line });
  }
  return out;
}

export function resolveAuthor(raw, pool) {
  const name = normName(String(raw || '').replace(/\s*\([^)]*\)\s*$/, '').replace(/^[~@\s«"“„[<]+|[»"”\s\]>]+$/g, ''));
  if (!name) return null;
  const exact = pool.find((a) => normName(a.name) === name);
  if (exact) return exact;
  const slug = String(raw || '').trim().toLowerCase();
  const byId = pool.find((a) => String(a.id).toLowerCase() === slug);
  if (byId) return byId;
  const by = (test) => {
    const hit = pool.filter(test);
    return hit.length === 1 ? hit[0] : null;
  };
  return by((a) => normName(a.full) === name)
    || by((a) => (a.aliases || []).some((x) => normName(x) === name))
    || by((a) => normName(a.name).split(' ')[0] === name && name.length >= 4)
    || by((a) => normName(a.full).split(' ').includes(name) && name.length >= 4);
}

export function mentionsStop(text, stop) {
  const list = Array.isArray(stop) ? stop : [];
  const words = normName(text).split(' ').filter(Boolean);
  return list.some((s) => (s.kind === 'user' || s.kind === 'char')
    && s.tokens.some((t) => t.length >= 3 && words.some((w) => w.startsWith(t.slice(0, Math.min(t.length, 5))))));
}

function sameText(a, b) {
  const x = textKey(a);
  const y = textKey(b);
  if (!x || !y) return false;
  if (x === y || (Math.min(x.length, y.length) >= 24 && (x.includes(y) || y.includes(x)))) return true;
  const sa = new Set(x.split(' ').filter((w) => w.length >= 4).map((w) => w.slice(0, 5)));
  const sb = new Set(y.split(' ').filter((w) => w.length >= 4).map((w) => w.slice(0, 5)));
  if (Math.min(sa.size, sb.size) < 6) return false;
  let common = 0;
  for (const w of sa) if (sb.has(w)) common += 1;
  return common / (sa.size + sb.size - common) >= 0.85;
}

function tidy(raw) {
  let t = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
  t = t.replace(/^[«"“„'](.*)[»"”“']$/u, '$1').trim();
  if (t.length > FEED_TEXT_MAX) {
    const cut = t.slice(0, FEED_TEXT_MAX);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '), cut.lastIndexOf('…'));
    const dot = /[.!?…]$/.test(cut) ? cut.length - 1 : -1;
    const at = Math.max(end, dot);
    return at >= 30 ? cut.slice(0, at + 1).trim() : null;
  }
  return t;
}

export function brokenWords(text) {
  const words = String(text == null ? '' : text).toLowerCase().replace(/ё/g, 'е').match(/\p{L}{4,}/gu) || [];
  const long = [...new Set(words.filter((w) => w.length >= 6))];
  const found = new Map();
  for (const w of long) {
    for (let len = 4; len <= 6; len += 1) {
      for (let at = 1; at + len <= w.length - 3; at += 1) {
        const piece = w.slice(at, at + len);
        if (!found.has(piece)) found.set(piece, new Set());
        found.get(piece).add(w);
      }
    }
  }
  let best = '';
  for (const [piece, set] of found) {
    const roots = new Set([...set].map((w) => w.slice(0, 4)));
    if (roots.size < (piece.length >= 5 ? 2 : 3)) continue;
    if (piece.length > best.length) best = piece;
  }
  return best;
}

function applyMemory(work, memory) {
  const changed = new Set();
  for (const m of memory || []) {
    if (!m.threadId) continue;
    const t = ensureFeed(work).threads.find((x) => x.id === m.threadId);
    if (!t) continue;
    t.last = clipText(m.change, MEMORY_TEXT_MAX);
    if (!t.members.includes(m.memberId) && t.members.length < 3) t.members.push(m.memberId);
    changed.add(t.id);
  }
  return changed;
}

function startMemoryThreads(work, memory, day) {
  for (const m of memory || []) {
    if (m.threadId) continue;
    const active = ensureFeed(work).threads.filter((t) => t.state === 'active');
    if (active.length >= THREADS_MAX) {
      const old = active.slice().sort((a, b) => ((b.idle || 0) - (a.idle || 0)) || ((b.stale || 0) - (a.stale || 0)))[0];
      if ((old.idle || 0) + (old.stale || 0) > 0) old.state = 'paused';
    }
    startThread(work, { topic: clipText(m.change, 90), members: [m.memberId], owner: m.memberId, last: m.change, source: 'life', day, paused: true });
  }
}

const occTopic = (o) => clip(o.kind === 'event' ? o.text : o.topic, 60);

function rememberTopics(feed, talked) {
  for (const [id, topic] of talked) {
    if (!id || !topic) continue;
    const m = feed.minds[id] || {};
    feed.minds[id] = { ...m, topics: [...(m.topics || []).filter((t) => !similar(t, topic)), topic].slice(-MIND_TOPICS) };
  }
}

export function applyIssue(work, result, agenda, opts = {}) {
  const day = opts.day || (work.calendar && work.calendar.day) || '';
  const time = opts.time || (work.calendar && work.calendar.time) || '';
  const issue = agenda.issue;
  const src = `${SRC}${issue}${opts.stamp ? `-${hash(opts.stamp)}` : ''}`;
  const made = [];
  let posts = 0;
  let replies = 0;
  const idOf = new Map();
  const occasions = new Map((agenda.occasions || []).map((o) => [o.id, o]));
  const used = [];
  const talked = [];
  const pal = feedReactions(opts.preset);
  const withReacts = (item, l, quiet, reply) => (pal.length
    ? { ...item, pal: pal.map((p) => p.emoji), reacts: pickReacts(pal, { id: item.id, tone: l.tone, loud: item.loud ?? 1, quiet, reply }) }
    : item);

  for (const l of result.lines) {
    const base = {
      src, at: { day, time }, factRef: '', kind: 'reaction',
      who: l.author.id,
      text: l.text, truth: null, status: 'new',
    };
    if (l.kind === 'post') {
      const o = occasions.get(l.occ.id) || {};
      const event = o.kind === 'event';
      const anon = o.rumor === true || o.kind === 'anon';
      const id = `${src}#${posts + 1}`;
      const item = {
        ...base, id, chan: anon ? 'anon' : 'chat', rumor: anon,
        about: event ? o.about : o.kind === 'anon' ? (o.target && o.target !== '@heroine' ? [o.target] : ['@heroine']) : [], heroine: (event && o.heroine === true) || o.kind === 'talk' || (o.kind === 'anon' && o.target === '@heroine'),
        loud: event ? o.loud : 1, factText: event ? clip(o.text, FACT_TEXT_MAX) : '',
        occ: { kind: l.occ.kind, ref: l.occ.ref },
        ...(l.note ? { anon: { target: l.note.target, tone: l.note.tone, fact: l.note.fact || '', clues: l.note.clues || cluesFor(opts.roster && opts.roster.get(l.author.id), opts.roster) } } : {}),
      };
      if (addFeedItem(work, withReacts(item, l, o.kind === 'life', false))) {
        posts += 1;
        idOf.set(l.key, id);
        made.push(id);
        used.push(item.occ);
        talked.push([l.author.id, occTopic(o)]);
      }
    } else {
      const parentId = l.root.startsWith('b:') ? l.root.slice(2) : idOf.get(l.root);
      const parent = parentId ? ensureFeed(work).items.find((x) => x.id === parentId && !x.parent) : null;
      if (!parent) continue;
      const id = `${src}^${replies + 1}`;
      const item = {
        ...base, id, parent: parent.id, chan: parent.chan, rumor: parent.chan === 'anon',
        about: parent.about, heroine: parent.heroine, loud: parent.loud, factText: parent.factText,
        occ: parent.occ || { kind: l.occ.kind, ref: l.occ.ref },
      };
      if (addFeedItem(work, withReacts(item, l, parent.loud === 0 || (parent.occ && parent.occ.kind === 'life'), true))) {
        replies += 1;
        made.push(id);
        used.push(item.occ);
      }
    }
  }

  const fresh = ensureFeed(work);
  rememberTopics(fresh, talked);
  if (made.length && opts.roster) {
    const clue = surfaceClue(work, issue);
    if (clue) putClueOut(work, clue, issue);
  }
  if (!made.length && !result.silent) {
    if (opts.resetOnFail) {
      fresh.molva = { ...fresh.molva, since: 0 };
      return { ok: false, delta: deltaOf(work, [], opts.stamp), posts: 0, replies: 0 };
    }
    return { ok: false, delta: null, posts: 0, replies: 0 };
  }
  const touched = new Set(used.filter((u) => u.kind === 'affair').map((u) => u.ref));
  const changed = applyMemory(work, result.memory);
  noteThreads(work, { touched, changed }, day);
  startMemoryThreads(work, result.memory, day);
  if (opts.preset) {
    for (let guard = 0; guard < THREADS_MAX && openThreads(work).length < THREADS_MAX; guard += 1) {
      if (!spawnThread(work, opts.preset, { day, stop: opts.stop }).ok) break;
    }
  }
  const usedFacts = [...new Set(used.filter((u) => u.kind === 'event').map((u) => u.ref))];
  const after = ensureFeed(work);
  const skipped = (agenda.occasions || []).filter((o) => o.kind === 'event' && !o.hot && !usedFacts.includes(o.factId)).map((o) => o.factId);
  const hotNow = (agenda.occasions || [])
    .filter((o) => o.kind === 'event' && !o.hot && o.heroine && o.loud >= 2 && usedFacts.includes(o.factId))
    .map((o) => ({ id: o.factId, issue }));
  const spent = skipped.filter((id) => after.molva.offered.includes(id));
  const lifeNow = [...new Set(used.filter((u) => u.kind === 'life').map((u) => u.ref))];
  const affairNow = (agenda.occasions || []).filter((o) => o.kind === 'affair' && touched.has(o.threadId)).map((o) => o.topic);
  const calNow = (agenda.occasions || [])
    .filter((o) => o.kind === 'life' && o.event && lifeNow.includes(clip(o.topic, 90)))
    .map((o) => ({ topic: clipText(o.topic, 90), issue }));
  after.molva = {
    ...after.molva,
    issue,
    since: 0,
    facts: [...after.molva.facts, ...usedFacts, ...spent].slice(-MOLVA_FACTS_MAX),
    offered: skipped.filter((id) => !spent.includes(id)),
    hot: [...after.molva.hot.filter((h) => !hotNow.some((n) => n.id === h.id)), ...hotNow],
    at: { day, time },
    topics: [...after.molva.topics, ...lifeNow, ...affairNow].map((t) => clipText(t, 90)).slice(-MOLVA_TOPICS_MAX),
    cal: [...after.molva.cal.filter((c) => !calNow.some((n) => similar(n.topic, c.topic))), ...calNow].slice(-6),
  };
  const delta = deltaOf(work, made, opts.stamp);
  return { ok: true, delta, posts, replies, ...(made.length ? {} : { quiet: true }) };
}

function deltaOf(work, ids, stamp) {
  const feed = ensureFeed(work);
  const want = new Set(ids);
  return {
    stamp: str(stamp),
    items: feed.items.filter((x) => want.has(x.id)).map((x) => ({ ...x })),
    threads: clone(feed.threads),
    molva: clone(feed.molva),
    minds: clone(feed.minds),
  };
}

export function readDeltas(raw) {
  const out = [];
  for (const d of Array.isArray(raw) ? raw : []) {
    if (!d || typeof d !== 'object') continue;
    const items = (Array.isArray(d.items) ? d.items : []).map(normalizeItem).filter(Boolean).slice(0, 24);
    const m = normalizeFeed({ molva: d.molva }).molva;
    out.push({ stamp: str(d.stamp), items, threads: Array.isArray(d.threads) ? clone(d.threads) : [], molva: m, minds: normalizeFeed({ minds: d.minds }).minds });
  }
  return out.slice(-DELTAS_KEPT);
}

export function replayMolva(state, deltas, stamp) {
  const list = (Array.isArray(deltas) ? deltas : []).filter((d) => d && (stamp === undefined || d.stamp === stamp));
  if (!list.length) return state;
  const next = clone(state);
  const feed = ensureFeed(next);
  for (const d of list) {
    for (const item of d.items || []) addFeedItem(next, item);
    const f = ensureFeed(next);
    f.threads = normalizeThreads(d.threads);
    f.molva = { ...f.molva, ...normalizeFeed({ molva: d.molva }).molva };
    if (d.minds) f.minds = normalizeFeed({ minds: d.minds }).minds;
  }
  return next;
}

export function countDelta(delta) {
  const items = (delta && delta.items) || [];
  return { posts: items.filter((x) => !x.parent).length, replies: items.filter((x) => x.parent).length };
}
