import { normalizeFeed, ensureFeed, hash } from './feed.mjs';
import { heroGender } from './gender.mjs';
import { bondOf, BONDS } from './bonds.mjs';
import { openTies, circleOf, SHARP_TIES } from './authors.mjs';

const FRIEND_TAGS = new Set(BONDS.filter((b) => b.group === 'friend').map((b) => b.id));

export const LOVERS_DEFAULT = 2;
export const JEALOUS_MAX = 2;

const NO_MEN = /ненавидит мужчин|не любит мужчин|не терпит мужчин/iu;
const COLD = /циник|язвит|колк|холодн|угрюм|заносч|властн|манипул/iu;
const VAIN = /тщеслав|престиж|вторым|статус|вожак|доминир|не любит проигрывать|первым/iu;

const ROMANCE_RANK = { open: 0, careful: 1 };

const seedOf = (state) => `${state && state.grade}|${state && state.house}|${state && state.calendar && state.calendar.termStart}`;

const order = (list, seed, tag) => list
  .map((p) => ({ p, k: parseInt(hash(`${seed}|${tag}|${p.id}`), 36) }))
  .sort((a, b) => a.k - b.k)
  .map((x) => x.p);

export function romanceCandidates(roster, state, gender) {
  if (!roster) return [];
  const g = gender === 'm' ? 'm' : 'f';
  return roster.students.filter((p) => {
    if (!(p.romance in ROMANCE_RANK)) return false;
    if (g === 'm') return p.gender === 'f' && !NO_MEN.test(`${p.romanceNote || ''}`);
    return true;
  });
}

function pickLovers(roster, state, gender, count) {
  const ring = circleOf(state, roster);
  const seed = seedOf(state);
  const rank = (p) => ROMANCE_RANK[p.romance] * 10 - Math.min(((ring.get(p.id) || {}).score || 0), 6);
  const sorted = order(romanceCandidates(roster, state, gender), seed, 'love').sort((a, b) => rank(a) - rank(b));
  const out = [];
  for (const p of sorted) {
    if (out.length >= count) break;
    if (out.some((q) => openTies(q).some((t) => t.to === p.id && t.kind !== 'friend' && t.kind !== 'company'))) continue;
    out.push(p);
  }
  return out;
}

function pickFan(roster, state, taken) {
  const ring = circleOf(state, roster);
  const pool = roster.students.filter((p) => !taken.has(p.id) && p.romance !== 'closed' && !COLD.test(`${(p.voice || {}).surface || ''}`) && ['near', 'mid'].includes((ring.get(p.id) || {}).tier));
  return order(pool, seedOf(state), 'fan')[0] || null;
}

function jealousies(roster, state, lovers, fan, taken, opts = {}) {
  const seed = seedOf(state);
  const mates = new Map(((state && state.classmates) || []).filter((c) => c && c.id).map((c) => [c.id, c]));
  const closeToHeroine = new Set([...mates.values()].filter((c) => FRIEND_TAGS.has((bondOf(state, c.id) || {}).tag)).map((c) => c.id));
  const students = roster.students.filter((p) => !taken.has(p.id));
  const out = [];
  const used = new Set();
  const add = (id, j) => {
    if (used.has(id) || out.length >= JEALOUS_MAX) return false;
    used.add(id);
    out.push([id, { kind: j.kind, over: j.over || '', to: '@heroine' }]);
    return true;
  };
  for (const l of lovers) {
    const rival = order(students, seed, `love:${l.id}`).find((p) => openTies(p).some((t) => t.to === l.id && (t.kind === 'ex' || t.kind === 'close' || t.kind === 'rival')) && p.id !== l.id);
    if (rival && add(rival.id, { kind: 'love', over: l.id })) break;
  }
  const friends = [...lovers.map((l) => l.id), ...(fan ? [fan.id] : []), ...closeToHeroine];
  for (const c of friends) {
    const mate = order(students, seed, `friend:${c}`).find((p) => p.id !== c && openTies(p).some((t) => t.to === c && t.kind === 'close'));
    if (mate && add(mate.id, { kind: 'friend', over: c })) break;
  }
  const vain = order(students, seed, 'vain').find((p) => VAIN.test(`${(p.voice || {}).bias || ''} ${(p.voice || {}).surface || ''}`));
  const sharp = lovers.length ? order(students, seed, 'sharp').find((p) => openTies(p).some((t) => SHARP_TIES.has(t.kind) && lovers.some((l) => l.id === t.to))) : null;
  if (out.length < JEALOUS_MAX) {
    const p = vain || sharp;
    if (p) add(p.id, { kind: 'status' });
  }
  return out;
}

export function assignMinds(state, roster, opts = {}) {
  if (!state || !roster) return false;
  const feed = ensureFeed(state);
  const live = new Set(roster.students.map((p) => p.id));
  const has = Object.entries(feed.minds).some(([id, m]) => live.has(id) && (m.love || m.fan || m.jealous));
  if (has) return false;
  const gender = heroGender(state, opts.hero || '');
  const count = Number.isInteger(opts.lovers) ? Math.max(0, Math.min(LOVERS_DEFAULT, opts.lovers)) : LOVERS_DEFAULT;
  const chosen = count > 0 ? romanceCandidates(roster, state, gender).find((p) => p.id === (state && state.love)) : null;
  const picked = pickLovers(roster, state, gender, count);
  const lovers = chosen ? [chosen, ...picked.filter((p) => p.id !== chosen.id)].slice(0, count) : picked;
  const taken = new Set(lovers.map((p) => p.id));
  const fan = pickFan(roster, state, taken);
  if (fan) taken.add(fan.id);
  const jealous = jealousies(roster, state, lovers, fan, taken, opts);
  const minds = { ...feed.minds };
  for (const p of lovers) minds[p.id] = { ...(minds[p.id] || {}), love: p.romance };
  if (fan) minds[fan.id] = { ...(minds[fan.id] || {}), fan: true };
  for (const [id, j] of jealous) minds[id] = { ...(minds[id] || {}), jealous: j };
  feed.minds = normalizeMindsSafe(minds);
  return true;
}

function normalizeMindsSafe(minds) {
  return normalizeFeed({ minds }).minds;
}

export function feelingsOf(state) {
  const minds = normalizeFeed(state && state.feed).minds;
  return {
    lovers: Object.keys(minds).filter((id) => minds[id].love),
    fans: Object.keys(minds).filter((id) => minds[id].fan),
    jealous: Object.keys(minds).filter((id) => minds[id].jealous).map((id) => ({ id, ...minds[id].jealous })),
  };
}
