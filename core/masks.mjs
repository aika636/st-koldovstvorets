import { isPortrait } from './portraits.mjs';

export const ANON_ICON = '👤';

export function initialsOf(name) {
  const list = String(name == null ? '' : name).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return list.slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

export function personColor(id) {
  return `hsl(${hashOf(String(id == null ? '' : id)) % 360}, 45%, 40%)`;
}

const HEROINE = '@heroine';

export function authorAvatar(state, author, opts = {}) {
  const a = author || {};
  if (a.chan === 'anon') return { kind: 'anon', icon: ANON_ICON };
  const who = String(a.who || '');
  if (who === HEROINE) {
    const name = String(opts.heroine || '').trim();
    return name ? { kind: 'person', id: HEROINE, name, initials: initialsOf(name), color: personColor(HEROINE), portrait: '' }
      : { kind: 'anon', icon: ANON_ICON };
  }
  const people = [...((state && state.teachers) || []), ...((state && state.classmates) || [])];
  const p = who ? people.find((x) => x && x.id === who) || (opts.roster && opts.roster.get(who)) : null;
  return p ? personAvatar(p) : { kind: 'anon', icon: ANON_ICON };
}

export function personAvatar(person) {
  const p = person || {};
  const name = String(p.name || p.id || '').trim();
  return {
    kind: 'person',
    id: String(p.id || ''),
    name,
    initials: initialsOf(name) || '?',
    color: personColor(p.id || name),
    portrait: isPortrait(p.portrait) ? p.portrait : '',
  };
}

function hashOf(s) {
  let h = 0;
  const t = String(s);
  for (let i = 0; i < t.length; i += 1) h = (Math.imul(31, h) + t.charCodeAt(i)) | 0;
  return h >>> 0;
}
