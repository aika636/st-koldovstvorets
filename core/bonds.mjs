import { cloneState, pushJournal, isDay } from './state.mjs';
import { genderOfName } from './gender.mjs';

// [id, group, masculine label, feminine label, tone, hint for the secretary]
const BOND_ROWS = [
  ['unknown', 'meet', 'не знакомы', 'не знакомы', 0, 'No established acquaintance'],
  ['known', 'meet', 'знакомы', 'знакомы', 0, 'Acquainted; no clearer bond established'],
  ['budding', 'friend', 'намечается дружба', 'намечается дружба', 1, 'Emerging friendship beyond one pleasant interaction'],
  ['friendly', 'friend', 'приятельствует', 'приятельствует', 1, 'Established casual friendship; limited personal closeness'],
  ['friend', 'friend', 'дружит', 'дружит', 2, 'Established friendship with personal trust'],
  ['close', 'friend', 'дорожит близкой дружбой', 'дорожит близкой дружбой', 2, 'Explicit deep friendship; more than ordinary friendship'],
  ['warm', 'warm', 'относится с симпатией', 'относится с симпатией', 1, 'Clear nonromantic fondness; friendship not established'],
  ['respect', 'warm', 'уважает', 'уважает', 1, 'Values character or competence; warmth not required'],
  ['interest', 'love', 'проявляет романтический интерес', 'проявляет романтический интерес', 1, 'Clear romantic interest; love not established'],
  ['love', 'love', 'влюблён', 'влюблена', 2, 'Love explicitly established; partnership not established'],
  ['couple', 'love', 'в отношениях с вами', 'в отношениях с вами', 2, 'Current mutually acknowledged romantic relationship'],
  ['ex', 'love', 'раньше был с вами в отношениях', 'раньше была с вами в отношениях', 0, 'Former couple; no clearer current bond established'],
  ['strained', 'tense', 'отношения напряжённые', 'отношения напряжённые', -1, 'Ongoing tension; dislike not established'],
  ['dislike', 'tense', 'недолюбливает', 'недолюбливает', -1, 'Established dislike beyond a temporary disagreement'],
  ['hostile', 'tense', 'враждебен', 'враждебна', -2, 'Sustained explicit hostility; not mere rivalry'],
  ['broken', 'tense', 'прекратил общение', 'прекратила общение', -1, 'Explicitly ended contact; not merely an argument'],
  ['unmarked', 'mentor', 'не выделяет', 'не выделяет', 0, 'No distinct professional attention or evaluation'],
  ['noticed', 'mentor', 'обратил внимание', 'обратила внимание', 0, 'Distinct attention; approval not yet established'],
  ['approve', 'mentor', 'одобряет', 'одобряет', 1, 'Positive professional assessment; independent trust not established'],
  ['trustwork', 'mentor', 'доверяет вашей работе', 'доверяет вашей работе', 2, 'Trusts independent work or assigned responsibilities'],
  ['patron', 'mentor', 'покровительствует', 'покровительствует', 2, 'Sustained active backing using authority or resources'],
  ['disappointed', 'mentor', 'разочарован', 'разочарована', -1, 'Established disappointment after unmet professional expectations'],
  ['scrutiny', 'mentor', 'держит на карандаше', 'держит на карандаше', -1, 'Explicit adverse monitoring; not ordinary supervision'],
];

const SHADE_ROWS = [
  ['flirt', 'флиртует', 'флиртует', 'Observable flirtation; love or reciprocity not implied'],
  ['awkward', 'неловкость', 'неловкость', 'Relational awkwardness; not merely personal shyness'],
  ['hurt', 'обижен', 'обижена', 'Unresolved personal hurt within the current bond'],
  ['rival', 'соперничает', 'соперничает', 'Established competition; hostility not implied'],
  ['ally', 'союз по общему делу', 'союз по общему делу', 'Active shared cause; friendship not required'],
  ['debt', 'обязательство', 'обязательство', 'Outstanding obligation; reason must say who owes whom'],
  ['secret', 'общая тайна', 'общая тайна', 'Established shared secret; never reveal its contents'],
  ['care', 'заботится', 'заботится', 'Established personal care beyond one helpful act'],
  ['admire', 'восхищается', 'восхищается', 'Explicit admiration beyond ordinary respect or approval'],
  ['wary', 'побаивается', 'побаивается', 'Established apprehension; hostility not implied'],
  ['jealous', 'ревнует', 'ревнует', 'Jealousy explicitly shown; romance not implied'],
  ['unrequited', 'чувства без взаимности', 'чувства без взаимности', 'Their romantic feelings lack your reciprocation'],
];

export const BONDS = BOND_ROWS.map(([id, group, m, f, tone, hint]) => ({ id, group, m, f, tone, hint }));
export const SHADES = SHADE_ROWS.map(([id, m, f, hint]) => ({ id, m, f, hint }));

const BY_ID = new Map(BONDS.map((b) => [b.id, b]));
const SHADE_BY_ID = new Map(SHADES.map((s) => [s.id, s]));

export const BOND_GROUPS = ['meet', 'friend', 'warm', 'love', 'tense', 'mentor'];
export const ROLES = ['student', 'teacher', 'staff'];
export const SHADES_MAX = 2;
export const REASON_MAX = 60;

const ROLE_GROUPS = {
  student: ['meet', 'friend', 'warm', 'love', 'tense'],
  staff: ['meet', 'friend', 'warm', 'love', 'tense'],
  teacher: BOND_GROUPS,
};

export const isBondTag = (v) => BY_ID.has(v);
export const isShadeId = (v) => SHADE_BY_ID.has(v);
export const bondGroupsFor = (role) => ROLE_GROUPS[role] || ROLE_GROUPS.student;
export const bondsFor = (role) => BONDS.filter((b) => bondGroupsFor(role).includes(b.group));
export const bondAllowed = (tag, role) => BY_ID.has(tag) && bondGroupsFor(role).includes(BY_ID.get(tag).group);
export const toneOfTag = (tag) => (BY_ID.has(tag) ? BY_ID.get(tag).tone : 0);

const pickGender = (g) => (g === 'f' ? 'f' : 'm');

/** Label of a tag for a character of the given gender ('f' / 'm'). */
export const tagLabel = (tag, gender) => (BY_ID.has(tag) ? BY_ID.get(tag)[pickGender(gender)] : '');
export const shadeLabel = (id, gender) => (SHADE_BY_ID.has(id) ? SHADE_BY_ID.get(id)[pickGender(gender)] : '');

/** Starting bond: student unknown (known:true — known), teacher unmarked, staff known. */
export function defaultBond(role, opts = {}) {
  const tag = role === 'teacher' ? 'unmarked' : role === 'staff' ? 'known' : opts.known === false ? 'unknown' : 'known';
  return { tag, shades: [] };
}

/** Old -5..5 score to a tag; the table of the migration. */
export function bondFromLegacy(n, role, known) {
  const v = Math.round(Number(n));
  if (v <= -4) return 'hostile';
  if (v <= -2) return 'dislike';
  if (v === -1) return 'strained';
  if (v <= 1) return defaultBond(role, { known }).tag;
  if (v === 2) return role === 'teacher' ? 'approve' : 'warm';
  if (v <= 4) return role === 'teacher' ? 'trustwork' : 'friend';
  return role === 'teacher' ? 'patron' : 'close';
}

const oneLine = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max).trim() : '');

function cleanShades(list) {
  const out = [];
  for (const s of Array.isArray(list) ? list : []) {
    const id = typeof s === 'string' ? s : s && s.id;
    if (!isShadeId(id) || out.some((x) => x.id === id)) continue;
    const note = oneLine(s && s.note, REASON_MAX);
    out.push({ id, ...(note ? { note } : {}), ...(s && isDay(s.day) ? { day: s.day } : {}) });
  }
  return out.slice(-SHADES_MAX);
}

/** Valid stored bond, or a migrated one from a legacy number, or the role default. */
export function normalizeBond(raw, role, legacyNumber, known) {
  if (raw && typeof raw === 'object' && bondAllowed(raw.tag, role)) {
    const note = oneLine(raw.note, REASON_MAX);
    return { tag: raw.tag, shades: cleanShades(raw.shades), ...(isDay(raw.day) ? { day: raw.day } : {}), ...(note ? { note } : {}) };
  }
  const n = Number(legacyNumber);
  const keepShades = raw && typeof raw === 'object' ? cleanShades(raw.shades) : [];
  if (legacyNumber !== undefined && legacyNumber !== null && Number.isFinite(n)) return { tag: bondFromLegacy(n, role, known), shades: keepShades };
  return { ...defaultBond(role, { known }), shades: keepShades };
}

/** Fields to spread into a normalized person: bond, plus relLegacy when migrating a number. */
export function bondFields(raw, role, known) {
  const src = raw || {};
  const legacy = typeof src.relation === 'number' && Number.isFinite(src.relation) ? src.relation : null;
  const migrating = !(src.bond && typeof src.bond === 'object' && bondAllowed(src.bond.tag, role)) && legacy !== null;
  const prev = Number.isFinite(src.relLegacy) ? src.relLegacy : null;
  const keep = migrating ? legacy : prev;
  return { bond: normalizeBond(src.bond, role, legacy, known), ...(keep !== null ? { relLegacy: keep } : {}) };
}

const personOf = (state, id) => {
  const t = ((state && state.teachers) || []).find((x) => x && x.id === id);
  if (t) return { person: t, role: t.role === 'staff' ? 'staff' : 'teacher' };
  const c = ((state && state.classmates) || []).find((x) => x && x.id === id);
  return c ? { person: c, role: c.role === 'staff' ? 'staff' : 'student' } : { person: null, role: 'student' };
};

/** 'teacher' for mentors, 'student' for classmates, 'staff' when the person says so; null if unknown. */
export function roleOf(state, id) {
  const { person, role } = personOf(state, id);
  return person ? role : null;
}

export const bondsOff = (state) => Boolean(state && state.relOff);

/** Current bond of a person (stored one, or the role default); null for an unknown id. */
export function bondOf(state, id) {
  const { person, role } = personOf(state, id);
  if (!person) return null;
  return normalizeBond(person.bond, role, person.relation, person.known);
}

/** Hidden tone -2..+2 of the main tag; 0 when relationships are off or the person is unknown. */
export function toneOf(state, id) {
  if (bondsOff(state)) return 0;
  const b = bondOf(state, id);
  return b ? toneOfTag(b.tag) : 0;
}

export function genderOfPerson(state, id) {
  const { person } = personOf(state, id);
  if (!person) return 'm';
  return person.gender === 'f' || person.gender === 'm' ? person.gender : genderOfName(person.name) || 'm';
}

/** Player-facing text, e.g. «дружит · соперничает»; opts.gender overrides the stored one. */
export function bondLabel(state, id, opts = {}) {
  const b = bondOf(state, id);
  if (!b) return '';
  const g = opts.gender || genderOfPerson(state, id);
  const parts = [tagLabel(b.tag, g)];
  if (opts.withShades) parts.push(...b.shades.map((s) => shadeLabel(s.id, g)));
  return parts.join(' · ');
}

const sid = (x) => (typeof x === 'string' ? x : x && x.id);
const snapshot = (b) => ({
  tag: b.tag,
  shades: (b.shades || []).map((x) => ({ ...x })),
  ...(b.day ? { day: b.day } : {}),
  ...(b.note ? { note: b.note } : {}),
});

/** What changed between two snapshots (shades as ids or objects): { tag: {from, to} | null, added: [], removed: [] }. */
export function bondDiff(from, to) {
  const a = ((from && from.shades) || []).map(sid);
  const b = ((to && to.shades) || []).map(sid);
  return {
    tag: from && to && from.tag !== to.tag ? { from: from.tag, to: to.tag } : null,
    added: b.filter((x) => !a.includes(x)),
    removed: a.filter((x) => !b.includes(x)),
  };
}

function reasonOf(v) {
  return oneLine(typeof v === 'string' ? v : v && typeof v === 'object' ? v.text : '', REASON_MAX);
}

/**
 * Record a secretary event or a manual correction.
 * ev: { teacherId, tag } | { teacherId, shade, op: '+' | '-' }, optional reason, day.
 * Returns { state, change }; change is null when nothing changed (repeat, unknown person, tag not allowed, relOff).
 */
export function applyBondEvent(state, ev, preset) {
  const id = ev && ev.teacherId;
  const { person, role } = personOf(state, id);
  if (!person || bondsOff(state)) return { state, change: null };
  const cur = bondOf(state, id);
  const day = (ev.day && isDay(ev.day) ? ev.day : '') || (state.calendar && state.calendar.day) || '';
  const reason = reasonOf(ev.reason);
  const next = { tag: cur.tag, shades: cur.shades.map((s) => ({ ...s })) };

  if (ev.tag !== undefined) {
    if (!bondAllowed(ev.tag, role) || ev.tag === cur.tag) return { state, change: null };
    next.tag = ev.tag;
  } else if (isShadeId(ev.shade) && ev.op === '+') {
    if (next.shades.some((s) => s.id === ev.shade)) return { state, change: null };
    next.shades.push({ id: ev.shade, ...(reason ? { note: reason } : {}), day });
    while (next.shades.length > SHADES_MAX) next.shades.shift();
  } else if (isShadeId(ev.shade) && ev.op === '-') {
    if (!next.shades.some((s) => s.id === ev.shade)) return { state, change: null };
    next.shades = next.shades.filter((s) => s.id !== ev.shade);
  } else return { state, change: null };

  const out = cloneState(state);
  const target = personOf(out, id).person;
  target.bond = { ...next, ...(day ? { day } : {}), ...(reason ? { note: reason } : {}) };
  delete target.relation;
  const from = snapshot(cur);
  const to = snapshot(target.bond);
  const names = (x) => `${x.tag}${x.shades.length ? `+${x.shades.map(sid).join('+')}` : ''}`;
  pushJournal(out, {
    kind: 'rel',
    text: `bond ${id} ${names(from)}->${names(to)}`,
    data: { teacherId: id, from, to, reason, day },
  }, preset);
  return { state: out, change: { teacherId: id, from, to, reason, day, ...bondDiff(from, to) } };
}

/**
 * Undo one journaled change (from -> to) without touching later ones: the tag goes back only if it is still `to.tag`,
 * added shades are removed, removed ones return (max two). Without `to` (old receipt) the person is set to `from` as is.
 * The matching journal entry is dropped, so history stays honest.
 */
export function restoreBond(state, id, from, to) {
  const { person, role } = personOf(state, id);
  if (!person || !from || !bondAllowed(from.tag, role)) return state;
  const cur = bondOf(state, id);
  const want = snapshot(cur);
  if (!to) {
    Object.assign(want, snapshot({ tag: from.tag, shades: cleanShades(from.shades), day: from.day, note: from.note }));
    if (!from.day) delete want.day;
    if (!from.note) delete want.note;
  } else {
    const diff = bondDiff(from, to);
    const own = new Map(cleanShades(from.shades).map((x) => [x.id, x]));
    const sameStamp = (cur.day || '') === (to.day || '') && (cur.note || '') === (to.note || '');
    if (diff.tag && cur.tag === diff.tag.to) want.tag = diff.tag.from;
    want.shades = want.shades.filter((x) => !diff.added.includes(x.id));
    for (const x of diff.removed) if (want.shades.length < SHADES_MAX && !want.shades.some((y) => y.id === x)) want.shades.push(own.get(x) || { id: x });
    const order = (list) => list.map(sid);
    const base = order(from.shades || []);
    want.shades.sort((x, y) => (base.indexOf(x.id) + 1 || 99) - (base.indexOf(y.id) + 1 || 99));
    if (sameStamp) {
      for (const k of ['day', 'note']) { if (from[k]) want[k] = from[k]; else delete want[k]; }
    }
  }
  if (JSON.stringify(want) === JSON.stringify(snapshot(cur))) return state;
  const out = cloneState(state);
  const target = personOf(out, id).person;
  target.bond = want;
  delete target.relation;
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  for (let i = out.journal.length - 1; i >= 0; i -= 1) {
    const d = out.journal[i].data;
    if (out.journal[i].kind === 'rel' && d && d.teacherId === id && same(d.from, from) && (!to || same(d.to, to))) { out.journal.splice(i, 1); break; }
  }
  return out;
}

// Upward ladders: a secretary tag climbs one rung per turn.
const LADDERS = [
  ['unknown', 'known', 'budding', 'friendly', 'friend', 'close'],
  ['unknown', 'known', 'warm', 'interest', 'love', 'couple'],
];
const GENERIC_RUNG = { unknown: 0, known: 1, budding: 2, warm: 2, respect: 2, friendly: 3, interest: 3, friend: 4, love: 4, close: 5, couple: 5 };

/**
 * Secretary rel event against the current bond, for one turn: the same state again is dropped (null);
 * a tag may rise only one rung; romance from «known» or lower starts as the +flirt shade.
 * Returns { tag } | { shade, op } | null. Falls and lateral moves are explicit and pass as is.
 */
export function stepRel(cur, ev) {
  if (ev.tag === undefined) {
    const has = (cur.shades || []).some((s) => sid(s) === ev.shade);
    return ev.op === '+' ? (has ? null : { shade: ev.shade, op: '+' }) : (has ? { shade: ev.shade, op: '-' } : null);
  }
  if (ev.tag === cur.tag) return null;
  if (ev.tag === 'known' && cur.tag !== 'unknown') return null;
  const ladder = LADDERS.find((l) => l.includes(ev.tag));
  const to = ladder ? ladder.indexOf(ev.tag) : -1;
  const from = ladder && ladder.includes(cur.tag) ? ladder.indexOf(cur.tag) : GENERIC_RUNG[cur.tag] ?? 1;
  if (!ladder || to <= from + 1) return { tag: ev.tag };
  if ((ev.tag === 'interest' || ev.tag === 'love') && from <= 1) {
    return (cur.shades || []).some((s) => sid(s) === 'flirt') ? null : { shade: 'flirt', op: '+' };
  }
  return { tag: ladder[from + 1] };
}

/** Latest changes of one person, newest first: { day, from, to, reason, ...bondDiff }. */
export function bondHistory(state, id, limit = 3) {
  const out = [];
  const journal = (state && state.journal) || [];
  for (let i = journal.length - 1; i >= 0 && out.length < limit; i -= 1) {
    const e = journal[i];
    const d = e && e.kind === 'rel' && e.data;
    if (!d || d.teacherId !== id || !d.from || !d.to || typeof d.from !== 'object' || typeof d.to !== 'object') continue;
    out.push({ day: e.day || d.day || '', from: d.from, to: d.to, reason: d.reason || '', ...bondDiff(d.from, d.to) });
  }
  return out;
}
