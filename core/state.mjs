import { runningTermStart } from './time.mjs';
import { cutWords, normalizeClassmates, classmateErrors, normalizeAliases, normalizeNote, normalizeLoreLink } from './classmates.mjs';
import { subjectWord } from './words.mjs';
import { bondFields } from './bonds.mjs';

export { normalizeAliases, ALIASES_MAX, ALIAS_LEN_MAX } from './classmates.mjs';
import { isPortrait, normalizePortrait, normalizeLooks, looksOk } from './portraits.mjs';

export const SCHEMA_VERSION = 4;

export const METADATA_KEY = 'koldo';

export const GRADES = [11, 12];
export const ROSTER_MODES = ['basic', 'extended'];
export const HERO_STARTS = ['new', 'old'];
export const PAST_MAX = 200;

export function emptySurvey() {
  return { faculty: '', year: '', lang: 'ru' };
}

export function normalizePast(v) {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, PAST_MAX).trim() : '';
}

function surveyWith(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = { ...emptySurvey(), ...(typeof src.gender === 'string' ? { gender: src.gender } : {}) };
  for (const key of Object.keys(emptySurvey())) if (typeof src[key] === 'string' && src[key]) out[key] = src[key];
  return out;
}

export function startFields(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    roster: ROSTER_MODES.includes(src.roster) ? src.roster : 'basic',
    grade: GRADES.includes(Number(src.grade)) ? Number(src.grade) : null,
    house: typeof src.house === 'string' && src.house ? src.house.slice(0, 24) : null,
    heroStart: HERO_STARTS.includes(src.heroStart) ? src.heroStart : 'new',
    past: normalizePast(src.past),
    love: typeof src.love === 'string' && src.love ? src.love.slice(0, 40) : null,
  };
}

export function createState(preset, opts = {}) {
  if (!preset || typeof preset !== 'object') throw new TypeError('createState: нужен пресет');

  const startDay = opts.startDay || defaultStartDay(preset);
  const termStart = opts.termStart || startDay;

  return {
    schemaVersion: SCHEMA_VERSION,
    presetId: preset.id,
    lang: preset.lang || 'ru',
    started: false,
    survey: surveyWith(opts.survey),
    ...startFields(opts),
    calendar: {
      day: startDay,
      time: null,
      precision: 'date',
      daypart: null,
      periodIndex: null,
      termStart,
      ...(termStart !== startDay ? { begun: startDay } : {}),
      moved: 0,
      idle: 0,
      source: null,
      heldJump: null,
    },
    subjects: (opts.subjects || []).map(normalizeSubject),
    teachers: (opts.teachers || []).map((t) => normalizeTeacher(t, preset)),
    schedule: { ...(opts.schedule || {}) },
    attendance: { records: [] },
    reputation: { value: numberOr(preset.reputation && preset.reputation.start, 50), warned: false, expelled: false },
    exams: { active: false, term: null, items: [] },
    journal: [],
    pending: [],
    classmates: normalizeClassmates(opts.classmates, preset),
  };
}

export function defaultStartDay(preset, today = new Date(), year) {
  if (Number.isInteger(year) && year > 0) today = new Date(year, today.getMonth(), today.getDate());
  const cal = (preset && preset.calendar) || {};
  const terms = Array.isArray(cal.terms) ? cal.terms : [];
  if (!Number.isInteger(year) && Number.isInteger(cal.year) && cal.year > 0) {
    return `${String(cal.year).padStart(4, '0')}-${cal.yearStart || (terms[0] && terms[0].start) || '09-01'}`;
  }
  const todayDay = `${String(today.getFullYear()).padStart(4, '0')}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  if (/^\d{2}-\d{2}$/.test(cal.yearStart || '')) {
    const y = todayDay.slice(0, 4);
    const here = `${y}-${cal.yearStart}`;
    const late = (Date.parse(here) - Date.parse(todayDay)) / 864e5 > 62;
    return late ? `${String(today.getFullYear() - 1).padStart(4, '0')}-${cal.yearStart}` : here;
  }
  const running = cal.termStart ? '' : runningTermStart(preset, todayDay);
  if (running) return running;
  const md = cal.termStart || (terms[0] && terms[0].start) || '09-01';
  return `${today.getFullYear()}-${md}`;
}

export function normalizeSubject(raw) {
  return {
    id: String(raw.id || '').trim(),
    name: String(raw.name || raw.id || '').trim(),
    teacherId: raw.teacherId ? String(raw.teacherId) : null,
    examKind: raw.examKind ? String(raw.examKind) : null,
    ...(raw.season === 'spring' ? { season: 'spring' } : {}),
    ...(Array.isArray(raw.examKinds) && raw.examKinds.length
      ? { examKinds: raw.examKinds.map(String) }
      : {}),
    grades: Array.isArray(raw.grades)
      ? raw.grades.map((g) => ({
        value: String(g.value),
        day: String(g.day || ''),
        ...(g.bg ? { bg: true } : {}),
        ...(g.why ? { why: String(g.why).slice(0, 80) } : {}),
        ...(g.bg && Number.isFinite(g.fame) && g.fame ? { fame: g.fame } : {}),
      }))
      : [],
    ...(cleanProfile(raw.profile) ? { profile: cleanProfile(raw.profile) } : {}),
    ...(Number.isFinite(raw.bg) && raw.bg > 0 ? { bg: Math.floor(raw.bg) } : {}),
    debt: Boolean(raw.debt),
    ...(raw.debt && raw.debtReason && raw.debtReason !== 'skips' ? { debtReason: String(raw.debtReason) } : {}),
    ...(raw.debt && (raw.debtSkips || raw.debtReason === 'skips' || !raw.debtReason) ? { debtSkips: true } : {}),
    ...placeField('building', raw.building),
    ...placeField('room', raw.room),
  };
}

export function cleanProfile(v) {
  const w = String(v == null ? '' : v).trim().toLowerCase().replace(/ё/g, 'е');
  if (/^(strong|сильн|любим)/.test(w)) return 'strong';
  if (/^(hard|труд|тяжел|слаб)/.test(w)) return 'hard';
  return null;
}

export const PLACE_MAX = 60;

function placeField(key, raw) {
  return textField(key, raw, PLACE_MAX);
}

function textField(key, raw, max) {
  if (typeof raw !== 'string' && typeof raw !== 'number') return {};
  const v = cutWords(raw, max);
  return v ? { [key]: v } : {};
}

export const TEACHER_TEXT_MAX = { post: 60, likes: 120, secret: 160 };

export function teacherDetails(raw) {
  const out = {};
  for (const [key, max] of Object.entries(TEACHER_TEXT_MAX)) {
    Object.assign(out, textField(key, raw && raw[key], max));
  }
  const aliases = normalizeAliases(raw && raw.aliases, raw && raw.name);
  if (aliases.length) out.aliases = aliases;
  const ref = loreRef(raw && raw.lorebook);
  if (raw && raw.source === 'lorebook' && ref) { out.source = 'lorebook'; out.lorebook = ref; }
  const link = normalizeLoreLink(raw && raw.loreLink);
  if (link) out.loreLink = link;
  return out;
}

export function loreRef(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const book = typeof raw.book === 'string' ? raw.book.replace(/\s+/g, ' ').trim().slice(0, 120) : '';
  const uid = typeof raw.uid === 'string' ? raw.uid.trim().slice(0, 60) : (Number.isFinite(raw.uid) ? raw.uid : '');
  return book && uid !== '' ? { book, uid } : null;
}

export const INVITES_MAX = { decided: 60, cool: 30, going: 20, asked: 10, done: 12 };

export function normalizeInvites(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const str = (v, max = 120) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
  const int = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
  const p = src.pending && typeof src.pending === 'object' ? src.pending : null;
  const pending = p && str(p.key) && str(p.personId) && str(p.hookId) && isDay(p.day) ? {
    key: str(p.key), personId: str(p.personId), eventName: str(p.eventName, 80), day: p.day,
    when: str(p.when, 40), hookId: str(p.hookId, 24), tries: int(p.tries), played: p.played === true,
    mark: p.played === true ? str(p.mark, 40) : '',
  } : null;
  const decided = {};
  for (const [k, v] of Object.entries(src.decided && typeof src.decided === 'object' ? src.decided : {}).slice(-INVITES_MAX.decided)) {
    if (str(k) && ['yes', 'no', 'skip'].includes(v)) decided[k] = v;
  }
  const cool = {};
  for (const [k, v] of Object.entries(src.cool && typeof src.cool === 'object' ? src.cool : {}).slice(-INVITES_MAX.cool)) {
    if (str(k) && Number.isInteger(v) && v >= 0) cool[k] = v;
  }
  const going = (Array.isArray(src.going) ? src.going : []).map((g) => (g && typeof g === 'object' && str(g.key) && str(g.withId) && isDay(g.day)
    ? { key: str(g.key), eventName: str(g.eventName, 80), day: g.day, withId: str(g.withId), ...(typeof g.came === 'boolean' || g.came === null ? { came: g.came } : {}) } : null)).filter(Boolean).slice(-INVITES_MAX.going);
  const asked = (Array.isArray(src.asked) ? src.asked : []).map((a) => (a && typeof a === 'object' && str(a.key) && str(a.withId) && isDay(a.day) && isDay(a.from) && isDay(a.to)
    ? { key: str(a.key), withId: str(a.withId), eventName: str(a.eventName, 80), day: a.day, from: a.from, to: a.to, mark: str(a.mark, 40) } : null)).filter(Boolean).slice(-INVITES_MAX.asked);
  const done = (Array.isArray(src.done) ? src.done : []).map((d) => (d && typeof d === 'object' && str(d.mark, 40) && ['go', 'decline', 'came', 'missed'].includes(d.kind) && str(d.key)
    ? { mark: str(d.mark, 40), kind: d.kind, key: str(d.key), eventName: str(d.eventName, 80), withId: str(d.withId) } : null)).filter(Boolean).slice(-INVITES_MAX.done);
  return { n: int(src.n), last: Number.isInteger(src.last) && src.last >= 0 ? src.last : null, pending, decided, cool, going, asked, done };
}

export const FEATS_MAX = { items: 160, moments: 40, why: 120, name: 60, desc: 200 };

export function normalizeFeats(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const str = (v, max = 120) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
  const int = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
  const seen = new Set();
  const items = [];
  for (const it of Array.isArray(src.items) ? src.items : []) {
    if (!it || typeof it !== 'object' || !str(it.id, 60) || seen.has(str(it.id, 60))) continue;
    const m = it.moment && typeof it.moment === 'object' ? it.moment : null;
    const moment = m && str(m.name, FEATS_MAX.name) && str(m.emoji, 16) && str(m.desc, FEATS_MAX.desc) && ['common', 'rare', 'epic'].includes(m.rarity)
      ? { emoji: str(m.emoji, 16), name: str(m.name, FEATS_MAX.name), desc: str(m.desc, FEATS_MAX.desc), rarity: m.rarity } : null;
    if (m && !moment) continue;
    seen.add(str(it.id, 60));
    items.push({ id: str(it.id, 60), src: str(it.src, 40), when: isDay(it.when) ? it.when : '', why: str(it.why, FEATS_MAX.why), n: int(it.n), ...(moment ? { moment } : {}) });
  }
  const moments = items.filter((i) => i.moment).slice(-FEATS_MAX.moments);
  const keep = new Set(moments);
  return { items: items.filter((i) => !i.moment || keep.has(i)).slice(-FEATS_MAX.items), n: int(src.n) };
}

export { PORTRAIT_MAX, isPortrait, normalizePortrait } from './portraits.mjs';

export function normalizeTeacher(raw) {
  return {
    id: String(raw.id || '').trim(),
    name: String(raw.name || raw.id || '').trim(),
    traits: Array.isArray(raw.traits) ? raw.traits.map(String) : [],
    ...(raw.gender === 'f' || raw.gender === 'm' ? { gender: raw.gender } : {}),
    ...bondFields(raw, 'teacher'),
    ...(normalizePortrait(raw.portrait) ? { portrait: normalizePortrait(raw.portrait) } : {}),
    ...teacherDetails(raw),
    ...(normalizeLooks(raw.looks) ? { looks: normalizeLooks(raw.looks) } : {}),
    ...(normalizeNote(raw.note) ? { note: normalizeNote(raw.note) } : {}),
  };
}

export function validateState(state, preset) {
  const errors = [];
  const bad = (m) => errors.push(m);
  const sbj = subjectWord(preset);

  if (!state || typeof state !== 'object') return { ok: false, errors: ['состояние не объект'] };

  const subjectList = Array.isArray(state.subjects) ? state.subjects : [];
  const teacherList = Array.isArray(state.teachers) ? state.teachers : [];
  if (state.schemaVersion !== SCHEMA_VERSION) {
    bad(`версия схемы ${state.schemaVersion}, ожидается ${SCHEMA_VERSION}`);
  }
  if (!state.presetId) bad('нет presetId');
  if (state.roster !== undefined && !ROSTER_MODES.includes(state.roster)) bad(`состав «${state.roster}» неизвестен`);
  if (state.grade !== undefined && state.grade !== null && !GRADES.includes(state.grade)) bad(`класс «${state.grade}» вне 11–12`);

  const c = state.calendar;
  if (!c || typeof c !== 'object') {
    bad('нет календаря');
  } else {
    if (!isDay(c.day)) bad(`календарь: день «${c.day}» не в форме ГГГГ-ММ-ДД`);
    if (c.time !== null && !isTime(c.time)) bad(`календарь: время «${c.time}» не в форме ЧЧ:ММ`);
    if (c.precision !== 'date' && c.precision !== 'datetime') bad(`календарь: точность «${c.precision}»`);
    if (c.precision === 'datetime' && c.time === null) bad('календарь: точность datetime без часов');
    if (!isDay(c.termStart)) bad('календарь: нет начала семестра');
  }

  if (!Array.isArray(state.subjects)) {
    bad('subjects не массив');
  } else {
    const seen = new Set();
    for (const s of state.subjects) {
      if (!s.id) bad(`${sbj} без id`);
      else if (seen.has(s.id)) bad(`${sbj} ${s.id} повторяется`);
      seen.add(s.id);
      if (s.teacherId && !teacherList.some((t) => t.id === s.teacherId)) {
        bad(`${sbj} ${s.id} ссылается на неизвестного преподавателя ${s.teacherId}`);
      }
      for (const key of ['building', 'room']) {
        if (s[key] === undefined || s[key] === null) continue;
        if (typeof s[key] !== 'string' || !s[key].trim() || s[key].length > PLACE_MAX) {
          bad(`${sbj} ${s.id}: ${key === 'building' ? 'корпус' : 'аудитория'} — не строка до ${PLACE_MAX} символов`);
        }
      }
    }
    const max = preset && preset.limits && preset.limits.maxSubjects;
    if (max && state.subjects.length > max) bad(`${subjectWord(preset, 'genMany')} ${state.subjects.length}, потолок ${max}`);
  }

  if (!Array.isArray(state.teachers)) {
    bad('teachers не массив');
  } else {
    const seen = new Set();
    for (const t of state.teachers) {
      if (!t.id) bad('преподаватель без id');
      else if (seen.has(t.id)) bad(`преподаватель ${t.id} повторяется`);
      seen.add(t.id);
      if (t.portrait !== undefined && t.portrait !== null && !isPortrait(t.portrait)) {
        bad(`преподаватель ${t.id}: портрет — не путь от корня таверны и не ссылка http(s)`);
      }
      for (const [key, max] of Object.entries(TEACHER_TEXT_MAX)) {
        if (t[key] === undefined || t[key] === null) continue;
        if (typeof t[key] !== 'string' || !t[key].trim() || t[key].length > max) {
          bad(`преподаватель ${t.id}: поле ${key} — не строка до ${max} символов`);
        }
      }
      if (!looksOk(t.looks)) bad(`преподаватель ${t.id}: описание внешности — не строка до потолка`);
    }
  }

  if (!state.schedule || typeof state.schedule !== 'object') {
    bad('нет расписания');
  } else {
    for (const [dow, list] of Object.entries(state.schedule)) {
      if (!/^[1-7]$/.test(dow)) bad(`расписание: день недели «${dow}» вне 1–7`);
      if (!Array.isArray(list)) {
        bad(`расписание: день ${dow} не массив`);
        continue;
      }
      for (const id of list) {
        if (id !== null && !subjectList.some((s) => s.id === id)) {
          bad(`расписание: день ${dow} — нет в списке ${subjectWord(preset, 'genMany')}: ${id}`);
        }
      }
    }
  }

  if (!state.attendance || !Array.isArray(state.attendance.records)) bad('нет посещаемости');
  if (!state.reputation || typeof state.reputation.value !== 'number') bad('нет репутации');
  if (!state.exams || !Array.isArray(state.exams.items)) {
    bad('нет сессии');
  } else if (state.exams.term !== null && state.exams.term !== undefined
      && !Number.isFinite(state.exams.term)) {
    bad(`сессия: номер периода «${state.exams.term}» не число`);
  } else {
    for (const item of state.exams.items) {
      if (item && item.rolls !== undefined && !Array.isArray(item.rolls)) {
        bad(`сессия: история бросков события ${item.id} не список`);
      }
      if (item && item.announced === false && !isDay(item.announceOn)) {
        bad(`сессия: итог события ${item.id} ждёт объявления без даты`);
      }
    }
  }
  if (!Array.isArray(state.journal)) bad('нет журнала');
  if (!Array.isArray(state.pending)) bad('нет очереди одноразовых инжектов');

  if (state.events !== undefined) {
    if (!Array.isArray(state.events)) bad('свои события — не список');
    else {
      for (const e of state.events) {
        if (!e || typeof e !== 'object' || typeof e.name !== 'string' || !e.name.trim()) bad('своё событие без названия');
        else if (!isDay(e.from)) bad(`событие «${e.name}»: день «${e.from}» не в форме ГГГГ-ММ-ДД`);
        else if (e.to !== undefined && e.to !== null && (!isDay(e.to) || e.to < e.from)) bad(`событие «${e.name}»: конец раньше начала`);
        else if (e.off !== undefined && typeof e.off !== 'boolean') bad(`событие «${e.name}»: «занятий нет» — не да/нет`);
        else if (e.open !== undefined && typeof e.open !== 'boolean') bad(`событие «${e.name}»: «до отмены» — не да/нет`);
        else if (e.pause !== undefined && typeof e.pause !== 'boolean') bad(`событие «${e.name}»: «приостановка» — не да/нет`);
      }
    }
  }
  if (state.holidayHooks !== undefined && !Array.isArray(state.holidayHooks)) bad('поводы праздников — не список');
  if (state.invites !== undefined && (!state.invites || typeof state.invites !== 'object' || Array.isArray(state.invites))) bad('приглашения — не объект');
  if (state.feats !== undefined && (!state.feats || typeof state.feats !== 'object' || Array.isArray(state.feats))) bad('ачивки — не объект');

  for (const m of classmateErrors(state)) bad(m);

  return { ok: errors.length === 0, errors };
}

export function migrate(state, preset) {
  if (!state || typeof state !== 'object') return createState(preset);
  let out = { ...state };

  if (numberOr(out.schemaVersion, 0) < 2) out = examTermsV2(out);

  out.schemaVersion = SCHEMA_VERSION;
  out.presetId = out.presetId || preset.id;
  out.lang = out.lang || preset.lang || 'ru';
  out.started = Boolean(out.started);
  out.survey = surveyWith(out.survey);
  Object.assign(out, startFields(out));
  delete out.canonVocab;
  delete out.canonLayer;
  out.calendar = { ...createState(preset).calendar, ...(out.calendar || {}) };
  out.subjects = Array.isArray(out.subjects) ? out.subjects.map(normalizeSubject) : [];
  out.teachers = Array.isArray(out.teachers) ? out.teachers.map((t) => normalizeTeacher(t, preset)) : [];
  out.schedule = out.schedule && typeof out.schedule === 'object' ? out.schedule : {};
  out.attendance = { records: Array.isArray(out.attendance && out.attendance.records) ? out.attendance.records : [] };
  out.reputation = {
    value: numberOr(out.reputation && out.reputation.value, numberOr(preset.reputation && preset.reputation.start, 50)),
    warned: Boolean(out.reputation && out.reputation.warned),
    expelled: Boolean(out.reputation && out.reputation.expelled),
    ...(out.reputation && out.reputation.fame && isDay(out.reputation.fame.day)
      ? { fame: { day: out.reputation.fame.day, g: numberOr(out.reputation.fame.g, 0), e: numberOr(out.reputation.fame.e, 0) } }
      : {}),
  };
  out.exams = {
    active: Boolean(out.exams && out.exams.active),
    term: Number.isFinite(out.exams && out.exams.term) ? out.exams.term : null,
    items: Array.isArray(out.exams && out.exams.items) ? out.exams.items : [],
  };
  out.journal = Array.isArray(out.journal) ? out.journal : [];
  out.pending = Array.isArray(out.pending) ? out.pending : [];
  out.classmates = normalizeClassmates(out.classmates, preset, { taken: out.teachers.map((t) => t.id) });
  delete out.classmateCandidates;
  delete out.loreFound;
  delete out.loreSkipped;
  const own = (p) => { if (p.canon === undefined) return p; const { canon, ...rest } = p; return rest; };
  out.teachers = out.teachers.map(own);
  out.classmates = out.classmates.map(own);
  if (out.invites !== undefined) out.invites = normalizeInvites(out.invites);
  delete out.bullying;
  if (out.relPace === 'off') out.relOff = true;
  if (out.relOff !== undefined) out.relOff = out.relOff === true;
  delete out.relPace;
  delete out.relStreak;
  delete out.relDay;
  if (out.feats !== undefined) out.feats = normalizeFeats(out.feats);
  return out;
}

function examTermsV2(state) {
  const out = { ...state };
  const exams = out.exams && typeof out.exams === 'object' ? out.exams : {};
  const items = Array.isArray(exams.items) ? exams.items : [];

  const renamed = new Map();
  const migrated = items.map((raw) => {
    const item = { ...raw };
    if (Number.isFinite(item.term)) return item;
    item.term = 0;
    const old = String(item.id == null ? '' : item.id);
    if (old) {
      item.id = `0:${old}`;
      renamed.set(old, item.id);
    }
    return item;
  });

  out.exams = {
    ...exams,
    items: migrated,
    term: Number.isFinite(exams.term) ? exams.term : (migrated.length ? 0 : null),
  };

  out.journal = (Array.isArray(out.journal) ? out.journal : []).map((entry) => {
    const id = entry && entry.data ? entry.data.examId : null;
    if (id == null || !renamed.has(String(id))) return entry;
    return { ...entry, data: { ...entry.data, examId: renamed.get(String(id)) } };
  });

  out.pending = (Array.isArray(out.pending) ? out.pending : []).map((inject) => {
    const m = /^exam:(.+):(\d+)$/.exec(String((inject && inject.id) || ''));
    if (!m || !renamed.has(m[1])) return inject;
    return { ...inject, id: `exam:${renamed.get(m[1])}:${m[2]}` };
  });

  out.schemaVersion = 2;
  return out;
}

export function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

export const findSubject = (state, id) => (state.subjects || []).find((s) => s.id === id) || null;
export const findTeacher = (state, id) => (state.teachers || []).find((t) => t.id === id) || null;

export function teacherOfSubject(state, subjectId) {
  const s = findSubject(state, subjectId);
  return s && s.teacherId ? findTeacher(state, s.teacherId) : null;
}

export function pushJournal(state, entry, preset) {
  const cap = (preset && preset.limits && preset.limits.journalSize) || 200;
  state.journal.push({ day: (state.calendar && state.calendar.day) || '', ...entry });
  if (state.journal.length > cap) state.journal.splice(0, state.journal.length - cap);
  return state;
}

export function pushPending(state, inject) {
  if (!state.pending.some((p) => p.id === inject.id)) state.pending.push(inject);
  return state;
}

export function takePending(state) {
  const out = state.pending;
  state.pending = [];
  return out;
}

export function labelFor(labels, value) {
  if (!Array.isArray(labels) || !labels.length) return '';
  for (const l of labels) if (value <= l.upTo) return l.label;
  return labels[labels.length - 1].label;
}

export function joinSentences(parts) {
  const seen = [];
  for (const p of (parts || [])) {
    const s = String(p == null ? '' : p).trim();
    if (s && !seen.includes(s)) seen.push(s);
  }
  return seen
    .map((s, i) => (i === 0 ? s : s.charAt(0).toLocaleUpperCase('ru') + s.slice(1)))
    .map((s) => (/[.!?…:]$/.test(s) ? s : `${s}.`))
    .join(' ');
}

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
export const isTime = (v) => typeof v === 'string' && /^\d{2}:\d{2}$/.test(v);

function numberOr(v, fallback) {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
