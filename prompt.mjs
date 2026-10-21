import { labelFor } from './core/state.mjs';
import { addDays, weekIndex, phaseOf, weekdayIn, termAt, preExamWeek, PRE_EXAMS_DEFAULT } from './core/time.mjs';
import { sceneDigests, digestMaxOf } from './core/scene-digest.mjs';
import { cutText } from './core/feed-text.mjs';
import { dayPlan, currentPeriod, lessonKey } from './core/schedule.mjs';
import { debts, overallScore, DEBT_RETAKE } from './core/gradebook.mjs';
import { bondOf, defaultBond, roleOf, bondsOff, bondsFor, SHADES } from './core/bonds.mjs';
import { reputationLabel } from './core/reputation.mjs';
import { notableGrade } from './core/fame.mjs';
import { examMode, publicView, retakeList, weekAheadKinds, examKinds, trialSubjects } from './core/exams.mjs';
import { upcomingEvents } from './core/upcoming.mjs';
import { holidayBackground, bare, buzzFor } from './core/holidays.mjs';
import { feedBackground, BACKGROUND_MAX } from './core/feed.mjs';
import { unsaid } from './core/plot.mjs';
import { goingToday } from './core/invites.mjs';
import { heroWords, presetGender } from './core/gender.mjs';
import { subjectVars, upFirst } from './core/words.mjs';

export const DEFAULT_LABELS = {
  weekdays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  phases: {
    study: '', weekend: 'weekend', vacation: 'vacation', break: 'vacation', exams: '',
    preExams: PRE_EXAMS_DEFAULT,
  },

  day: '{weekday}, week {week}',
  dayOutside: '{weekday}, {phase}',
  dayPhase: '{weekday}, week {week}, {phase}',

  now: 'now: {subject}{teacher}',
  next: 'next: {subject}{teacher}',
  today: 'today: {list}',
  nowMark: '{subject} (now)',
  teacherOf: ' ({teacher})',

  debts: '{debtPlural}: {list}',
  retakes: 'retake: {list}',
  lastTry: '{subject} (last attempt)',
  expelled: '{hero} is expelled: {paths}',
  expelPaths: 'appeal, reinstatement or transfer to another school remain; the scene decides which',
  score: '{scoreName}: {value}',
  exams: '{examPeriod}: {count} not passed, {days} {daysWord} left',
  examsNoDays: '{examPeriod}: {count} not passed',
  relation: '{teacher} toward {hero}: {label}',
  reputation: 'reputation: {label}',
  study: 'notable grades: {list}',
  studyItem: '{subject} — {grade} ({when})',
  studyToday: 'today',
  studyYesterday: 'yesterday',

  glue: '. ',
  end: '.',
  listGlue: ', ',

  nearToday: 'today',
  nearTomorrow: 'tomorrow',
  weekdaysOn: ['on Monday', 'on Tuesday', 'on Wednesday', 'on Thursday', 'on Friday', 'on Saturday', 'on Sunday'],
  nearExam: '{when} — {what}',
  nearExamSubject: '{when} — {what}: {subject}',
  nearAnnounce: '{when} results announced: {subject}',
  nearGlue: '; ',
  weekAhead: 'in a week — {what}: {subjects}',
  weekAheadAll: 'in a week — {what}',

  holidayNow: 'today is {name} — {note}',
  holidayNowBare: 'today is {name}',
  holidayAhead: '{when} {name} — {note}',
  holidayAheadBare: '{when} {name}',
  holidayAlso: 'and {name} — {note}',
  holidayAlsoBare: 'and {name}',
  holidaySoon: 'soon',
  holidayGoing: '{hero} and {who} agreed to go together: {name}',

  feed: 'Talk in {crowdIn}: {list}',
  feedFact: '{text}',
  feedRumor: '{text} — rumor',
  feedTalk: '{text} — being discussed',
  feedTalkQuote: 'being discussed: «{text}»',
  feedGossip: '«{text}» — a rumor, unknown if true',
  feedGlue: '; ',

  during: 'Meanwhile: {list}',
  duringItem: '{when} — {text}',
  whenAfternoon: 'after lunch',
  whenEvening: 'in the evening',
  manner: 'How {teacher} teaches: {lesson}{grading}',
  mannerGrading: ' Grading: {grading}.',
  people: 'In the scene: {list}',
  peopleGlue: '; ',

  dayList: '',
  terms: '',

  tone: 'No bullying at school: conflicts are quarrels, rivalry, jealousy and grudges; no character turns into systematic persecution or humiliation.',
};

export const FEED_LINE_MAX = 220;

export const DEFAULT_PROMPTS = {
  marker: 'Start the reply (right after the scene-state block, if any) with a marker: <!-- [KOLDO t=+1] -->. Keys: t= time shift (+1 = one lesson, +1 day, +1 week); grade=subject:grade; rel=teacher:tag, +shade or -shade (:reason), only for a clear lasting shift in attitude toward {hero} (tags — {bondTags} · shades — {bondShades}); skip=subject; late=subject. Only what happened in the reply.',
  markerIds: 'Subject ids: {subjects}.',
  markerTeachers: 'Mentor ids: {teachers}.',
};

const vocabOf = (preset) => (preset && preset.vocab) || {};
const labelsOf = (preset) => ({ ...DEFAULT_LABELS, ...((preset && preset.labels) || {}) });
const promptsOf = (preset) => ({ ...DEFAULT_PROMPTS, ...((preset && preset.prompts) || {}) });

export function statusLine(state, preset, opts = {}) {
  if (!state || state.started !== true || !state.calendar) return '';

  const L = labelsOf(preset);
  const view = publicView(state, preset);
  const segments = segmentsOf(view, preset, L);
  const during = duringSegment(state, preset, L, opts.dayEvents);
  if (during) segments.splice(Math.max(0, segments.findIndex((s) => s.id === 'schedule') + 1), 0, { id: 'during', text: during });
  if (opts.feed) {
    const holiday = segments.some((s) => (s.id === 'holiday' || s.id === 'holidayAhead') && s.text);
    const crowdIn = String(vocabOf(preset).crowdIn || '').trim() || 'class';
    segments.push({ id: 'feed', text: feedSegment(state, L, { quiet: opts.feed.quiet === true, holiday, crowdIn }) });
  }

  const limit = numberOr(preset && preset.limits && preset.limits.maxNumbersInPrompt, Infinity);
  const kept = [];
  let used = 0;
  for (const seg of segments) {
    if (!seg.text) continue;
    const n = countNumbers(seg.text);
    if (used + n > limit) continue;
    used += n;
    kept.push(cap(seg.text.replace(/[\s.;,]+$/u, '')));
  }
  const body = kept.length ? kept.join(L.glue) + L.end : '';
  return [body, mannerSegment(L, opts, view, preset), peopleSegment(state, preset, L, opts, view), String(L.tone || '').trim(), String(L.terms || '').trim()].filter(Boolean).map((x) => (/[.!?…»]$/u.test(x) ? x : `${x}.`)).join(' ');
}

function duringSegment(state, preset, L, events) {
  const list = Array.isArray(events) ? events.filter((e) => e && e.text) : [];
  if (!list.length || !state.calendar || state.calendar.daypart === 'night') return '';
  if (!['study', 'weekend'].includes(phaseOf(preset, state, state.calendar.day))) return '';
  const evening = state.calendar.daypart === 'evening';
  const items = list.filter((e) => !evening || e.when === 'evening')
    .map((e) => fill(L.duringItem, { when: e.when === 'evening' ? L.whenEvening : L.whenAfternoon, text: cutText(String(e.text).split(/;/)[0], 90).replace(/[.\s]+$/u, '') }));
  return items.length ? fill(L.during, { list: items.join(L.nearGlue) }) : '';
}

function peopleSegment(state, preset, L, opts, view) {
  if (!opts.roster) return '';
  const max = digestMaxOf(opts.digestMax);
  if (max <= 0) return '';
  const mode = examMode(view, preset);
  const teacher = mode.active || lessonOn(view, preset) ? teacherInFrame(view, preset, mode) : null;
  const list = sceneDigests(state, opts.roster, { max, teacherId: teacher ? teacher.id : '' });
  return list.length ? fill(L.people, { list: list.map((d) => d.text).join(L.peopleGlue) }) : '';
}

const LESSON_MAX = 100;
const GRADING_MAX = 80;

function mannerSegment(L, opts, view, preset) {
  const mode = examMode(view, preset);
  const teacher = opts.roster && !mode.active && lessonOn(view, preset) ? teacherInFrame(view, preset, mode) : null;
  const p = teacher && opts.roster.get(teacher.id);
  if (!p || !p.lesson || view.lessonSeen === lessonKey(view, preset)) return '';
  let lesson = '';
  for (const sentence of String(p.lesson).split(/(?<=[.!?])\s+/u)) {
    if (lesson && lesson.length + sentence.length >= LESSON_MAX) break;
    lesson = lesson ? `${lesson} ${sentence}` : sentence;
  }
  const rule = String(p.grading || '').split(/[.;]\s+|\.$/u).map((x) => x.replace(/^судя по (?:методу|предмету),\s*/iu, '').trim()).find((x) => x && !/лор/iu.test(x));
  const grading = rule ? fill(L.mannerGrading, { grading: cutText(rule, GRADING_MAX).replace(/[.\s]+$/u, '').replace(/^./u, (c) => c.toLowerCase()) }) : '';
  return fill(L.manner, { teacher: p.short || p.name, lesson: cutText(lesson, LESSON_MAX), grading });
}

function segmentsOf(state, preset, L) {
  const vocab = vocabOf(preset);
  const mode = examMode(state, preset);
  const out = [];

  out.push({ id: 'day', text: daySegment(state, preset, L) });
  out.push({ id: 'holiday', text: holidaySegment(state, preset, L, 'now') });
  out.push({ id: 'going', text: goingSegment(state, preset, L) });
  out.push({ id: 'holidayAhead', text: holidaySegment(state, preset, L, 'ahead') });
  out.push({ id: 'schedule', text: mode.active ? '' : scheduleSegment(state, preset, L) });

  if (mode.active) {
    const count = mode.pending.length;
    const days = mode.daysLeft;
    out.push({
      id: 'exams',
      text: fill(days === null ? L.examsNoDays : L.exams, {
        examPeriod: vocab.examPeriod || '',
        count: String(count),
        days: String(days),
        daysWord: days === 1 ? 'day' : 'days',
      }),
    });
  }

  const list = debts(state).filter((s) => s.debtSkips || s.debtReason !== DEBT_RETAKE).map((s) => s.name || s.id);
  out.push({
    id: 'debts',
    text: list.length ? fill(L.debts, { debtPlural: vocab.debtPlural || vocab.debt || '', list: list.join(L.listGlue) }) : '',
  });
  const again = retakeList(state, preset).map((r) => (r.left === 1 ? fill(L.lastTry, { subject: r.name }) : r.name));
  out.push({ id: 'retakes', text: again.length ? fill(L.retakes, { list: again.join(L.listGlue) }) : '' });
  out.push({ id: 'expelled', text: expelledSegment(state, preset, L) });

  out.push({ id: 'near', text: nearSegment(state, preset, L) });
  out.push({ id: 'weekAhead', text: weekAheadSegment(state, preset, L) });

  const score = overallScore(state, preset);
  out.push({
    id: 'score',
    text: score === null ? '' : fill(L.score, { scoreName: vocab.score || '', value: roundScore(score) }),
  });

  out.push({ id: 'relation', text: relationSegment(state, preset, L, mode) });

  out.push({ id: 'reputation', text: reputationSegment(state, preset, L) });
  out.push({ id: 'study', text: studySegment(state, preset, L) });
  return out;
}

function studySegment(state, preset, L) {
  const today = state.calendar.day;
  const yesterday = addDays(today, -1);
  const items = [];
  for (const subject of state.subjects || []) {
    for (const g of subject.grades || []) {
      if ((g.day !== today && g.day !== yesterday) || !notableGrade(preset, g.value)) continue;
      items.push(fill(L.studyItem, {
        subject: subject.name || subject.id, grade: g.value, when: g.day === today ? L.studyToday : L.studyYesterday,
      }));
    }
  }
  return items.length ? fill(L.study, { list: items.slice(-4).join(L.listGlue) }) : '';
}

function daySegment(state, preset, L) {
  const day = state.calendar.day;
  const weekday = (L.weekdays || [])[weekdayIn(state, day) - 1] || '';
  const week = weekIndex(state, day, preset);
  const phase = phaseOf(preset, state, day);
  const phases = L.phases || {};
  const word = (phase === 'study' && preExamWeek(preset, state, day) ? phases.preExams : phases[phase]) || '';

  const at = termAt(preset, state, day);
  const declared = at.term ? at.term.declared : {};
  const span = numberOr(declared.studyWeeks, 0) + numberOr(declared.examWeeks, 0);
  const inTerm = week >= 1 && (!span || at.inside);

  if (!inTerm) return word ? fill(L.dayOutside, { weekday, phase: word }) : weekday;
  if (!word) return fill(L.day, { weekday, week: String(week) });
  return fill(L.dayPhase, { weekday, week: String(week), phase: word });
}

function scheduleSegment(state, preset, L) {
  if (state.calendar.daypart === 'night') return '';
  const plan = dayPlan(state, preset);
  if (!plan.length) return '';

  const cur = currentPeriod(state, preset);
  if (!cur || cur.status === 'after') return '';

  if (state.calendar.precision === 'datetime') {
    const item = plan.find((p) => p.index === cur.index);
    if (!item) return '';
    const lead = fill(cur.status === 'now' ? L.now : L.next, {
      subject: item.start ? `${cur.status === 'now' && item.end ? `${item.start}–${item.end}` : item.start} ${item.name}` : item.name,
      teacher: teacherTail(state, item.teacherId, L),
    });
    const rest = plan.filter((p) => p.index > item.index);
    return rest.length && L.dayList
      ? `${lead}${L.glue}${fill(L.dayList, { list: rest.map((p) => lessonName(state, p, L)).join(L.listGlue) })}`
      : lead;
  }

  const nowName = cur.status === 'now' ? (plan.find((p) => p.index === cur.index) || {}).name : null;
  const names = L.dayList
    ? [...new Map(plan.map((p) => [p.name, lessonName(state, p, L)])).entries()]
    : [...new Set(plan.map((p) => p.name))].map((n) => [n, n]);
  const list = names.map(([name, text]) => (name === nowName ? fill(L.nowMark, { subject: text }) : text));
  return fill(L.today, { list: list.join(L.listGlue) });
}

function lessonName(state, item, L) {
  return `${item.start ? `${item.start} ` : ''}${item.name}${teacherTail(state, item.teacherId, L)}`;
}

function relationSegment(state, preset, L, mode) {
  if (bondsOff(state)) return '';
  const teacher = teacherInFrame(state, preset, mode);
  if (!teacher) return '';
  if (bondOf(state, teacher.id).tag === defaultBond(roleOf(state, teacher.id)).tag) return '';
  return fill(L.relation, { teacher: teacher.name || teacher.id, hero: heroWords(presetGender(preset)).heroEn, label: bondOf(state, teacher.id).tag });
}

function nearSegment(state, preset, L) {
  const list = upcomingEvents(state, preset);
  if (!list.length) return '';
  const parts = [];
  for (const ev of list) {
    const when = nearWhen(ev, L, state);
    if (!when) continue;
    if (ev.kind === 'exam') {
      const subject = ev.subjectId && !isTrial(preset, ev.subjectId) ? subjectName(state, ev.subjectId) : '';
      parts.push(fill(subject ? L.nearExamSubject : L.nearExam, { when, what: ev.what || '', subject }));
    } else if (ev.kind === 'announce') {
      parts.push(fill(L.nearAnnounce, { when, subject: subjectName(state, ev.subjectId) }));
    }
  }
  return parts.join(L.nearGlue);
}

function holidaySegment(state, preset, L, part) {
  const day = state.calendar && state.calendar.day;
  if (!day) return '';
  const bg = holidayBackground(preset, day, state);
  if (part === 'now') return holidayPhrase(bg.now.map((h) => ({ h, note: bare(h.today) })), L, L.holidayNow, L.holidayNowBare, {});
  const first = bg.aheadAll[0];
  if (!first) return '';
  const when = first.days > 6 ? L.holidaySoon : nearWhen({ days: first.days, day: first.day }, L, state);
  if (!when) return '';
  return holidayPhrase(bg.aheadAll.map((a) => ({ h: a.holiday, note: bare(buzzFor(a.holiday, a.days)) })), L, L.holidayAhead, L.holidayAheadBare, { when });
}

function feedSegment(state, L, { quiet = false, holiday = false, crowdIn = 'class' } = {}) {
  if (quiet) return '';
  const points = feedBackground(state, { max: holiday ? 1 : BACKGROUND_MAX });
  if (!points.length) return '';
  const word = (p) => {
    if (p.kind === 'fact') return fill(L.feedFact, { text: p.text });
    if (p.kind === 'rumor') return fill(L.feedRumor, { text: p.text });
    if (p.kind === 'gossip') return fill(L.feedGossip, { text: unsaid(p.text) });
    return fill(p.quoted ? L.feedTalkQuote : L.feedTalk, { text: p.text });
  };
  const parts = [];
  const said = new Set();
  for (const p of points) {
    const key = String(p.text || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    if (said.has(key)) continue;
    said.add(key);
    const next = [...parts, word(p)];
    const line = fill(L.feed, { crowdIn, list: next.join(L.feedGlue) });
    if (line.length > FEED_LINE_MAX && parts.length) break;
    parts.push(word(p));
  }
  return fill(L.feed, { crowdIn, list: parts.join(L.feedGlue) });
}

function goingSegment(state, preset, L) {
  const gender = presetGender(preset);
  return goingToday(state, preset)
    .map((g) => fill(L.holidayGoing, { hero: heroWords(gender).heroEn, name: g.eventName, who: g.who }))
    .join(L.glue);
}

const dropName = (note, name) => {
  const n = String(name || '').toLowerCase().replace(/ё/g, 'е');
  const head = /^([^:]{1,60}):\s*/u.exec(note || '');
  return head && n && head[1].toLowerCase().replace(/ё/g, 'е').trim() === n ? note.slice(head[0].length) : note;
};

function holidayPhrase(items, L, full, short, vars) {
  let out = '';
  items.forEach(({ h, note: raw }, i) => {
    const note = dropName(raw, h.name);
    const text = i === 0
      ? fill(note ? full : short, { ...vars, name: h.name, note })
      : fill(note ? L.holidayAlso : L.holidayAlsoBare, { name: h.name, note });
    out = i === 0 ? text : `${out}${items[i - 1].note ? ', ' : ' '}${text}`;
  });
  return out;
}

function nearWhen(ev, L, state) {
  if (ev.days === 0) return L.nearToday;
  if (ev.days === 1) return L.nearTomorrow;
  return (L.weekdaysOn || [])[weekdayIn(state, ev.day) - 1] || '';
}

const isTrial = (preset, id) => examKinds(preset).some((k) => k.standalone && k.id === id);

function subjectName(state, id) {
  const s = (state.subjects || []).find((x) => x.id === id) || trialSubjects(state).find((x) => x.id === id);
  return (s && (s.name || s.id)) || String(id || '');
}

function weekAheadSegment(state, preset, L) {
  if (!state.exams || state.exams.active) return '';
  return weekAheadKinds(state, preset).map((k) => (k.subjects.length > 3
    ? fill(L.weekAheadAll, { what: k.name })
    : fill(L.weekAhead, { what: k.name, subjects: k.subjects.join(L.listGlue) }))).join(L.nearGlue);
}

function expelledSegment(state, preset, L) {
  if (!(state.reputation && state.reputation.expelled)) return '';
  const vocab = vocabOf(preset);
  return fill(L.expelled, { hero: heroWords(presetGender(preset)).heroEn, paths: (typeof vocab.expelPaths === 'string' && vocab.expelPaths.trim()) || L.expelPaths });
}

function reputationSegment(state, preset, L) {
  const scale = (preset && preset.reputation) || {};
  const label = reputationLabel(state, preset);
  if (!label) return '';
  const start = labelFor(scale.labels || [], numberOr(scale.start, state.reputation.value));
  if (label === start) return '';
  const en = (((preset && preset.phrases) || {}).lorebook || {}).reputationEn;
  const at = (scale.labels || []).findIndex((l) => l.label === label);
  return fill(L.reputation, { label: (Array.isArray(en) && typeof en[at] === 'string' && en[at]) || label });
}

function teacherInFrame(state, preset, mode) {
  const subjectId = mode.active
    ? (mode.pending[0] && mode.pending[0].subjectId)
    : currentSubjectId(state, preset);
  if (!subjectId) return null;
  const subject = (state.subjects || []).find((s) => s.id === subjectId);
  if (!subject || !subject.teacherId) return null;
  return (state.teachers || []).find((t) => t.id === subject.teacherId) || null;
}

function lessonOn(state, preset) {
  if (state.calendar.daypart === 'night' || !dayPlan(state, preset).length) return false;
  const cur = currentPeriod(state, preset);
  return Boolean(cur && cur.status === 'now');
}

function currentSubjectId(state, preset) {
  if (state.calendar.daypart === 'night') return null;
  if (!dayPlan(state, preset).length) return null;
  const cur = currentPeriod(state, preset);
  return cur && cur.status !== 'after' ? cur.subjectId : null;
}

function teacherTail(state, teacherId, L) {
  const t = (state.teachers || []).find((x) => x.id === teacherId);
  return t ? fill(L.teacherOf, { teacher: t.name || t.id }) : '';
}

export function markerInstruction(state, preset) {
  const P = promptsOf(preset);
  const vocab = vocabOf(preset);
  const marker = fill(P.marker, {
    period: vocab.period || '',
    hero: heroWords(presetGender(preset)).heroEn,
    heroDat: heroWords(presetGender(preset)).heroDat,
    teacher: idsOf(state && state.teachers)[0] || vocab.teacher || '',
    ...subjectVars(preset),
    bondTags: bondsFor('teacher').map((b) => b.id).join(', '),
    bondShades: SHADES.map((x) => x.id).join(', '),
  });
  const parts = [bondsOff(state) ? marker.replace(/\s*\brel=[^;]*;/u, '') : marker];

  const subjects = idsOf(state && state.subjects);
  if (subjects.length) parts.push(fill(P.markerIds, { subjects: subjects.join(', '), subjectsTitle: upFirst(subjectVars(preset).subjectPlural) }));

  const teachers = idsOf(state && state.teachers);
  if (teachers.length) {
    parts.push(fill(P.markerTeachers, {
      teacherPlural: cap(vocab.teacherPlural || vocab.teacher || ''),
      teachers: teachers.join(', '),
    }));
  }
  return parts.filter(Boolean).join('\n');
}

export function injectBlock(injects) {
  if (!Array.isArray(injects) || !injects.length) return '';
  const seen = new Set();
  const lines = [];
  for (const item of injects) {
    if (!item || !item.text) continue;
    const id = item.id === undefined ? item.text : item.id;
    if (seen.has(id)) continue;
    seen.add(id);
    lines.push(String(item.text).trim());
  }
  return lines.join('\n');
}

export function buildPrompt(state, preset, { injects = [], withMarker = true, feed = null, heroine = '', roster = null, dayEvents = null, digestMax = null } = {}) {
  return {
    status: statusLine(state, preset, { feed, heroine, roster, dayEvents, digestMax }),
    instruction: withMarker ? markerInstruction(state, preset) : '',
    oneShot: injectBlock(injects),
  };
}

export function countNumbers(text) {
  const bare = String(text || '').replace(/\b\d{1,2}:\d{2}(?:–\d{1,2}:\d{2})?\b/g, '');
  return (bare.match(/\d+(?:[.,:]\d+)*/g) || []).length;
}

export function fill(template, vars) {
  return String(template || '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

function roundScore(value) {
  const r = Math.round(value * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1).replace('.', ',');
}

function idsOf(list) {
  return (Array.isArray(list) ? list : []).map((x) => x && x.id).filter(Boolean);
}

function cap(text) {
  const s = String(text || '');
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function numberOr(v, fallback) {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
