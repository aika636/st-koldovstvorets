import { CLASSMATE_TEXT_MAX, HEROINE, tieTarget } from '../core/classmates.mjs';
import { clipWords } from '../core/feed.mjs';
import { MEMORY_SIZE, relationLabel, relationMemory, relationOf, scaleOff } from '../core/relations.mjs';
import { personAvatar } from '../core/masks.mjs';
import { isPortrait } from '../core/portraits.mjs';
import {
  uiLabels, extraLabels, fill, formatDate, str, el, runAction, setStatus, call, renderPanel, safe, loreLinkText, mounted,
} from './common.js';
import { photoEditor, keptOpen } from './photo.js';

export function scoreText(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '';
  return v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '0';
}

export const FEED_LINE_MAX = 80;

export const SAID_SHOWN = 2;

export function lastShift(raw) {
  const m = raw && raw[0];
  if (!m) return { was: '', why: '' };
  return {
    was: m.crossed ? m.crossed.from : '',
    why: [m.reason, formatDate(m.day)].filter(Boolean).join(' · '),
  };
}

export function mentionFields(list) {
  const items = Array.isArray(list) ? list : [];
  return {
    buzz: items.length > 0,
    feedLine: items.length ? clipWords(items[0].text, FEED_LINE_MAX) : '',
    said: items.slice(0, SAID_SHOWN).map((x) => ({
      id: x.id, text: x.text, who: x.who, when: x.dayLine, chan: x.chan, chanLabel: x.chanLabel,
    })),
  };
}

export function classmatesView(state, preset, opts = {}) {
  const mentions = (opts && opts.mentions) || {};
  const U = uiLabels(preset);
  const X = extraLabels(preset);
  const list = (state && Array.isArray(state.classmates)) ? state.classmates : [];

  const people = list.map((c) => {
    const reg = opts.roster && c.source === 'roster' ? opts.roster.get(c.id) : null;
    const house = reg && opts.roster.house(reg.house);
    let tieText = '';
    let tieWho = '';
    if (c.tie) {
      const target = tieTarget(state, c.tie.to);
      tieWho = target.kind === 'heroine' ? X.cmHeroine
        : target.kind === 'unknown' ? X.cmTieUnknown
          : target.name;
      const shown = target.kind === 'heroine' ? X.cmTieHeroine : tieWho;
      const what = str(c.tie.what);
      tieText = shown && what ? fill(X.cmTieLine, { who: shown, what }) : (shown || what);
    }
    const rawMemory = relationMemory(state, c.id, preset, MEMORY_SIZE);
    const memory = rawMemory.map((m) => {
      const sign = scoreText(m.delta);
      return {
        day: m.day,
        dateLine: formatDate(m.day),
        delta: m.delta,
        sign,
        reason: m.reason,
        text: m.reason ? fill(X.memoryLine, { sign, reason: m.reason }) : sign,
        shift: m.crossed ? fill(U.relationShift, m.crossed) : '',
      };
    });
    const quiet = scaleOff(state) || (!memory.length && !relationOf(state, c.id));
    const relation = quiet ? '' : relationLabel(state, c.id, preset);
    const score = quiet ? '' : scoreText(relationOf(state, c.id));
    const shift = lastShift(rawMemory);
    const tieKind = c.tie ? tieTarget(state, c.tie.to).kind : 'none';
    const tieLink = c.tie && tieKind !== 'none' && (tieWho || tieText)
      ? {
        id: tieKind === 'classmate' || tieKind === 'teacher' ? c.tie.to : '',
        name: tieKind === 'heroine' ? X.cmTieHeroine : tieWho,
        what: str(c.tie.what),
      }
      : null;
    return {
      kind: 'classmate',
      id: c.id,
      name: c.name,
      role: reg ? `${house ? house.name : ''}, ${reg.grade} класс`.replace(/^, /, '') : c.club || '',
      links: tieLink ? [tieLink] : [],
      was: shift.was,
      why: shift.why,
      ...mentionFields(mentions[c.id]),
      club: c.club || '',
      about: reg ? reg.summary || '' : '',
      known: c.known !== false,
      desire: c.desire || '',
      problem: c.problem || '',
      manner: reg ? reg.speech || '' : c.manner || '',
      tieTo: c.tie ? (c.tie.to || '') : '',
      tieWhat: c.tie ? (c.tie.what || '') : '',
      tieWho,
      tieText,
      relation,
      score,
      relationText: score ? `${relation} · ${score}` : relation,
      memory,
      memoryText: memory.length ? '' : scaleOff(state) ? U.relationOff : U.relationNoHistory,
      source: c.source || 'manual',
      linkText: loreLinkText(X, c.loreLink),
      aliasesText: Array.isArray(c.aliases) && c.aliases.length ? fill(X.aliasesLine, { aliases: c.aliases.join(', ') }) : '',
      portrait: isPortrait(c.portrait) ? c.portrait : '',
      looks: typeof c.looks === 'string' ? c.looks : '',
      note: typeof c.note === 'string' ? c.note : '',
      avatar: personAvatar(c),
    };
  });

  const tieOptions = [
    { value: '', label: X.cmTieNone },
    { value: HEROINE, label: X.cmHeroine },
    ...list.map((c) => ({ value: c.id, label: c.name })),
    ...((state && state.teachers) || []).map((t) => ({ value: t.id, label: t.name || t.id })),
  ];

  return {
    title: U.classmatesTitle,
    none: U.classmatesNone,
    historyTitle: U.relationHistoryTitle,
    people,
    tieOptions,
    count: people.length,
  };
}

export function classmateExtras(host, p, view, preset) {
  return [classmateForm(host, p, view, extraLabels(preset))];
}

export function classmateAddForm(host, view, preset) {
  return classmateForm(host, null, view, extraLabels(preset));
}

function classmateForm(host, p, view, X) {
  const status = el('div', { class: 'koldo-status' });
  const input = (label, value, hint, max) => {
    const node = el('input', {
      type: 'text', class: 'text_pole koldo-input', value: value || '', placeholder: hint || '',
      ...(max ? { maxlength: String(max) } : {}),
    });
    node.value = value || '';
    return { node, wrap: el('label', { class: 'koldo-field' }, [el('span', { text: label }), node]) };
  };
  const name = input(X.cmName, p && p.name, X.cmNameHint, CLASSMATE_TEXT_MAX.name);
  const club = input(X.cmClub, p && p.club, X.cmClubHint, CLASSMATE_TEXT_MAX.club);
  const desire = input(X.cmDesire, p && p.desire, X.cmDesireHint, CLASSMATE_TEXT_MAX.desire);
  const problem = input(X.cmProblem, p && p.problem, X.cmProblemHint, CLASSMATE_TEXT_MAX.problem);
  const manner = input(X.cmManner, p && p.manner, X.cmMannerHint, CLASSMATE_TEXT_MAX.manner);
  const tieWhat = input(X.cmTieWhat, p && p.tieWhat, X.cmTieWhatHint, CLASSMATE_TEXT_MAX.tie);
  const tieTo = el('select', { class: 'text_pole koldo-input' },
    view.tieOptions
      .filter((o) => !p || o.value !== p.id)
      .map((o) => el('option', { value: o.value, text: o.label })));
  tieTo.value = (p && p.tieTo) || '';
  const tieWrap = el('label', { class: 'koldo-field' }, [el('span', { text: X.cmTie }), tieTo]);
  const portrait = p ? input(X.portraitField, p.portrait, X.portraitHint, 0) : null;

  const fields = () => ({
    name: String(name.node.value || ''),
    club: String(club.node.value || ''),
    desire: String(desire.node.value || ''),
    problem: String(problem.node.value || ''),
    manner: String(manner.node.value || ''),
    tie: { to: String(tieTo.value || ''), what: String(tieWhat.node.value || '') },
    ...(portrait ? { portrait: String(portrait.node.value || '').trim() } : {}),
  });

  const save = el('div', {
    class: 'menu_button koldo-btn koldo-btn-small koldo-btn-main',
    text: p ? X.cmSave : X.cmAdd,
    onclick: async (e) => {
      const f = fields();
      if (!f.name.trim()) { setStatus(status, 'error', X.cmNameMissing); return; }
      if (f.portrait && !isPortrait(f.portrait)) { setStatus(status, 'error', X.portraitBad); return; }
      const res = await runAction(e.currentTarget, status,
        () => (p ? call(host, 'updateClassmate', p.id, f) : call(host, 'addClassmate', f)),
        p ? X.cmSaved : X.cmAdded);
      if (res && res.ok !== false) renderPanel(host);
    },
  });

  const ask = el('div', { class: 'koldo-confirm', hidden: true });
  ask.hidden = true;
  const remove = p ? el('div', {
    class: 'menu_button koldo-btn koldo-btn-small koldo-btn-danger',
    text: X.cmRemove,
    onclick: () => {
      ask.hidden = false;
      if (typeof ask.scrollIntoView === 'function') ask.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    },
  }) : null;
  if (p) {
    ask.append(
      el('div', { class: 'koldo-confirm-title', text: fill(X.cmRemoveAsk, { name: p.name }) }),
      el('div', { class: 'koldo-row koldo-row-buttons' }, [
        el('div', {
          class: 'menu_button koldo-btn koldo-btn-main',
          text: X.cmRemoveYes,
          onclick: async (e) => {
            const res = await runAction(e.currentTarget, status, () => call(host, 'removeClassmate', p.id), X.cmRemoved);
            ask.hidden = true;
            if (res && res.ok !== false) renderPanel(host);
          },
        }),
        el('div', {
          class: 'menu_button koldo-btn koldo-btn-small',
          text: X.cmRemoveNo,
          onclick: () => { ask.hidden = true; },
        }),
      ]),
    );
  }

  return el('details', { class: 'koldo-repair koldo-cm-form', ...(p ? keptOpen(`edit::${p.id}`, p.id) : {}) }, [
    el('summary', { text: p ? X.cmEdit : X.cmAddTitle }),
    el('div', { class: 'koldo-repair-body' }, [
      name.wrap, club.wrap, desire.wrap, tieWrap, tieWhat.wrap, problem.wrap, manner.wrap,
      p ? photoEditor(host, p, X, portrait.wrap) : null,
      el('div', { class: 'koldo-row koldo-row-buttons' }, [save, remove]),
      p ? ask : null,
      status,
    ]),
  ]);
}
