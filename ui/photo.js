import { el, clear, runAction, call, safe, fill, setStatus, renderPanel, avatarNode } from './common.js';
import { ROUTE_LABELS } from '../core/draw.mjs';
import { LOOKS_MAX } from '../core/portraits.mjs';

const jobs = new Map();

const views = new Map();

const jobKey = (info, id) => `${(info && info.chat) || ''}::${id}`;

export function drawPending(personId) {
  for (const [key, job] of jobs) {
    if (key.endsWith(`::${personId}`) && (job.state === 'busy' || job.state === 'preview')) return true;
  }
  return false;
}

const opened = new Set();

export function keptOpen(key, personId) {
  return {
    open: opened.has(key) || drawPending(personId),
    ontoggle: (e) => { if (e.currentTarget.open) opened.add(key); else opened.delete(key); },
  };
}

export function resetDrawJobs() {
  for (const job of jobs.values()) if (job.ctrl) safe(() => job.ctrl.abort(), null);
  jobs.clear();
  views.clear();
  opened.clear();
}

const btn = (text, onclick, extra = '') => el('div', {
  class: `menu_button koldo-btn koldo-btn-small${extra ? ` ${extra}` : ''}`,
  role: 'button',
  text,
  onclick,
});

function repaint(key) {
  const view = views.get(key);
  if (view) paint(view, key);
}

async function start(view, key) {
  const cur = jobs.get(key);
  if (cur && cur.state === 'busy') return;
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  jobs.set(key, { state: 'busy', ctrl, route: view.info.route });
  repaint(key);
  let res;
  try {
    res = await call(view.host, 'drawPortrait', view.p.id, { signal: ctrl ? ctrl.signal : undefined });
  } catch (err) {
    res = { ok: false, error: String((err && err.message) || err) };
  }
  const now = jobs.get(key);
  if (!now || now.ctrl !== ctrl) return;
  if (res && res.ok && res.path) jobs.set(key, { state: 'preview', path: res.path });
  else if (res && res.code === 'aborted') jobs.set(key, { state: 'note', kind: 'note', text: String(res.error || '') });
  else jobs.set(key, { state: 'note', kind: 'error', text: String((res && res.error) || 'Не получилось нарисовать.') });
  repaint(key);
}

function cancel(key, X) {
  const job = jobs.get(key);
  if (job && job.ctrl) safe(() => job.ctrl.abort(), null);
  jobs.set(key, { state: 'note', kind: 'note', text: X.drawCancelled });
  repaint(key);
}

function paint(view, key) {
  const { slot, box, info, X } = view;
  clear(slot);
  clear(box);
  if (!info.available || !info.available.length) {
    box.append(el('p', { class: 'koldo-note koldo-photo-draw-hint', text: info.hint || X.drawNoRoute }));
    return;
  }
  const job = jobs.get(key);
  if (job && job.state === 'busy') {
    const busy = btn(X.drawBusy, null, 'koldo-busy koldo-photo-draw-busy');
    busy.disabled = true;
    busy.setAttribute('aria-disabled', 'true');
    slot.append(busy, btn(X.drawCancel, () => cancel(key, X), 'koldo-photo-draw-cancel'));
    box.append(el('p', {
      class: 'koldo-note',
      text: fill(X.drawBusyNote, { route: ROUTE_LABELS[job.route] || ROUTE_LABELS[info.route] || '' }),
    }));
    return;
  }
  slot.append(btn(X.drawButton, () => start(view, key), 'koldo-photo-draw-go'));
  if (!job) return;
  if (job.state === 'note') {
    const status = el('div', { class: 'koldo-status' });
    setStatus(status, job.kind === 'error' ? 'error' : 'note', job.text);
    box.append(status);
    return;
  }
  const status = el('div', { class: 'koldo-status' });
  const keep = btn(X.drawKeep, async (e) => {
    const res = await runAction(e.currentTarget, status, () => call(view.host, 'setPortrait', view.p.id, job.path), X.drawKept);
    if (res && res.ok !== false) {
      jobs.set(key, { state: 'note', kind: 'ok', text: X.drawKept });
      renderPanel(view.host);
    }
  }, 'koldo-btn-main koldo-photo-draw-keep');
  const again = btn(X.drawAgain, () => start(view, key), 'koldo-photo-draw-again');
  const drop = btn(X.drawDrop, () => {
    jobs.set(key, { state: 'note', kind: 'note', text: X.drawDropped });
    repaint(key);
  }, 'koldo-photo-draw-drop');
  box.append(
    el('img', { class: 'koldo-photo-preview', src: job.path, alt: view.p.name || '' }),
    el('p', { class: 'koldo-note', text: X.drawPreviewNote }),
    el('div', { class: 'koldo-row koldo-row-buttons koldo-photo-buttons' }, [keep, again, drop]),
    status,
  );
}

function looksEditor(host, p, X) {
  const status = el('div', { class: 'koldo-status' });
  const input = el('textarea', {
    rows: '3', class: 'text_pole koldo-input koldo-looks-input',
    placeholder: X.looksHint, maxlength: String(LOOKS_MAX),
  });
  input.value = p.looks || '';
  const save = btn(X.looksSave, async (e) => {
    const value = String(input.value || '').trim();
    await runAction(e.currentTarget, status, () => call(host, 'setLooks', p.id, value), value ? X.looksSaved : X.looksCleared);
  });
  return el('div', { class: 'koldo-photo-looks' }, [
    el('label', { class: 'koldo-field' }, [el('span', { text: X.looksField }), input]),
    el('div', { class: 'koldo-row koldo-row-buttons' }, [save]),
    status,
  ]);
}

export function photoEditor(host, p, X, link = null) {
  const status = el('div', { class: 'koldo-status' });
  const input = el('input', { type: 'file', accept: 'image/*', class: 'koldo-photo-input', tabindex: '-1', 'aria-hidden': 'true' });
  const pick = el('div', {
    class: 'menu_button koldo-btn koldo-btn-small koldo-photo-pick',
    role: 'button',
    text: X.photoPick,
    onclick: () => { input.value = ''; input.click(); },
  });
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const res = await runAction(pick, status, () => call(host, 'uploadPortrait', p.id, file), X.photoSaved);
    if (res && res.ok !== false) renderPanel(host);
  });
  const remove = p.portrait ? el('div', {
    class: 'menu_button koldo-btn koldo-btn-small koldo-photo-remove',
    role: 'button',
    text: X.photoRemove,
    onclick: async (e) => {
      const res = await runAction(e.currentTarget, status, () => call(host, 'setPortrait', p.id, ''), X.photoRemoved);
      if (res && res.ok !== false) renderPanel(host);
    },
  }) : null;

  const slot = el('span', { class: 'koldo-photo-slot', dataset: { slot: 'draw', person: p.id } });
  const box = el('div', { class: 'koldo-photo-draw' });
  const info = host && typeof host.getDraw === 'function' ? safe(() => host.getDraw(), null) : null;
  if (info) {
    const key = jobKey(info, p.id);
    const view = { slot, box, info, X, host, p };
    views.set(key, view);
    paint(view, key);
  }
  const canDraw = Boolean(info && info.available && info.available.length);

  const more = canDraw || link;
  return el('div', { class: 'koldo-photo' }, [
    el('div', { class: 'koldo-photo-head' }, [
      avatarNode(p.avatar, { size: 'card' }),
      el('div', { class: 'koldo-photo-caption' }, [
        el('span', { class: 'koldo-card-title', text: X.photoTitle }),
        p.portrait ? null : el('span', { class: 'koldo-note', text: X.photoNone }),
      ]),
      el('div', { class: 'koldo-row koldo-row-buttons koldo-photo-buttons' }, [pick, remove]),
    ]),
    input,
    status,
    el('p', { class: 'koldo-note koldo-photo-note', text: X.photoNote }),
    more ? el('details', { class: 'koldo-photo-more', ...keptOpen(`more::${p.id}`, p.id) }, [
      el('summary', { text: X.photoMore }),
      el('div', { class: 'koldo-row koldo-row-buttons koldo-photo-buttons' }, [slot]),
      box,
      canDraw ? looksEditor(host, p, X) : null,
      link ? el('details', { class: 'koldo-photo-link' }, [
        el('summary', { text: X.photoLink }),
        link,
      ]) : null,
    ]) : null,
  ]);
}
