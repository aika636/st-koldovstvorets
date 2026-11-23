export const DEFAULT_ID_LENGTH = 24;

export function salvageJson(text) {
  const s = String(text || '');
  const open = s.search(/[{[]/);
  if (open < 0) return undefined;
  const stack = [];
  let inString = false;
  let escaped = false;
  let cut = -1;
  let closers = '';
  for (let i = open; i < s.length; i += 1) {
    const c = s[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; continue; }
    if (c === '{') stack.push('}');
    else if (c === '[') stack.push(']');
    else if (c === '}' || c === ']') {
      if (stack.pop() !== c) return undefined;
      if (!stack.length) return undefined;
      if (stack[stack.length - 1] === ']') {
        cut = i + 1;
        closers = [...stack].reverse().join('');
      }
    }
  }
  if (cut < 0) return undefined;
  const body = s.slice(open, cut) + closers;
  return tryParse(body) ?? tryParse(repairJson(body));
}

export function extractJson(text) {
  for (const candidate of jsonCandidates(text)) {
    const direct = tryParse(candidate);
    if (direct !== undefined) return direct;
    const repaired = tryParse(repairJson(candidate));
    if (repaired !== undefined) return repaired;
  }
  return undefined;
}

function* jsonCandidates(text) {
  const s = String(text || '').trim();
  if (!s) return;
  yield s;
  const fences = [...s.matchAll(/```[a-zA-Z]*\s*([\s\S]*?)```/g)].map((m) => m[1].trim());
  for (const f of fences) yield f;
  const source = fences.length ? [s, ...fences] : [s];
  for (const src of source) {
    const block = balancedBlock(src);
    if (block) yield block;
  }
}

export function balancedBlock(text) {
  const s = String(text || '');
  const open = s.search(/[{[]/);
  if (open < 0) return '';
  const pairs = { '{': '}', '[': ']' };
  const stack = [];
  let inString = false;
  let quote = '';
  let escaped = false;
  for (let i = open; i < s.length; i += 1) {
    const c = s[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === quote) inString = false;
      continue;
    }
    if (c === '"' || c === "'") { inString = true; quote = c; continue; }
    if (pairs[c]) { stack.push(pairs[c]); continue; }
    if (c === '}' || c === ']') {
      if (stack.pop() !== c) return '';
      if (!stack.length) return s.slice(open, i + 1);
    }
  }
  return '';
}

export function repairJson(text) {
  let s = String(text || '');
  s = s.replace(/[“”«»]/g, '"').replace(/[‘’]/g, "'");
  s = s.replace(/^﻿/, '');
  s = stripOutsideStrings(s, /\/\/[^\n]*/g).replace(/\/\*[\s\S]*?\*\//g, '');
  s = s.replace(/'([^'"\\\n]*)'/g, '"$1"');
  s = s.replace(/([{,]\s*)([A-Za-z_][\w-]*)(\s*:)/g, '$1"$2"$3');
  s = s.replace(/,\s*([}\]])/g, '$1');
  return s.trim();
}

function stripOutsideStrings(s, re) {
  const parts = s.split(/("(?:[^"\\]|\\.)*")/);
  return parts.map((p, i) => (i % 2 ? p : p.replace(re, ''))).join('');
}

function tryParse(s) {
  if (!s) return undefined;
  try {
    const v = JSON.parse(s);
    return v && typeof v === 'object' ? v : undefined;
  } catch {
    return undefined;
  }
}

const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya',
};

const ID_FALLBACK = 'id';

export function slugify(name, opts = {}) {
  const max = intOr(opts.maxLength, DEFAULT_ID_LENGTH);
  const src = String(name == null ? '' : name).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  let out = '';
  for (const ch of src) {
    if (/[a-z0-9]/.test(ch)) out += ch;
    else if (TRANSLIT[ch] !== undefined) out += TRANSLIT[ch];
    else if (/[\s\-_/.]/.test(ch)) out += '-';
    else if (ch.charCodeAt(0) > 0x7f) out += ch.codePointAt(0).toString(36);
  }
  out = out.replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, max).replace(/-+$/g, '');
  return out || ID_FALLBACK;
}

export function fill(template, vars) {
  return String(template || '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

function intOr(v, fallback) {
  return typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : fallback;
}

