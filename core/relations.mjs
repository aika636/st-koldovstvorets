import { findTeacher, findSubject } from './state.mjs';

export function findPerson(state, id) {
  const t = findTeacher(state, id);
  if (t) return t;
  return ((state && state.classmates) || []).find((c) => c && c.id === id) || null;
}

export function isClassmate(state, id) {
  if (findTeacher(state, id)) return false;
  return ((state && state.classmates) || []).some((c) => c && c.id === id);
}

export const REASON_PHRASES = {
  grade: 'оценка {value}: {subject}',
  exam: 'испытание: {subject} — {value}',
  skip: 'прогул: {subject}',
  skipMany: 'прогулы: {subject} ×{count}',
  late: 'опоздание: {subject}',
  present: 'присутствие: {subject}',
  marker: '{text}',
  withText: '{base} ({text})',
};

export function reasonText(reason, state, preset) {
  if (!reason || typeof reason !== 'object') return typeof reason === 'string' ? reason : '';
  const ph = { ...REASON_PHRASES, ...((preset && preset.phrases && preset.phrases.relationReason) || {}) };
  const subject = reason.subjectId ? findSubject(state || {}, reason.subjectId) : null;
  const vars = {
    subject: (subject && subject.name) || reason.subjectId || '',
    value: reason.value == null ? '' : String(reason.value),
    count: String(reason.count || ''),
    text: reason.text || '',
  };
  const key = reason.kind === 'skip' && reason.count > 1 ? 'skipMany' : reason.kind;
  const base = key && key !== 'marker' && ph[key] ? fillReason(ph[key], vars) : '';
  if (base && vars.text && !repeats(base, vars.text)) return fillReason(ph.withText, { base, text: vars.text });
  return base || vars.text;
}

function repeats(base, text) {
  const stems = (v) => String(v).toLowerCase().replace(/ё/g, 'е').split(/[^\p{L}]+/u).filter((w) => w.length >= 4).map((w) => w.slice(0, 4));
  const have = new Set(stems(base));
  const mine = stems(text);
  return mine.length > 0 && mine.every((w) => have.has(w));
}

function fillReason(template, vars) {
  return String(template || '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}
