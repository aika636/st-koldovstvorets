import { normName, stopHit } from './stop-names.mjs';
import { normalizeFeed, hash, clipText } from './feed.mjs';
import { diffDays } from './time.mjs';
import { toneOf } from './bonds.mjs';
import { cleanVoiceText, SECRET_TIE } from './secrets.mjs';

export { SECRET_TIE };

export const NEAR_SCORE = 4;
export const MID_SCORE = 2;
export const SEEN_DAYS = 7;

const WARM_TIES = new Set(['friend', 'close', 'company', 'bandmate', 'twin', 'sibling']);
export const SHARP_TIES = new Set(['tension', 'rival', 'ex']);

export const openTies = (p) => (p && Array.isArray(p.ties) ? p.ties.filter((t) => t && t.to && t.kind !== SECRET_TIE) : []);

export const isWarmTie = (t) => WARM_TIES.has(t && t.kind);

const gradeOf = (state) => (Number(state && state.grade) === 12 ? 12 : Number(state && state.grade) === 11 ? 11 : 0);

function seenAgo(state, id, day) {
  const seen = normalizeFeed(state && state.feed).seen[id];
  if (!seen || !seen.day || !day) return Infinity;
  try {
    const d = diffDays(seen.day, day);
    return Number.isFinite(d) ? Math.max(0, d) : Infinity;
  } catch {
    return Infinity;
  }
}

export function circleOf(state, roster) {
  const out = new Map();
  if (!roster) return out;
  const grade = gradeOf(state);
  const house = (state && state.house) || '';
  const day = state && state.calendar && state.calendar.day;
  const mates = new Map(((state && state.classmates) || []).filter((c) => c && c.id).map((c) => [c.id, c]));
  const base = new Map();
  for (const p of roster.students) {
    let s = 0;
    if (grade && p.grade === grade) s += 2;
    if (house && p.house === house) s += 1;
    if (grade && house && p.grade === grade && p.house === house) s += 1;
    const c = mates.get(p.id);
    if (c && c.known === true) s += 1;
    const tone = c ? toneOf(state, p.id) : 0;
    if (tone > 0) s += 2;
    else if (tone < 0) s += 1;
    if (seenAgo(state, p.id, day) <= SEEN_DAYS) s += 2;
    base.set(p.id, s);
  }
  for (const p of roster.students) {
    let s = base.get(p.id);
    if (openTies(p).some((t) => isWarmTie(t) && (base.get(t.to) || 0) >= NEAR_SCORE)) s += 1;
    out.set(p.id, { score: s, tier: s >= NEAR_SCORE ? 'near' : s >= MID_SCORE ? 'mid' : 'far' });
  }
  return out;
}

export function mindOf(state, id) {
  return normalizeFeed(state && state.feed).minds[id] || {};
}

export function nameOfId(id, state, roster) {
  if (id === '@heroine') return '';
  const p = roster && roster.get(id);
  if (p) return p.short || p.name;
  const c = ((state && state.classmates) || []).find((x) => x && x.id === id);
  return (c && c.name) || '';
}

function clipField(v, max, p, roster) {
  return clipText(cleanVoiceText(v, p, roster), max);
}

export function authorOf(p, state, info = {}) {
  const mind = mindOf(state, p.id);
  const v = p.voice || {};
  return {
    id: p.id,
    kind: 'person',
    role: p.role,
    name: p.short || p.name,
    full: p.name,
    masked: false,
    gender: p.gender,
    aliases: p.aliases || [],
    house: p.house || '',
    grade: p.grade || 0,
    post: p.post || '',
    tier: p.role === 'student' ? info.tier || 'far' : p.role,
    score: info.score || 0,
    voice: {
      surface: clipField(v.surface, 70, p, info.roster),
      speech: clipField(v.speech || p.speech, 130, p, info.roster),
      notices: clipField(v.notices, 100, p, info.roster),
      bias: clipField(v.bias, 100, p, info.roster),
      tactic: clipField(v.tactic, 100, p, info.roster),
      limits: clipField(v.limits, 110, p, info.roster),
    },
    interests: (p.interests || []).slice(0, 3),
    topics: mind.topics || [],
    ...(mind.fan ? { fan: true } : {}),
    ...(mind.love ? { love: mind.love } : {}),
    ...(mind.jealous ? { jealous: mind.jealous } : {}),
  };
}

export function feedAuthors(state, roster, opts = {}) {
  if (!roster) return [];
  const ring = circleOf(state, roster);
  const out = [];
  for (const p of roster.students) {
    if (opts.stop && stopHit(p.short || p.name, opts.stop)) continue;
    out.push(authorOf(p, state, { ...ring.get(p.id), roster }));
  }
  for (const p of [...roster.staff, ...roster.teachers]) out.push(authorOf(p, state, { roster }));
  return out;
}

export const rest = (n, k) => parseInt(hash(String(n)), 36) % k;

export const nameKey = (a) => normName(a && a.name);

const stemSet = (text) => new Set(String(text || '').toLowerCase().replace(/ё/g, 'е').match(/\p{L}{5,}/gu)?.map((w) => w.slice(0, 5)) || []);

export const GUESTS_MAX = 2;
export const TEACHER_EVERY = 4;

export function guestsFor(authors, texts, issue) {
  const words = stemSet((texts || []).join(' '));
  if (!words.size) return [];
  const hit = (a) => [...stemSet(`${a.voice.notices} ${a.post}`)].some((s) => words.has(s));
  const staff = authors.filter((a) => a.role === 'staff' && hit(a)).slice(0, GUESTS_MAX);
  const teachers = Number(issue) % TEACHER_EVERY === 0 ? authors.filter((a) => a.role === 'teacher' && hit(a)).slice(0, 1) : [];
  return [...staff, ...teachers].map((a) => a.id);
}
