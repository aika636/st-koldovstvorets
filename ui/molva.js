import { plural } from '../core/plural.mjs';
import { normalizeFeed, THREADS_MAX } from '../core/feed.mjs';
import { extraLabels, fill, el, runAction, setStatus, call, safe, renderPanel } from './common.js';

export function molvaDoneText(X, res) {
  const posts = Number(res && res.posts) || 0;
  const replies = Number(res && res.replies) || 0;
  if (!posts && !replies && res && res.quiet) return X.molvaQuiet;
  return fill(X.molvaDone, {
    posts, replies,
    postsWord: plural(posts, ...X.molvaPostForms),
    repliesWord: plural(replies, ...X.molvaReplyForms),
  }) + (res && res.skipped ? X.molvaDoneSkipped : '');
}

export function affairsView(state, preset, roster = null) {
  const X = extraLabels(preset);
  const feed = normalizeFeed(state && state.feed);
  const names = new Map(((state && state.classmates) || []).filter((c) => c && c.id && c.name).map((c) => [c.id, c.name]));
  const nameOf = (id) => names.get(id) || (roster && roster.get(id) && (roster.get(id).short || roster.get(id).name)) || '';
  const live = feed.threads.filter((t) => t.state !== 'archived');
  const threads = live.map((t) => ({
    id: t.id,
    topic: t.topic,
    want: t.want ? fill(X.mobThreadWant, { text: t.want }) : '',
    last: t.last ? fill(X.mobThreadLast, { text: t.last }) : '',
    paused: t.state === 'paused',
    source: (X.mobThreadSource && X.mobThreadSource[t.source]) || '',
    who: fill(X.mobThreadWho, { names: t.members.map(nameOf).filter(Boolean).join(', ') }),
  }));
  return { threads, room: fill(X.mobThreadRoom, { n: live.filter((t) => t.state === 'active').length, max: THREADS_MAX }) };
}

let molvaNote = { kind: '', text: '' };

export const MOLVA_NOTE_MS = 10000;

let molvaTimer = null;
const molvaStatuses = new Set();

export function clearMolvaNote() {
  if (molvaTimer) clearTimeout(molvaTimer);
  molvaTimer = null;
  molvaNote = { kind: '', text: '' };
  for (const node of molvaStatuses) {
    if (node.isConnected) setStatus(node, '', '');
    else molvaStatuses.delete(node);
  }
}

export function molvaNoteView() {
  return { ...molvaNote };
}

export function trackMolvaStatus(node) {
  molvaStatuses.add(node);
}

export function keepMolvaNote(note) {
  molvaNote = note;
  if (molvaTimer) clearTimeout(molvaTimer);
  molvaTimer = setTimeout(clearMolvaNote, MOLVA_NOTE_MS);
}

export function molvaRefresh(host, preset) {
  const X = extraLabels(preset);
  const status = el('div', { class: 'koldo-status' });
  trackMolvaStatus(status);
  if (molvaNote.text) setStatus(status, molvaNote.kind, molvaNote.text);
  const button = el('div', {
    class: 'menu_button koldo-btn koldo-btn-small koldo-molva-refresh',
    text: X.molvaButton,
    onclick: async (e) => {
      clearMolvaNote();
      const res = await runAction(e.currentTarget, status, () => call(host, 'refreshMolva'), X.molvaDone);
      if (res && res.ok !== false) {
        keepMolvaNote({
          kind: 'ok',
          text: molvaDoneText(X, res),
        });
        renderPanel(host);
      } else if (res) {
        keepMolvaNote({ kind: 'error', text: String(res.error || 'Не получилось.') });
      }
    },
  });
  return el('div', { class: 'koldo-molva-refresh-box' }, [
    el('div', { class: 'koldo-row koldo-row-buttons' }, [button]),
    status,
  ]);
}

export function renderAffairsParts(host, preset) {
  const state = safe(() => host.getState(), null);
  if (!state || !state.started) return null;
  const X = extraLabels(preset);
  const view = affairsView(state, preset, safe(() => host.getRoster(), null));
  const threads = view.threads.map((t) => el('div', { class: 'koldo-mob-thread' }, [
    el('div', { class: 'koldo-mob-title', text: t.topic }),
    el('div', { class: 'koldo-note', text: [t.paused ? X.mobThreadPaused : '', t.source].filter(Boolean).join(' · ') }),
    t.want ? el('div', { text: t.want }) : null,
    t.last ? el('div', { text: t.last }) : null,
    el('div', { class: 'koldo-note', text: t.who }),
  ]));
  return [
    el('div', { class: 'koldo-mob-title koldo-mob-heading', text: X.mobSection }),
    el('p', { class: 'koldo-note', text: X.mobNote }),
    threads.length ? el('div', { class: 'koldo-mob-list' }, threads) : el('p', { class: 'koldo-note', text: X.mobThreadsNone }),
    el('p', { class: 'koldo-note', text: view.room }),
  ];
}
