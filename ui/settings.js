import { examRule } from '../core/exams.mjs';
import { paceOf, PACES, PACE_WORDS } from '../core/relations.mjs';
import { statusView } from '../core/lore-status.mjs';
import { resolveSource } from '../api.js';
import {
  uiLabels, fill, str, extraLabels, mounted, el, clear, runAction, setStatus, field,
  section, setSectionScope, call, safe, renderPanel, memoDetails, svgIcon, sectionOpen, artImg,
} from './common.js';
import {
  renderApiBlock, renderAnalysisBlock, renderPaceBlock, renderModeBlock, renderLorebookBlock,
  renderTransferBlock, renderSoundBlock, renderFeedBlock, renderDrawBlock, renderDebugBlock, renderLookBlock,
  LOOK_TEXT, lookSummary,
} from './settings-blocks.js';
import { renderAffairsParts } from './molva.js';
import { renderStart, EXAM_RULE_VIEW, PACE_HINTS } from './start.js';

export { EXAM_RULE_VIEW };

export const TIME_MODES = [
  { id: 'auto', label: 'Авто', hint: 'сначала контекст, при неудаче — метка' },
  { id: 'context', label: 'Из контекста', hint: 'время уже печатается в постах, инжекта нет' },
  { id: 'marker', label: 'Своя метка', hint: 'чистые посты, всё идёт служебным блоком' },
];

function apiView(raw, connections) {
  const api = raw || {};
  const source = ['auto', 'tavern', 'own'].includes(String(api.source)) ? String(api.source) : 'auto';
  const c = connections || {};
  const profiles = Array.isArray(c.profiles)
    ? c.profiles.filter((p) => p && p.id).map((p) => ({
      id: String(p.id), name: String(p.name || p.id), model: String(p.model || ''),
    }))
    : [];
  const profile = String(api.profile || '');
  return {
    endpoint: String(api.endpoint || ''),
    key: String(api.key || ''),
    model: String(api.model || ''),
    source,
    routed: resolveSource({ ...api, source }),
    profile,
    profiles,
    profileMissing: Boolean(profile) && profiles.length > 0 && !profiles.some((p) => p.id === profile),
    connectionAvailable: c.available !== false,
    fallback: !String(api.endpoint || '').trim(),
  };
}

export function settingsView(state, settings, preset, extra = {}) {
  const s = settings || {};
  const api = s.api || {};
  const started = Boolean(state && state.started);

  const U = { ...extraLabels(preset), ...uiLabels(preset) };

  return {
    api: apiView(api, extra.connections),
    mode: TIME_MODES.some((m) => m.id === s.mode) ? s.mode : 'auto',
    modes: TIME_MODES.map((m) => ({ ...m, active: m.id === (s.mode || 'auto') })),
    secretaryAuto: s.secretaryAuto !== false,
    examRules: started
      ? EXAM_RULE_VIEW.map((r) => ({ ...r, hint: r.id === 'story' ? U.examRuleStoryHint : r.hint, active: r.id === examRule(state) }))
      : [],
    paces: started ? PACES.map((id) => ({ id, label: PACE_WORDS[id], hint: PACE_HINTS[id], active: id === paceOf(state) })) : [],
    injectMarker: s.mode === 'context' ? false : s.injectMarker !== false,
    injectMarkerLocked: s.mode === 'context',
    markerRisk: Boolean(extra.markerRisk) && s.mode !== 'context',
    relativeWords: Boolean(s.relativeWords),
    statusViaMacro: s.statusViaMacro === true,
    debug: s.debug === true,
    started,
    lorebook: lorebookView(extra.lorebook, s, U),
    labels: U,
  };
}

function lorebookView(raw, settings, U) {
  const l = raw || {};
  const own = settings && settings.lorebook && typeof settings.lorebook.enabled === 'boolean' ? settings.lorebook.enabled : null;
  const enabled = own === null ? l.enabled === true : own;
  const measure = l.measure && typeof l.measure === 'object' ? l.measure : null;
  const explain = (() => {
    if (!enabled) return '';
    if (l.error && !(l.status && l.status.phase === 'error')) return fill(U.lorebookError, { error: String(l.error) });
    if (l.reason === 'no-world-info') return U.lorebookNoWorldInfo;
    if (l.reason === 'no-chat') return U.lorebookNoChat;
    if (l.reason === 'no-state' || l.reason === 'off') return U.lorebookNoState;
    if (l.reason) return fill(U.lorebookError, { error: String(l.reason) });
    return '';
  })();

  return {
    enabled,
    book: String((settings.lorebook && settings.lorebook.book) || ''),
    name: String(l.name || ''),
    boundLine: l.name ? fill(U.lorebookBound, { name: String(l.name) }) : (enabled && !explain ? U.lorebookNoName : ''),
    explain,
    state: statusView(l.status, U, (at) => new Date(at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }), Array.isArray(l.orphans) ? l.orphans : []),
    measure,
    measureLine: measure
      ? fill(U.lorebookMeasure, {
        entries: Number(measure.entries) || 0,
        tokens: Number(measure.tokens) || 0,
        cap: Number(measure.cap) || 0,
      })
      : '',
    overCap: Boolean(measure && measure.withinCap === false),
    overCapLine: measure && measure.withinCap === false ? U.lorebookOverCap : '',
    suggest: (Array.isArray(l.suggest) ? l.suggest : []).map((e) => ({
      uid: String((e && e.uid) || ''),
      name: String((e && Array.isArray(e.keys) && e.keys[0]) || (e && e.uid) || ''),
      text: String((e && e.content) || ''),
    })),
    orphans: (Array.isArray(l.orphans) ? l.orphans : []).map((o) => ({
      uid: String((o && o.uid) || o || ''),
    })),
  };
}

export function renderSettings(host) {
  setSectionScope('panel');
  const state = safe(() => host.getState(), null);
  const preset = safe(() => host.getPreset(), {}) || {};
  const settings = safe(() => host.getSettings(), {}) || {};
  const view = settingsView(state, settings, preset, hostExtra(host));
  const U = view.labels;
  const main = [];
  const work = [];
  const look = [];
  const data = [];

  const focusStart = mounted.focusStart === true || mounted.focusSurvey === true;
  mounted.focusStart = false;
  mounted.focusSurvey = false;
  main.push(renderStart(host, focusStart));

  work.push(renderModeBlock(host, view));
  work.push(renderAnalysisBlock(host, view));
  work.push(renderPaceBlock(host, view));
  work.push(renderApiBlock(host, view));
  work.push(renderLorebookBlock(host, view));
  const drawBlock = renderDrawBlock(host, preset, settings);
  if (drawBlock) work.push(drawBlock);

  look.push(...renderLookBlock(host, preset, settings));
  look.push(bare(renderSoundBlock(host, preset, settings), true));

  data.push(renderTransferBlock(host, view));
  data.push(renderDebugBlock(host, view));

  const feed = [bare(renderFeedBlock(host, preset, settings, renderAffairsParts(host, preset)))];

  if (focusStart) sectionOpen.set('panel::set:koldo', true);

  const X = extraLabels(preset);
  const f = settings.feed || {};
  const modeNow = (view.modes.find((m) => m.active) || {}).label;
  const ruleNow = (view.examRules.find((r) => r.active) || {}).label;
  const feedCur = [
    f.hooks === false ? X.setHooksOff : X.setHooksOn,
    f.molvaManual === true ? X.setFeedManual : fill(X.setFeedEvery, { n: Number.isInteger(f.molvaEvery) && f.molvaEvery >= 1 ? f.molvaEvery : 3 }),
  ].join(' · ');
  const accordions = [
    accordion('koldo', X.setKoldo, view.started ? U.startedButton : U.notStartedTitle, main),
    accordion('work', X.setWork, [modeNow, ruleNow, view.api.routed === 'endpoint' ? X.setApiOwn : ''].filter(Boolean).join(' · '), work),
    accordion('feed', U.tabFeed, feedCur, feed),
    accordion('look', LOOK_TEXT.section, lookSummary(settings, preset), look),
    accordion('data', X.setData, '', data),
  ];
  return { l: [artImg('casket-keys', 'settings'), el('div', { class: 'ad-acc-list' }, accordions)], cls: 'ad-plain ad-full', lcls: 'ad-illustrated', single: true };
}

function accordion(id, title, cur, body) {
  return memoDetails(`set:${id}`, {
    cls: 'ad-acc',
    summary: [el('h3', { text: title }), el('span', { class: 'ad-cur', text: cur }), svgIcon('chev', 'ad-chev')],
    body: el('div', { class: 'ad-acc-body' }, body),
  });
}

function bare(block, titled = false) {
  const parts = [...block.children].slice(1);
  const title = block.children[0] ? block.children[0].textContent : '';
  return el('div', { class: 'ad-set-sub' }, [titled ? el('h4', { text: title }) : null, ...parts]);
}

export function hostExtra(host) {
  return {
    lorebook: safe(() => (host.getLorebook ? host.getLorebook() : null), null),
    cardBooks: safe(() => (host.getCardBooks ? host.getCardBooks() : []), []),
    baseVocab: safe(() => (host.getBaseVocab ? host.getBaseVocab() : null), null),
    markerRisk: safe(() => (host.markerVisibleRisk ? host.markerVisibleRisk() : false), false),
    connections: safe(() => (host.getConnections ? host.getConnections() : null), null),
    chatId: safe(() => (host.getChatId ? String(host.getChatId() || '') : ''), ''),
  };
}
