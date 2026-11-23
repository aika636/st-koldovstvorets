import { HARD_STOPS, STOP_CHAR, COMMON_NAME_WORDS, normName, stopHit } from './stop-names.mjs';
import { slugify } from './text-utils.mjs';
import { bondFields, bondAllowed } from './bonds.mjs';
import { isPortrait, normalizePortrait, normalizeLooks, looksOk } from './portraits.mjs';

export const HEROINE = '@heroine';

export const SOURCES = ['roster', 'manual'];

export const CLASSMATE_TEXT_MAX = { name: 80, desire: 240, problem: 240, club: 140, seed: 40, tie: 120, manner: 140 };

const OLD_TEXT_MAX = { desire: 120, problem: 160, club: 60 };

function healCut(v, key) {
  if (!OLD_TEXT_MAX[key] || v.length !== OLD_TEXT_MAX[key] || /[.!?…»)]$/u.test(v)) return v;
  const at = v.lastIndexOf(' ');
  return at > v.length / 2 ? `${v.slice(0, at).replace(/[\s,;:\-–—]+$/u, '')}…` : v;
}

export const CLASSMATE_ID_MAX = 24;

function oneLine(raw, max) {
  if (typeof raw !== 'string' && typeof raw !== 'number') return '';
  return String(raw).replace(/\s+/g, ' ').trim().slice(0, max).trim();
}

export function cutWords(raw, max) {
  const t = oneLine(raw, 4000);
  if (t.length <= max) return t;
  const room = t.slice(0, max - 1);
  const at = room.lastIndexOf(' ');
  return `${(at > max / 2 ? room.slice(0, at) : room).replace(/[\s,;:\-–—]+$/u, '')}…`;
}

export const ALIASES_MAX = 6;
export const ALIAS_LEN_MAX = 60;

const wordsOf = (s) => normName(s).split(' ').filter(Boolean);

function caseForm(w, n) {
  if (w === n || w.length < n.length || w.length > n.length + 3) return false;
  let p = 0;
  while (p < n.length && w[p] === n[p]) p++;
  return p >= 3 && p >= n.length - 1;
}

function junkAlias(alias, nameWords) {
  const ws = wordsOf(alias);
  if (!ws.length) return true;
  if (ws.every((w) => COMMON_NAME_WORDS.has(w))) return true;
  return ws.length === 1 && !nameWords.includes(ws[0]) && nameWords.some((n) => caseForm(ws[0], n));
}

export function normalizeAliases(raw, name = '') {
  const list = Array.isArray(raw) ? raw : (typeof raw === 'string' ? raw.split(',') : []);
  const own = String(name == null ? '' : name).replace(/\s+/g, ' ').trim().toLowerCase();
  const seen = new Set([own]);
  const nameWords = wordsOf(name);
  const out = [];
  for (const item of list) {
    if (typeof item !== 'string' && typeof item !== 'number') continue;
    const v = String(item).replace(/\s+/g, ' ').trim().slice(0, ALIAS_LEN_MAX).trim();
    const key = v.toLowerCase();
    if (!v || seen.has(key) || junkAlias(v, nameWords)) continue;
    seen.add(key);
    out.push(v);
    if (out.length >= ALIASES_MAX) break;
  }
  return out;
}

export function normalizeTie(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const to = oneLine(raw.to, 64);
  const what = cutWords(raw.what, CLASSMATE_TEXT_MAX.tie);
  if (!to && !what) return null;
  return { to, what };
}

export function normalizeClassmate(raw, preset) {
  if (!raw || typeof raw !== 'object') return null;
  const name = oneLine(raw.name, CLASSMATE_TEXT_MAX.name);
  if (!name) return null;
  const id = oneLine(raw.id, CLASSMATE_ID_MAX) || slugify(name, { maxLength: CLASSMATE_ID_MAX });
  const out = {
    id,
    name,
    ...(raw.gender === 'f' || raw.gender === 'm' ? { gender: raw.gender } : {}),
    source: SOURCES.includes(raw.source) ? raw.source : 'manual',
    known: raw.known !== false,
    locked: Boolean(raw.locked),
  };
  Object.assign(out, bondFields(raw, 'student', out.known));
  const own = out.source === 'manual';
  if (own) {
    for (const key of ['desire', 'problem', 'club', 'seed', 'manner']) {
      const v = healCut(cutWords(raw[key], CLASSMATE_TEXT_MAX[key]), key);
      if (v) out[key] = v;
    }
  }
  const aliases = normalizeAliases(raw.aliases, name);
  if (aliases.length) out.aliases = aliases;
  const tie = own ? normalizeTie(raw.tie) : null;
  if (tie) out.tie = tie;
  const portrait = normalizePortrait(raw.portrait);
  if (portrait) out.portrait = portrait;
  const looks = own ? normalizeLooks(raw.looks) : '';
  if (looks) out.looks = looks;
  const note = normalizeNote(raw.note);
  if (note) out.note = note;
  const loreLink = normalizeLoreLink(raw.loreLink);
  if (loreLink) out.loreLink = loreLink;
  return out;
}

export function normalizeLoreLink(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const book = typeof raw.book === 'string' ? raw.book.replace(/\s+/g, ' ').trim().slice(0, 120) : '';
  const uid = typeof raw.uid === 'string' ? raw.uid.trim().slice(0, 60) : (Number.isFinite(raw.uid) ? raw.uid : '');
  const name = typeof raw.name === 'string' ? raw.name.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
  return book && uid !== '' ? { book, uid, ...(name ? { name } : {}) } : null;
}

export const NOTE_MAX = 600;

export function normalizeNote(raw) {
  if (typeof raw !== 'string') return '';
  return raw.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, NOTE_MAX).trim();
}

export function setPersonNote(state, id, text) {
  const person = [...((state && state.teachers) || []), ...((state && state.classmates) || [])].find((x) => x && x.id === id);
  if (!person) return { ok: false, code: 'unknown', error: `человека «${id}» нет ни среди преподавателей, ни на курсе` };
  const note = normalizeNote(text);
  if (note) person.note = note;
  else delete person.note;
  return { ok: true, note };
}

export function normalizeClassmates(list, preset, opts = {}) {
  const out = [];
  const taken = new Set((opts.taken || []).map(String));
  for (const raw of Array.isArray(list) ? list : []) {
    const c = normalizeClassmate(raw, preset);
    if (!c || out.some((x) => x.id === c.id)) continue;
    if (taken.has(c.id)) c.id = classmateIdOf(c.name, [...taken, ...out.map((x) => x.id)]);
    out.push(c);
  }
  return out;
}

export function classmateErrors(state) {
  const errors = [];
  if (state.classmates === undefined) return errors;
  if (!Array.isArray(state.classmates)) return ['classmates не массив'];
  const teachers = new Set((Array.isArray(state.teachers) ? state.teachers : []).map((t) => t && t.id));
  const seen = new Set();
  for (const c of state.classmates) {
    if (!c || typeof c !== 'object' || !c.id) { errors.push('однокурсник без id'); continue; }
    if (seen.has(c.id)) errors.push(`однокурсник ${c.id} повторяется`);
    seen.add(c.id);
    if (teachers.has(c.id)) errors.push(`однокурсник ${c.id}: тот же id у преподавателя`);
    if (typeof c.name !== 'string' || !c.name.trim() || c.name.length > CLASSMATE_TEXT_MAX.name) {
      errors.push(`однокурсник ${c.id}: имя — не строка до ${CLASSMATE_TEXT_MAX.name} символов`);
    }
    if (!(c.bond && typeof c.bond === 'object' && bondAllowed(c.bond.tag, 'student')) && !Number.isFinite(c.relation)) errors.push(`однокурсник ${c.id}: нет состояния отношений`);
    for (const key of ['desire', 'problem', 'club', 'seed', 'manner']) {
      if (c[key] === undefined) continue;
      if (typeof c[key] !== 'string' || !c[key].trim() || c[key].length > CLASSMATE_TEXT_MAX[key]) {
        errors.push(`однокурсник ${c.id}: поле ${key} — не строка до ${CLASSMATE_TEXT_MAX[key]} символов`);
      }
    }
    if (c.tie !== undefined && (!c.tie || typeof c.tie !== 'object'
      || typeof c.tie.what !== 'string' || c.tie.what.length > CLASSMATE_TEXT_MAX.tie)) {
      errors.push(`однокурсник ${c.id}: связь — не {to, what}`);
    }
    if (c.portrait !== undefined && c.portrait !== null && !isPortrait(c.portrait)) {
      errors.push(`однокурсник ${c.id}: портрет — не путь от корня таверны и не ссылка http(s)`);
    }
    if (!looksOk(c.looks)) errors.push(`однокурсник ${c.id}: описание внешности — не строка до потолка`);
  }
  return errors;
}

export function sameName(a, b) {
  const x = normName(a);
  const y = normName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  return covers(x.split(' '), y.split(' ')) || covers(y.split(' '), x.split(' '));
}

function covers(short, long) {
  if (short.length > long.length) return false;
  if (short.every((t) => t.length < 3) && short.length < 2) return false;
  const used = new Set();
  for (const t of short) {
    const i = long.findIndex((w, k) => !used.has(k) && (t.length >= 3 ? w === t : w.startsWith(t)));
    if (i < 0) return false;
    used.add(i);
  }
  return true;
}

export const namesOf = (p) => [p && p.name, ...((p && p.aliases) || [])].filter((n) => typeof n === 'string' && n);

export const isPerson = (p, name) => namesOf(p).some((n) => sameName(n, name));

export function findClassmate(state, idOrName) {
  const list = (state && Array.isArray(state.classmates)) ? state.classmates : [];
  return findIn(list, idOrName);
}

function findIn(list, idOrName) {
  const raw = String(idOrName == null ? '' : idOrName).trim();
  if (!raw) return null;
  const byId = list.find((c) => c && c.id === raw);
  if (byId) return byId;
  const key = normName(raw);
  const exact = list.filter((c) => c && namesOf(c).some((n) => normName(n) === key));
  if (exact.length === 1) return exact[0];
  const near = list.filter((c) => c && isPerson(c, raw));
  return near.length === 1 ? near[0] : null;
}

export function classmateIdOf(name, taken = []) {
  const busy = new Set([...taken].map(String));
  const base = slugify(name, { maxLength: CLASSMATE_ID_MAX });
  if (!busy.has(base)) return base;
  for (let n = 2; n < 1000; n += 1) {
    const tail = `-${n}`;
    const id = `${base.slice(0, CLASSMATE_ID_MAX - tail.length)}${tail}`;
    if (!busy.has(id)) return id;
  }
  return `${base}-x`;
}

function takenIds(state) {
  return [
    ...(state.classmates || []),
    ...(state.teachers || []),
  ].map((x) => x && x.id).filter(Boolean);
}

function nameProblem(state, name, opts = {}) {
  const hit = opts.stop ? stopHit(name, opts.stop) : null;
  if (hit && (HARD_STOPS.includes(hit.kind) || (hit.kind === STOP_CHAR && !opts.manual))) {
    return { code: 'stop', error: `«${name}» — в стоп-листе (${hit.name})`, hit };
  }
  const key = normName(name);
  const teacher = (state.teachers || []).find((t) => t
    && (namesOf(t).some((n) => normName(n) === key) || (!opts.manual && isPerson(t, name))));
  if (teacher) return { code: 'teacher', error: `«${name}» — это преподаватель`, id: teacher.id };
  return null;
}

export function addClassmate(state, raw, preset, opts = {}) {
  if (!Array.isArray(state.classmates)) state.classmates = [];
  const name = oneLine(raw && raw.name, CLASSMATE_TEXT_MAX.name);
  if (!name) return { ok: false, code: 'empty', error: 'нет имени' };
  const source = SOURCES.includes(raw.source) ? raw.source : 'manual';
  const problem = nameProblem(state, name, { stop: opts.stop, manual: source === 'manual' });
  if (problem) return { ok: false, ...problem };
  const known = state.classmates.find((c) => isPerson(c, name));
  if (known) return { ok: false, code: 'known', id: known.id, error: `«${name}» уже на курсе: ${known.name}` };

  const id = classmateIdOf(name, takenIds(state));
  const c = normalizeClassmate({
    ...raw, id, name, source,
    locked: raw.locked === undefined ? source === 'manual' : Boolean(raw.locked),
  }, preset);
  state.classmates.push(c);
  return { ok: true, id };
}

export function updateClassmate(state, id, patch, preset, opts = {}) {
  const c = (state.classmates || []).find((x) => x.id === id);
  if (!c) return { ok: false, code: 'unknown', error: `однокурсника «${id}» нет` };
  const p = patch && typeof patch === 'object' ? patch : {};
  const rawPortrait = typeof p.portrait === 'string' ? p.portrait.trim() : '';
  const portrait = rawPortrait ? normalizePortrait(rawPortrait) : '';
  if ('portrait' in p && rawPortrait && !portrait) {
    return { ok: false, code: 'bad-portrait', error: 'не годится адрес фото: нужен путь от корня таверны или ссылка http(s)' };
  }
  if ('name' in p) {
    const name = oneLine(p.name, CLASSMATE_TEXT_MAX.name);
    if (!name) return { ok: false, code: 'empty', error: 'нет имени' };
    const problem = nameProblem(state, name, { stop: opts.stop, manual: true });
    if (problem) return { ok: false, ...problem };
    const twin = state.classmates.find((x) => x.id !== id && normName(x.name) === normName(name));
    if (twin) return { ok: false, code: 'known', id: twin.id, error: `«${name}» уже на курсе` };
    c.name = name;
  }
  for (const key of ['desire', 'problem', 'club', 'manner']) {
    if (!(key in p)) continue;
    const v = cutWords(p[key], CLASSMATE_TEXT_MAX[key]);
    if (v) c[key] = v;
    else delete c[key];
  }
  if ('tie' in p) {
    const tie = normalizeTie(p.tie);
    if (tie && tie.to === id) return { ok: false, code: 'self-tie', error: 'связь с самим собой' };
    if (tie) c.tie = tie;
    else delete c.tie;
  }
  if ('portrait' in p) {
    if (portrait) c.portrait = portrait;
    else delete c.portrait;
  }
  if ('looks' in p) {
    const looks = normalizeLooks(p.looks);
    if (looks) c.looks = looks;
    else delete c.looks;
  }
  c.locked = opts.locked === undefined ? true : Boolean(opts.locked);
  return { ok: true };
}

export function removeClassmate(state, id) {
  const list = state.classmates || [];
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) return { ok: false, code: 'unknown', error: `однокурсника «${id}» нет` };
  const [removed] = list.splice(i, 1);
  for (const c of list) if (c.tie && c.tie.to === id) delete c.tie;
  return { ok: true, removed };
}

export function tieTarget(state, to) {
  const id = String(to == null ? '' : to).trim();
  if (!id) return { kind: 'none', id: '', name: '' };
  if (id === HEROINE) return { kind: 'heroine', id, name: '' };
  const c = (state.classmates || []).find((x) => x.id === id);
  if (c) return { kind: 'classmate', id, name: c.name };
  const t = (state.teachers || []).find((x) => x.id === id);
  if (t) return { kind: 'teacher', id, name: t.name || t.id };
  return { kind: 'unknown', id, name: '' };
}

export function markerPeople(state) {
  return [
    ...((state && state.teachers) || []),
    ...((state && state.classmates) || []).map((c) => ({ id: c.id, name: c.name, role: 'student', ...(c.aliases ? { aliases: c.aliases } : {}) })),
  ];
}

export function carryRoster(live, before) {
  if (!before || typeof before !== 'object' || !live || !Array.isArray(live.classmates)) return before;
  const old = new Map((Array.isArray(before.classmates) ? before.classmates : []).filter(Boolean).map((c) => [c.id, c]));
  const roster = live.classmates.filter((c) => c && c.id).map((c) => {
    const was = old.get(c.id);
    return was ? { ...c, bond: was.bond } : { ...c };
  });
  const same = roster.length === old.size && roster.every((c) => {
    const was = old.get(c.id);
    return was && JSON.stringify(was) === JSON.stringify(c);
  });
  if (same) return before;
  return { ...before, classmates: roster };
}

export function carryNotes(live, before) {
  if (!before || typeof before !== 'object' || !live || !Array.isArray(live.teachers) || !Array.isArray(before.teachers)) return before;
  const notes = new Map(live.teachers.filter((t) => t && t.id).map((t) => [t.id, t.note || '']));
  if (before.teachers.every((t) => !t || (t.note || '') === (notes.get(t.id) || ''))) return before;
  return {
    ...before,
    teachers: before.teachers.map((t) => {
      if (!t) return t;
      const { note: _drop, ...rest } = t;
      return notes.get(t.id) ? { ...rest, note: notes.get(t.id) } : rest;
    }),
  };
}

export function rosterClassmate(person, preset, extra = {}) {
  return normalizeClassmate({
    id: person.id,
    name: person.name,
    aliases: (person.aliases || []).filter((a) => /\p{L}/u.test(a)),
    source: 'roster',
    ...(person.gender === 'f' || person.gender === 'm' ? { gender: person.gender } : {}),
    ...extra,
  }, preset);
}

export const isRoster = (c) => Boolean(c && c.source === 'roster');

export function syncClassmates(state, roster, preset) {
  if (!roster || !state) return state;
  const list = Array.isArray(state.classmates) ? state.classmates : [];
  const out = [];
  const taken = new Set();
  for (const c of list) {
    if (!c) continue;
    const hit = roster.get(c.id);
    const byName = hit ? null : roster.find(c.name, 'student');
    const person = hit && hit.role === 'student' ? hit : byName;
    if (!person || taken.has(person.id)) { out.push(c); continue; }
    taken.add(person.id);
    out.push(rosterClassmate(person, preset, {
      bond: c.bond, relLegacy: c.relLegacy, known: c.known, note: c.note, portrait: c.portrait, locked: c.locked,
    }));
  }
  const extra = [];
  for (const p of roster.students) {
    if (!taken.has(p.id) && !out.some((c) => c.id === p.id)) {
      extra.push(rosterClassmate(p, preset, { known: false }));
    }
  }
  return { ...state, classmates: [...out, ...extra] };
}

export function startClassmates(roster, form, preset) {
  const f = form || {};
  const old = f.heroStart === 'old';
  const close = new Set(old ? f.close || [] : []);
  const tension = old ? f.tension : '';
  return roster.students.map((p) => {
    const known = old && (p.grade === Number(f.grade) || close.has(p.id) || p.id === tension);
    const tag = close.has(p.id) ? 'friendly' : p.id === tension ? 'strained' : null;
    return rosterClassmate(p, preset, { known, ...(tag ? { bond: { tag, shades: [] } } : {}) });
  });
}

export function oldStartErrors(roster, form) {
  const f = form || {};
  if (f.heroStart !== 'old') return [];
  const pool = new Set(roster.students.map((p) => p.id));
  const mentors = new Set(roster.teachers.map((p) => p.id));
  const close = Array.isArray(f.close) ? f.close : [];
  const errors = [];
  if (close.length > 5) errors.push('Близких не больше пяти.');
  if (close.some((id) => !pool.has(id))) errors.push('Близкие должны быть из учеников выбранного состава.');
  if (f.tension) {
    if (!(pool.has(f.tension) || mentors.has(f.tension))) errors.push('Напряжение должно быть с учеником выбранного состава или наставником.');
    else if (close.includes(f.tension)) errors.push('Напряжение не может быть с близким.');
  }
  return errors;
}
