import { debts, debtReasons, DEBT_GRADE, overallScore, subjectScore } from '../core/gradebook.mjs';
import { bondView } from './classmates.js';
import { stats as attendanceStats } from '../core/attendance.mjs';
import { reputationLabel } from '../core/reputation.mjs';
import { termsOf, termAt } from '../core/time.mjs';
import { awaitingAnnouncement, examMode, datedExams, debtReasonText, isPassing } from '../core/exams.mjs';
import { milestones } from '../core/milestones.mjs';
import {
  uiLabels, fill, stateHealth, formatDate, formatDateOn, termTitle, formatScore, capNumbers, capitalize, plural,
  extraLabels, el, emptyPage, svgIcon, mounted, artImg,
} from './common.js';
import { milestonesView } from './achievements.js';

export function openExamList(state, preset) {
  const mode = examMode(state, preset);
  const dated = datedExams(state, preset, state.calendar && state.calendar.day);
  return [...dated, ...mode.pending.filter((i) => !dated.some((d) => d.id === i.id))]
    .map((e) => {
      const s = (state.subjects || []).find((x) => x.id === e.subjectId);
      const kind = ((preset.exams && preset.exams.kinds) || []).find((k) => k.id === e.kind);
      return { id: e.id, subject: (s && s.name) || e.subjectId, kind: (kind && kind.name) || e.kind, day: e.day };
    });
}

export function gradebookView(state, preset) {
  const health = stateHealth(state, preset);
  if (health.kind !== 'ok') return { ...health, subjects: [], numbers: [] };

  const scale = (preset.grades && Array.isArray(preset.grades.values)) ? preset.grades.values : [];
  const badMarks = scale.filter((v) => v && v.pass === false).map((v) => String(v.value));
  const legend = scale
    .filter((v) => v && v.label && String(v.label) !== String(v.value))
    .map((v) => `${v.value} — ${v.label}`)
    .join(', ');
  const subjects = (state.subjects || []).map((s) => {
    const score = subjectScore(state, s.id, preset);
    const teacher = s.teacherId ? (state.teachers || []).find((t) => t.id === s.teacherId) : null;
    const firstOfTeacher = teacher && (state.subjects || []).find((x) => x.teacherId === teacher.id);
    const bond = teacher ? bondView(state, teacher.id, preset, 1) : null;
    const att = attendanceStats(state, s.id);
    return {
      id: s.id,
      name: s.name,
      teacher: teacher ? teacher.name : '',
      teacherId: teacher ? teacher.id : null,
      relation: bond ? bond.relation : '',
      reason: bond && firstOfTeacher && firstOfTeacher.id === s.id && bond.memory[0] ? bond.memory[0].reason : '',
      attendanceText: [
        skipsText(att),
        att.lates ? `${att.lates} ${plural(att.lates, 'опоздание', 'опоздания', 'опозданий')}` : '',
      ].filter(Boolean).join(', '),
      grades: (score.grades || []).map((g) => g.value),
      marks: (score.grades || []).map((g) => ({ value: g.value, bad: badMarks.includes(String(g.value)) })),
      average: score.average,
      averageText: formatScore(score.average),
      passed: score.passed && closedSubject(state, preset, s.id),
      going: score.passed && (score.grades || []).length > 0 && !closedSubject(state, preset, s.id),
      debt: score.debt,
      debtReason: score.debt && !(debtReasons(s).length === 1 && debtReasons(s)[0] === DEBT_GRADE) ? debtReasonText(preset, s) : '',
    };
  });

  const tails = debts(state).map((s) => s.name || s.id);
  const tailLines = debts(state).map((s) => [s.name || s.id, debtReasonText(preset, s)].filter(Boolean).join(': '));
  const overall = overallScore(state, preset);
  const mode = examMode(state, preset);
  const openExams = openExamList(state, preset);

  const vocab = preset.vocab || {};
  const U = uiLabels(preset);
  const raw = [
    { key: 'overall', text: fill(U.scoreLine, { scoreName: vocab.score || 'средний балл', value: formatScore(overall) }) },
    tails.length ? { key: 'debts', text: fill(U.debtsLine, { debtPlural: vocab.debtPlural || 'хвосты', count: tails.length }) } : null,
    { key: 'subjects', text: fill(U.subjectsLine, { count: subjects.length }) },
    openExams.length ? { key: 'exams', text: fill(U.examsLine, { examPeriod: vocab.examPeriod || 'сессию', count: openExams.length }) } : null,
  ].filter(Boolean);
  const capped = capNumbers(raw, preset);

  return {
    kind: 'ok',
    title: '',
    text: '',
    action: null,
    errors: [],
    subjects,
    seal: preset.displayName || '',
    strip: raw.filter((n) => n.key === 'debts' || n.key === 'exams').map((n) => n.text),
    termText: termText(state, preset, U),
    legend,
    legendTitle: 'Шкала отметок',
    badMarks,
    marginDate: marginDateOf(state),
    debts: tails,
    debtLines: tailLines,
    overall,
    overallText: formatScore(overall),
    scoreName: capitalize(vocab.score || 'средний балл'),
    reputation: reputationLabel(state, preset),
    expelled: Boolean(state.reputation && state.reputation.expelled),
    warned: Boolean(state.reputation && state.reputation.warned),
    examsActive: mode.active,
    examsTermLine: examsTermLine(state, preset, mode, U),
    openExams,
    milestones: milestonesView(state, preset),
    awaiting: awaitingView(state, preset),
    numbers: capped.shown,
    droppedNumbers: capped.dropped,
  };
}

export function marginDateOf(state) {
  const day = state && state.calendar && state.calendar.day;
  return typeof day === 'string' && /^\d{4}-\d{2}-\d{2}/.test(day) ? `${day.slice(8, 10)}.${day.slice(5, 7)}` : '';
}

function termText(state, preset, U) {
  try {
    const t = termAt(preset, state);
    return t.term && t.inside ? termTitle({ ...t.term, index: t.index }, U) : '';
  } catch { return ''; }
}

function examsTermLine(state, preset, mode, U) {
  if (!mode.active) return '';
  const terms = termsOf(preset, state);
  if (terms.length < 2) return '';
  const index = state.exams && Number.isFinite(state.exams.term) ? state.exams.term : -1;
  const term = terms[index % terms.length];
  if (!term || index < 0) return '';
  return fill(U.examsTerm, { name: termTitle(term, U) });
}

function skipsText(att) {
  if (!att.skips) return '';
  const base = `${att.skips} ${plural(att.skips, 'прогул', 'прогула', 'прогулов')}`;
  if (!att.worked) return base;
  if (att.worked >= att.skips) return att.skips === 1 ? `${base} (отработан)` : `${base} (все отработаны)`;
  return `${base}, отработано ${att.worked}`;
}

export function awaitingView(state, preset) {
  const X = extraLabels(preset);
  return ((state && state.exams && state.exams.items) || [])
    .filter((i) => awaitingAnnouncement(i))
    .map((i) => {
      const s = (state.subjects || []).find((x) => x.id === i.subjectId);
      const subject = (s && s.name) || i.subjectId || '';
      return {
        id: i.id, subject, day: i.announceOn,
        text: fill(X.awaitingLine, { subject, date: formatDateOn(i.announceOn) || i.announceOn }),
      };
    });
}

let sealSeq = 0;
const SEAL_BIRD = 'M15 33Q16 25 27 24Q32 23 34 18Q35 14 32 11Q43 11 41 21Q47 19 49 14Q53 24 40 29Q47 35 42 43Q39 49 43 51C56 45 61 27 66 17Q70 10 70 6C81 20 76 34 66 45Q77 38 85 29C88 45 78 56 65 60Q78 57 89 49C85 66 71 73 57 69C66 79 81 77 77 70C75 67 72 69 73 72C66 72 66 64 73 62C86 58 93 76 82 85C74 92 62 88 56 83C61 98 39 100 38 89C42 92 47 92 47 87C47 82 40 79 34 77C14 71 13 60 22 49C27 42 33 37 30 33Q24 28 15 33Z';
const SEAL_ORNAMENT = 'M11 37.5 13.5 40 11 42.5 8.5 40ZM69 37.5 71.5 40 69 42.5 66.5 40ZM40 66 43 69 40 72 37 69ZM25.5 62.6 27.9 65 25.5 67.4 23.1 65ZM54.5 62.6 56.9 65 54.5 67.4 52.1 65Z';

function sealMark(text) {
  const mark = svgIcon('tick', 'ad-doc-mark');
  if (typeof document.createElementNS !== 'function') return mark;
  const name = String(text || '').trim().toUpperCase();
  const size = name.length > 13 ? Math.max(4.5, (7 * 13) / name.length) : 7;
  const id = `adSealArc${++sealSeq}`;
  mark.setAttribute('viewBox', '0 0 80 80');
  mark.setAttribute('stroke', 'none');
  mark.innerHTML = `<defs><path id="${id}" d="M13 40A27 27 0 0 1 67 40"/></defs>`
    + '<circle cx="40" cy="40" r="37" fill="none" stroke="currentColor" stroke-width="1.35"/>'
    + '<circle cx="40" cy="40" r="21" fill="none" stroke="currentColor" stroke-width="1"/>'
    + `<path fill="currentColor" d="${SEAL_ORNAMENT}"/>`
    + '<circle cx="17" cy="56.5" r="1.1" fill="currentColor"/><circle cx="63" cy="56.5" r="1.1" fill="currentColor"/>'
    + '<circle cx="32.5" cy="68" r=".9" fill="currentColor"/><circle cx="47.5" cy="68" r=".9" fill="currentColor"/>'
    + `<text font-size="${size.toFixed(2)}" font-weight="700" letter-spacing=".9" fill="currentColor" font-family="inherit" text-anchor="middle">`
    + `<textPath href="#${id}" startOffset="50%"></textPath></text>`
    + `<path fill="currentColor" transform="translate(25 25) scale(.3)" d="${SEAL_BIRD}"/>`;
  const path = mark.querySelector('textPath');
  if (path) path.textContent = name;
  return mark;
}

function closedSubject(state, preset, subjectId) {
  return ((state && state.exams && state.exams.items) || []).some((i) => i && i.subjectId === subjectId && i.outcome && isPassing(preset, i.outcome));
}

function subjectRow(s, U, X, noGradesAtAll) {
  const tags = [
    s.debt ? el('span', { class: 'ad-st ad-debt', text: U.debtTag }) : null,
    s.passed ? el('span', { class: 'ad-st ad-ok', text: U.passedTag }) : null,
    s.going ? el('span', { class: 'ad-st ad-going', text: U.ongoingTag, title: X.ongoingHint }) : null,
  ];
  const marks = s.marks.length
    ? el('span', { class: 'ad-marks' }, s.marks.map((m) => el('span', {
      class: 'ad-mark', dataset: m.bad ? { bad: '1' } : {}, text: m.value,
    })))
    : (noGradesAtAll ? null : el('span', { class: 'ad-none', text: U.noGrades }));
  const rel = s.relation;
  const extra = [
    s.attendanceText ? el('span', { class: 'ad-gr-att', text: s.attendanceText }) : null,
    s.reason ? el('span', { class: 'ad-gr-reason', text: s.reason }) : null,
    s.debtReason ? el('span', { class: 'ad-gr-reason', text: s.debtReason }) : null,
  ].filter(Boolean);
  return el('div', { class: s.debt ? 'ad-gr-row ad-gr-debt' : 'ad-gr-row', dataset: { subject: s.id } }, [
    el('div', { class: 'ad-gr-subj', text: s.name }),
    el('div', {
      class: 'ad-gr-avg',
      text: s.marks.length && s.average != null ? s.averageText : '',
      title: s.marks.length && s.average != null ? fill(U.cmdAverage, { value: s.averageText }) : null,
    }),
    el('div', { class: 'ad-gr-marks' }, [marks, ...tags]),
    el('div', { class: 'ad-gr-teacher' }, [
      el('span', { class: 'ad-t', text: s.teacher || '—' }),
      rel ? el('span', { class: 'ad-r', text: rel }) : null,
    ]),
    extra.length ? el('div', { class: 'ad-gr-extra' }, extra) : null,
  ]);
}

function warnBox(title, items, { info = false, sub = '', cls = '' } = {}) {
  return el('div', { class: `ad-box-warn${info ? ' ad-info' : ''}${cls ? ` ${cls}` : ''}` }, [
    el('div', { class: 'ad-bw-h', text: title }),
    sub ? el('div', { class: 'ad-small ad-soft', text: sub }) : null,
    el('ul', {}, items.map((t) => el('li', { text: t }))),
  ]);
}

export function renderGradebook(host, view, preset) {
  if (view.kind !== 'ok') return emptyPage(host, view, ['study-kit', 'study']);

  const U = uiLabels(preset);
  const X = extraLabels(preset);
  const spread = mounted.spread === true;

  const noGradesAtAll = view.subjects.length > 0 && view.subjects.every((s) => !s.grades.length);
  const bare = (s) => !s.grades.length && !s.debt && !s.passed && !s.going && !s.attendanceText && !s.reason;
  const bareList = noGradesAtAll ? [] : view.subjects.filter(bare);
  const folded = bareList.length >= 2 ? new Set(bareList.map((s) => s.id)) : new Set();
  const rows = view.subjects.filter((s) => !folded.has(s.id));

  const body = [];
  if (!view.subjects.length) body.push(el('div', { class: 'ad-silent', text: U.noSubjects }));
  else {
    if (noGradesAtAll) body.push(el('div', { class: 'ad-silent', text: U.noGradesAll }));
    body.push(el('div', { class: 'ad-gr' }, [
      el('div', { class: 'ad-gr-head', 'aria-hidden': 'true' }, [el('span', { text: 'Дисциплина' }), el('span', { text: 'Отметка' })]),
      ...rows.map((s) => subjectRow(s, U, X, noGradesAtAll)),
    ]));
    if (folded.size) {
      body.push(el('div', {
        class: 'ad-silent ad-gr-rest',
        text: fill(X.noGradesRest, { names: bareList.map((s) => s.name).join(', ') }),
      }));
    }
  }

  const alarm0 = view.expelled ? U.expelledTag : view.warned ? U.warnedTag : '';
  const alarm = alarm0 && !String(view.reputation || '').toLowerCase().includes(String(alarm0).toLowerCase()) ? alarm0 : '';
  const doc = el('div', { class: 'ad-doc', dataset: view.subjects.some((s) => s.grades.length) ? { graded: '1' } : {} }, [
    el('i', { class: 'ad-attach', dataset: { for: 'doc', pos: 'l' } }),
    el('i', { class: 'ad-attach', dataset: { for: 'doc', pos: 'r' } }),
    el('div', { class: 'ad-doc-head' }, [
      el('div', {}, [el('div', { class: 'ad-doc-title', text: U.tabGradebook })]),
      sealMark(view.seal),
    ]),
    ...body,
  ]);

  const going = view.subjects.some((x) => x.going);
  const note = going ? X.ongoingHint : '';
  const totals = el('div', { class: 'ad-gr-totals' }, [
    el('div', { class: 'ad-gr-th', text: [U.summaryTitle, view.termText].filter(Boolean).join(' · ') }),
    el('div', { class: 'ad-doc-sum' }, [
      el('div', {
        class: Number.isFinite(view.overall) ? 'ad-big' : 'ad-big ad-big-none',
        title: Number.isFinite(view.overall) ? U.scoreHint : null,
        text: Number.isFinite(view.overall) ? view.overallText : '—',
      }),
      el('div', { class: 'ad-lab', title: Number.isFinite(view.overall) ? U.scoreHint : null, text: Number.isFinite(view.overall) ? view.scoreName : U.scoreNoneLine }),
      el('div', { class: 'ad-rep' }, [
        `${U.reputationTitle}: ${view.reputation}`,
        alarm ? ' ' : null,
        alarm ? el('span', { class: 'ad-alarm', text: alarm }) : null,
      ]),
    ]),
    view.legend ? el('div', { class: 'ad-gr-legend' }, [el('b', { text: view.legendTitle }), el('div', { text: `${view.legend}.` })]) : null,
    note ? el('div', { class: 'ad-margin-note' }, [el('small', { text: U.marginTitle }), note]) : null,
  ]);

  const boxes = [totals];
  if (view.debts.length) boxes.push(warnBox(U.debtsTitle, view.debtLines));
  if (view.openExams.length) {
    boxes.push(warnBox(U.openExamsTitle, view.openExams.map((e) => `${e.subject} (${e.kind})`), {
      info: true, sub: view.examsTermLine,
    }));
  }
  if ((view.awaiting || []).length) {
    boxes.push(warnBox(X.awaitingTitle, view.awaiting.map((a) => a.text), { info: true, cls: 'koldo-awaiting' }));
  }

  const art = artImg('study-kit', 'study');
  const common = { marginDate: view.marginDate, lcls: 'ad-illustrated' };
  if (spread) return { ...common, l: [art, doc], r: boxes };
  return { ...common, l: [art, doc, ...boxes], r: null, blankRight: true };
}
