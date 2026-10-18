import {
  THREADS_MAX, THREAD_SOURCES, THREAD_TEXT_MAX, PAUSED_MAX, ARCHIVE_MAX, IDLE_ARCHIVE, STALE_MAX, AFFAIR_TURNS,
  ensureFeed, normalizeFeed, freeId, normalizeThread, feedWorldTopics, clipText,
} from './feed.mjs';
import { similar, worldPreset } from './feed-text.mjs';
import { feedAuthors, openTies, isWarmTie, SHARP_TIES } from './authors.mjs';
import { holidaysAhead } from './holidays.mjs';
import { upcomingEvents } from './upcoming.mjs';
import { subjectWord } from './words.mjs';
import { diffDays, addDays, mondayOf, preExamWeek, preExamWord } from './time.mjs';

export const CALENDAR_HORIZON = 14;

export const AFTER_EVENT_DAYS = 2;

const copy = (t) => ({ ...t, members: [...t.members] });
const inState = (state, name) => normalizeFeed(state && state.feed).threads.filter((t) => t.state === name).map(copy);

export function openThreads(state) {
  return inState(state, 'active');
}

export function pausedThreads(state) {
  return inState(state, 'paused');
}

export function archivedThreads(state) {
  return inState(state, 'archived');
}

export function allThreads(state) {
  return normalizeFeed(state && state.feed).threads.map(copy);
}

export function threadRoom(state) {
  return Math.max(0, THREADS_MAX - openThreads(state).length);
}

export function hasTopic(state, topic) {
  return normalizeFeed(state && state.feed).threads.some((t) => similar(t.topic, topic));
}

export function startThread(state, spec) {
  const feed = ensureFeed(state);
  const s = spec && typeof spec === 'object' ? spec : {};
  const full = feed.threads.filter((t) => t.state === 'active').length >= THREADS_MAX;
  if (full && !(s.paused && feed.threads.filter((t) => t.state === 'paused').length < PAUSED_MAX)) return { ok: false, reason: 'full' };
  if (feed.threads.some((t) => similar(t.topic, s.topic))) return { ok: false, reason: 'duplicate' };
  const used = new Set([...feed.threads.map((t) => t.id), ...feed.items.filter((x) => x.occ && x.occ.kind === 'affair').map((x) => x.occ.ref)]);
  const thread = normalizeThread({
    id: freeId('t', used),
    topic: s.topic,
    members: s.members,
    owner: s.owner,
    want: s.want !== undefined ? s.want : s.dispute,
    last: s.last,
    question: s.question,
    source: s.source,
    since: s.day,
    on: s.on,
    state: full ? 'paused' : 'active',
  });
  if (!thread) return { ok: false, reason: 'bad' };
  feed.threads.push(thread);
  return { ok: true, thread: copy(thread) };
}

export function archiveThread(state, id) {
  const feed = ensureFeed(state);
  const t = feed.threads.find((x) => x.id === id);
  if (!t || t.state === 'archived') return false;
  t.state = 'archived';
  const old = feed.threads.filter((x) => x.state === 'archived');
  const drop = new Set(old.slice(0, Math.max(0, old.length - ARCHIVE_MAX)).map((x) => x.id));
  feed.threads = feed.threads.filter((x) => !drop.has(x.id));
  return true;
}

export function pruneThreads(state, roster = null) {
  const feed = ensureFeed(state);
  if (!roster) return;
  for (const t of feed.threads) {
    t.members = t.members.filter((id) => roster.has(id));
    if (!t.members.includes(t.owner)) t.owner = t.members[0] || '';
  }
  feed.threads = feed.threads.filter((t) => t.members.length);
}

export function closeThread(state, id) {
  const feed = ensureFeed(state);
  const at = feed.threads.findIndex((t) => t.id === id);
  if (at < 0) return false;
  feed.threads.splice(at, 1);
  return true;
}

export function noteThreads(state, { touched = new Set(), changed = new Set() } = {}, day = '') {
  const feed = ensureFeed(state);
  const archived = [];
  for (const t of feed.threads) {
    if (t.state !== 'active') continue;
    if (touched.has(t.id)) {
      t.idle = 0;
      t.stale = changed.has(t.id) ? 0 : Math.min(t.stale + 1, 9);
      t.turns = Math.min((t.turns || 0) + 1, 99);
      if (threadOver(t, day) || t.turns >= AFFAIR_TURNS) archived.push(t.id);
    } else {
      t.idle = Math.min(t.idle + 1, 9);
      if (t.idle >= IDLE_ARCHIVE) archived.push(t.id);
    }
  }
  for (const id of archived) archiveThread(state, id);
  return { archived };
}

export const isEnding = (t) => Boolean(t) && (t.turns || 0) >= AFFAIR_TURNS - 1;

export const isStale = (t) => Boolean(t) && t.stale >= STALE_MAX;

export const MATES_MIN = 4;

export function worldTopicsOf(state, preset) {
  return feedWorldTopics(preset);
}

function load(state) {
  const n = new Map();
  for (const t of openThreads(state)) for (const id of t.members) n.set(id, (n.get(id) || 0) + 1);
  return n;
}

const TIER = { near: 0, mid: 1, far: 2 };

function folk(state, roster, stop) {
  const busy = load(state);
  const seen = new Map();
  for (const t of allThreads(state)) for (const id of t.members) seen.set(id, (seen.get(id) || 0) + 1);
  return feedAuthors(state, roster, { stop }).filter((a) => a.role === 'student')
    .map((a, i) => ({ a, i }))
    .sort((x, y) => (TIER[x.a.tier] - TIER[y.a.tier]) || (busy.get(x.a.id) || 0) - (busy.get(y.a.id) || 0) || (seen.get(x.a.id) || 0) - (seen.get(y.a.id) || 0) || x.i - y.i)
    .map(({ a }) => a);
}

function pairsOf(list, roster, kinds) {
  const out = [];
  for (const a of list) {
    const person = roster.get(a.id);
    for (const t of openTies(person)) {
      const b = kinds(t) ? list.find((x) => x.id === t.to) : null;
      if (!b || out.some((p) => p.a.id === b.id && p.b.id === a.id)) continue;
      out.push({ a, b, tie: t });
      break;
    }
  }
  return out;
}

function lifeTopics(state, preset, list, roster) {
  const sharp = pairsOf(list, roster, (t) => SHARP_TIES.has(t.kind));
  const warm = pairsOf(list, roster, isWarmTie);
  const out = [];
  const sharpTopic = (p) => ({
    topic: clipText(p.tie.note ? `${p.a.name} и ${p.b.name}: ${p.tie.note}` : `${p.a.name} и ${p.b.name}`, THREAD_TEXT_MAX.topic),
    ids: [p.a.id, p.b.id],
    want: `${p.a.name} и ${p.b.name} не ладят`,
  });
  const warmTopic = (p) => {
    const mine = p.a.interests.find((i) => p.b.interests.some((j) => similar(i, j))) || p.a.interests[0] || p.b.interests[0];
    return mine ? { topic: clipText(mine, THREAD_TEXT_MAX.topic), ids: [p.a.id, p.b.id], want: `${p.a.name} и ${p.b.name} заняты этим вместе` } : null;
  };
  for (let i = 0; i < Math.max(sharp.length, warm.length); i += 1) {
    if (sharp[i]) out.push(sharpTopic(sharp[i]));
    const w = warm[i] && warmTopic(warm[i]);
    if (w) out.push(w);
  }
  const [a, b] = list;
  const world = worldTopicsOf(state, preset).map((topic) => ({
    topic: clipText(topic, THREAD_TEXT_MAX.topic),
    ...(a && b ? { ids: [a.id, b.id], want: `${a.name} и ${b.name} заняты этим вместе` } : {}),
  }));
  return [...out, ...world];
}

function eventEnd(holiday, start) {
  if (holiday.dated && /^\d{4}-\d{2}-\d{2}$/.test(String(holiday.to))) return holiday.to;
  if (holiday.shift !== undefined) {
    return Number.isInteger(holiday.days) ? addDays(start, Math.min(holiday.days - 1, 30)) : start;
  }
  const from = String(holiday.from || '');
  const to = String(holiday.to || '');
  if (!/^\d{2}-\d{2}$/.test(from) || !/^\d{2}-\d{2}$/.test(to)) return start;
  let span = diffDays(`2001-${from}`, `2001-${to}`);
  if (span < 0) span += 365;
  return addDays(start, Math.min(span, 30));
}

export function calendarTopics(state, preset) {
  const day = state && state.calendar && state.calendar.day;
  if (!day) return [];
  const out = holidaysAhead(worldPreset(state, preset), day, CALENDAR_HORIZON, state).filter(({ holiday }) => !holiday.auto).map(({ holiday, days, day: start }) => ({
    topic: clipText(holiday.name, THREAD_TEXT_MAX.topic), days, on: eventEnd(holiday, start),
  }));
  if (preExamWeek(preset, state, day)) out.push({ topic: clipText(preExamWord(preset), THREAD_TEXT_MAX.topic), days: 0, on: addDays(mondayOf(day), 6) });
  return out;
}

export function studyTopics(state, preset) {
  const day = state && state.calendar && state.calendar.day;
  if (!day) return [];
  const subjects = new Map(((state && state.subjects) || []).filter((s) => s && s.id).map((s) => [s.id, s.name || s.id]));
  const out = [];
  for (const e of upcomingEvents(state, preset, { horizon: CALENDAR_HORIZON, limit: 4 })) {
    const name = e.subjectId ? subjects.get(e.subjectId) : '';
    const on = Number.isFinite(e.days) ? addDays(day, e.days) : '';
    if (e.kind === 'announce') out.push({ topic: clipText(name ? `итоги: ${name}` : 'итоги сессии', THREAD_TEXT_MAX.topic), days: e.days, on });
    else out.push({ topic: clipText(name ? `${e.what}: ${name}` : e.what || 'контрольные', THREAD_TEXT_MAX.topic), days: e.days, on });
  }
  if (!out.length && subjects.size) {
    const names = [...subjects.values()];
    const n = Math.abs(diffDays('2000-01-01', day)) % names.length;
    out.push({ topic: clipText(`задание по ${subjectWord(preset, 'dat')} «${names[n]}»`, THREAD_TEXT_MAX.topic), days: null });
  }
  return out;
}

export function settleThreads(state, day) {
  const out = { closed: [], settled: [] };
  const today = String(day || (state && state.calendar && state.calendar.day) || '');
  if (!today) return out;
  for (const t of ensureFeed(state).threads) {
    if (t.state === 'archived' || !t.on || !isPast(t.on, today)) continue;
    if (diffDays(t.on, today) > AFTER_EVENT_DAYS) out.closed.push(t.id);
    else if (t.state === 'active') out.settled.push(t.id);
  }
  for (const id of out.closed) archiveThread(state, id);
  return out;
}

function isPast(on, today) {
  try {
    return diffDays(on, today) > 0;
  } catch {
    return false;
  }
}

export function threadOver(thread, day) {
  return Boolean(thread && thread.on && day && isPast(thread.on, day));
}

export function spawnThread(state, preset, opts = {}) {
  const feed = ensureFeed(state);
  if (feed.threads.filter((t) => t.state === 'active').length >= THREADS_MAX) return { ok: false, reason: 'full' };
  const waiting = !opts.source && feed.threads.find((t) => t.state === 'paused');
  if (waiting) {
    waiting.state = 'active';
    waiting.idle = 0;
    return { ok: true, thread: copy(waiting), resumed: true };
  }
  const roster = opts.roster;
  const people = roster ? folk(state, roster, opts.stop) : [];
  if (people.length < MATES_MIN) return { ok: false, reason: 'no-folk' };
  const day = opts.day || (state && state.calendar && state.calendar.day) || '';
  const open = (src) => feed.threads.filter((t) => t.state === 'active' && t.source === src).length;
  const order = THREAD_SOURCES.includes(opts.source)
    ? [opts.source]
    : [...THREAD_SOURCES].sort((x, y) => open(x) - open(y) || THREAD_SOURCES.indexOf(x) - THREAD_SOURCES.indexOf(y));
  const pairs = pairsOf(people, roster, isWarmTie);
  const turn = Math.abs(diffDays('2000-01-01', day || '2000-01-01'));
  let last = 'no-topic';
  for (const source of order) {
    const topics = source === 'calendar' ? calendarTopics(state, preset)
      : source === 'study' ? studyTopics(state, preset)
        : lifeTopics(state, preset, people, roster);
    for (const t of topics) {
      if (!t.topic || hasTopic(state, t.topic)) continue;
      let members = t.ids;
      let want = t.want;
      if (!members) {
        const p = pairs.length ? pairs[turn % pairs.length] : { a: people[0], b: people[1] };
        const third = source === 'calendar' ? pairs.find((x) => x.a.id === p.a.id && x.b.id !== p.b.id) : null;
        members = [p.a.id, p.b.id, ...(third ? [third.b.id] : [])];
        want = `${p.a.name} и ${p.b.name} заняты этим вместе`;
      }
      const res = startThread(state, { topic: t.topic, members, want, source, day, on: t.on });
      if (res.ok) return res;
      last = res.reason;
    }
  }
  return { ok: false, reason: last };
}
