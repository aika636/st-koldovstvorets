import { extractJson, balancedBlock } from './core/text-utils.mjs';
import { buildTemperPrompt, parseTemperReply } from './core/temper.mjs';
import { END_MARK } from './core/feed-text.mjs';
import { translateAll } from './core/lore-english.mjs';
import { bookEntries } from './core/book-entries.mjs';

export const TIMEOUTS = {
  complete: 240000,
  models: 20000,
  test: 20000,
};

export const TOKEN_BUDGETS = {
  ping: 8,
  molva: 8192,
  temper: 8192,
  loreEnglish: 12288,
  analysis: 8192,
  looks: 6144,
  default: 1024,
};

export const RETRY = { pauses: [800, 1600] };

export function isRetryableStatus(status) {
  return typeof status === 'number' && (status === 429 || status >= 500);
}

export function isGatewayText(text) {
  return /bad gateway|gateway time-?out|upstream (?:connect|request|timed)|\b50[234]\b/i.test(String(text == null ? '' : text));
}

function isGatewayBody(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || data.choices) return false;
  return Boolean(data.error) && isGatewayText(errorDetail(data));
}

export const GATEWAY_MESSAGE = 'Шлюз модели не ответил. Попробуйте ещё раз чуть позже.';

function budgetOf(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

const LOCAL_HOST = /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[::1\]|[\w-]+\.local)(:\d+)?(\/|$)/i;

export function normalizeBase(endpoint) {
  let s = String(endpoint == null ? '' : endpoint).trim();
  if (!s) return '';
  s = s.replace(/^["'<]+|["'>]+$/g, '').trim();
  if (!s) return '';
  s = s.replace(/[?#].*$/, '');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
    s = (LOCAL_HOST.test(s) ? 'http://' : 'https://') + s.replace(/^\/+/, '');
  }
  s = s.replace(/\/+$/, '');
  const tails = [/\/chat\/completions$/i, /\/completions$/i, /\/models$/i, /\/v1$/i];
  for (let guard = 0; guard < 8; guard += 1) {
    const before = s;
    for (const t of tails) s = s.replace(t, '');
    s = s.replace(/\/+$/, '');
    if (s === before) break;
  }
  return s;
}

export function chatUrl(endpoint) {
  const base = normalizeBase(endpoint);
  return base ? `${base}/v1/chat/completions` : '';
}

export function modelsUrl(endpoint) {
  const base = normalizeBase(endpoint);
  return base ? `${base}/v1/models` : '';
}

export function hasOwnEndpoint(api) {
  const a = api || {};
  return Boolean(normalizeBase(a.endpoint));
}

export function resolveSource(api) {
  const src = api && api.source ? String(api.source) : 'auto';
  if (src === 'tavern') return 'tavern';
  if (src === 'own') return 'endpoint';
  return hasOwnEndpoint(api) ? 'endpoint' : 'tavern';
}

export function escapeMacros(text) {
  return String(text == null ? '' : text).replace(/\{(?=\{)/g, '{​');
}

function withDeadline(promise, ms, signal) {
  return new Promise((resolve, reject) => {
    const fail = (timeout) => {
      const error = new Error(timeout ? 'timeout' : 'aborted');
      error.name = 'AbortError';
      if (timeout) error.timeout = true;
      reject(error);
    };
    if (signal && signal.aborted) return fail(false);
    const timer = setTimeout(() => fail(true), ms);
    const onAbort = () => { clearTimeout(timer); fail(false); };
    if (signal && typeof signal.addEventListener === 'function') signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve(promise).then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

const WEB_SEARCH_KEYS = ['enable_web_search', 'use_web_search', 'web_search'];

export async function withoutForeignInjections(ctx, probe, run) {
  const bus = ctx && ctx.eventSource;
  if (!bus || typeof bus.makeFirst !== 'function' || typeof bus.makeLast !== 'function'
    || typeof bus.removeListener !== 'function') return run();
  const types = (ctx && (ctx.eventTypes || ctx.event_types)) || {};
  const chatEvent = types.CHAT_COMPLETION_PROMPT_READY || 'chat_completion_prompt_ready';
  const settingsEvent = types.CHAT_COMPLETION_SETTINGS_READY || 'chat_completion_settings_ready';
  const textEvent = types.GENERATE_AFTER_COMBINE_PROMPTS || 'generate_after_combine_prompts';
  const needle = String(probe == null ? '' : probe).trim().slice(0, 60);
  if (!needle) return run();
  const has = (content) => typeof content === 'string' && content.includes(needle);
  let chatSnap = null;
  let textSnap = null;

  const chatFirst = (data) => {
    if (chatSnap || !data || data.dryRun || !Array.isArray(data.chat)) return;
    if (data.chat.some((m) => m && has(m.content))) {
      chatSnap = { data, chat: data.chat, copy: data.chat.map((m) => ({ ...m })) };
    }
  };
  const settingsFirst = (data) => {
    if (!data || data.dryRun || !Array.isArray(data.messages)) return;
    if (!data.messages.some((m) => m && has(m.content))) return;
    for (const key of WEB_SEARCH_KEYS) if (key in data) delete data[key];
  };
  const chatLast = (data) => {
    if (!chatSnap || data !== chatSnap.data) return;
    chatSnap.chat.splice(0, chatSnap.chat.length, ...chatSnap.copy);
    data.chat = chatSnap.chat;
  };
  const textFirst = (data) => {
    if (textSnap || !data || data.dryRun || typeof data.prompt !== 'string') return;
    if (has(data.prompt)) textSnap = { data, prompt: data.prompt };
  };
  const textLast = (data) => {
    if (!textSnap || data !== textSnap.data) return;
    data.prompt = textSnap.prompt;
  };

  bus.makeFirst(settingsEvent, settingsFirst);
  bus.makeFirst(chatEvent, chatFirst);
  bus.makeLast(chatEvent, chatLast);
  bus.makeFirst(textEvent, textFirst);
  bus.makeLast(textEvent, textLast);
  try {
    return await run();
  } finally {
    for (const [e, f] of [[settingsEvent, settingsFirst], [chatEvent, chatFirst], [chatEvent, chatLast], [textEvent, textFirst], [textEvent, textLast]]) {
      try { bus.removeListener(e, f); } catch {}
    }
  }
}

export async function tavernComplete(ctx, req = {}) {
  let res = await tavernCompleteOnce(ctx, req);
  for (const pause of req.retry === false ? [] : RETRY.pauses) {
    if (res.ok || res.code !== 'gateway') break;
    await sleepImpl(pause, req.signal);
    if (req.signal && req.signal.aborted) return classifyError({ error: abortError() });
    res = await tavernCompleteOnce(ctx, req);
  }
  return res;
}

function tavernFailure(error, fallback) {
  const detail = (error && error.message) || '';
  if (isGatewayText(detail)) return classifyError({ gateway: true, status: 200, body: detail });
  return { ok: false, code: 'tavern', status: null, detail, message: fallback(detail || 'без подробностей') };
}

async function tavernCompleteOnce(ctx, req = {}) {
  const { system = '', user = '', profileId = '' } = req;
  const maxTokens = budgetOf(req.maxTokens, TOKEN_BUDGETS.default);
  const c = tavern(ctx);
  const service = c && c.ConnectionManagerRequestService;
  const profiles = (c && c.extensionSettings && c.extensionSettings.connectionManager
    && c.extensionSettings.connectionManager.profiles) || [];
  const profile = profileId ? profiles.find((p) => p && p.id === profileId) : null;

  if (profileId && !profile) {
    return {
      ok: false,
      code: 'no-profile',
      status: null,
      detail: '',
      message: 'Выбранный профиль подключения в таверне не найден: выберите его заново.',
    };
  }

  if (profile && service && typeof service.sendRequest === 'function') {
    try {
      const messages = [];
      if (system) messages.push({ role: 'system', content: system });
      messages.push({ role: 'user', content: user });
      const out = await withDeadline(service.sendRequest(profile.id, messages, maxTokens, {
        stream: false, extractData: true, includePreset: true, includeInstruct: true,
      }), req.timeout || TIMEOUTS.complete, req.signal);
      if (isGatewayBody(out)) return classifyError({ gateway: true, status: 200, body: out });
      const text = parseCompletion(out);
      if (!text.trim()) return { ok: false, code: 'empty', status: null, detail: '', message: 'Модель вернула пустой ответ.' };
      return {
        ok: true, text, via: 'tavern', profile: profile.name || profile.id,
        budget: maxTokens, truncated: isTruncated(out, text),
      };
    } catch (error) {
      if (error && error.name === 'AbortError') return classifyError({ error });
      return tavernFailure(error, (why) => `Профиль «${profile.name || profile.id}» не дал ответа: ${why}.`);
    }
  }

  if (!c || (typeof c.generateRaw !== 'function' && typeof c.generateRawData !== 'function')) {
    return {
      ok: false,
      code: 'no-endpoint',
      status: null,
      detail: '',
      message: profile
        ? 'Профиль выбран, но эта сборка таверны не умеет отвечать на запрос расширения по профилю.'
        : 'Подключение таверны недоступно.',
    };
  }
  try {
    const args = { prompt: escapeMacros(user), systemPrompt: escapeMacros(system), responseLength: maxTokens };
    const ask = typeof c.generateRawData === 'function'
      ? () => c.generateRawData(args)
      : () => c.generateRaw(args);
    const out = await withoutForeignInjections(c, args.prompt, () => withDeadline(
      ask(), req.timeout || TIMEOUTS.complete, req.signal,
    ));
    if (isGatewayBody(out)) return classifyError({ gateway: true, status: 200, body: out });
    const text = parseCompletion(out);
    if (!text.trim()) return { ok: false, code: 'empty', status: null, detail: '', message: 'Модель вернула пустой ответ.' };
    return { ok: true, text, via: 'tavern', budget: maxTokens, truncated: isTruncated(out, text) };
  } catch (error) {
    if (error && error.name === 'AbortError') return classifyError({ error });
    return tavernFailure(error, (why) => `Подключение таверны не дало ответа: ${why}.`);
  }
}

export function parseCompletion(data) {
  if (data == null) return '';
  if (typeof data === 'string') return data;
  if (Array.isArray(data)) return data.map(parseCompletion).filter(Boolean).join('\n');
  if (typeof data !== 'object') return String(data);

  const choice = Array.isArray(data.choices) ? data.choices[0] : null;
  if (choice) {
    const msg = choice.message || choice.delta;
    if (msg) {
      const c = contentToString(msg.content);
      if (c) return c;
      if (msg.reasoning_content || msg.reasoning) return '';
    }
    const t = contentToString(choice.text);
    if (t) return t;
  }
  for (const key of ['response', 'content', 'text', 'output_text', 'completion']) {
    const v = contentToString(data[key]);
    if (v) return v;
  }
  if (data.message) {
    const v = contentToString(data.message.content !== undefined ? data.message.content : data.message);
    if (v) return v;
  }
  if (Array.isArray(data.output)) {
    const v = data.output.map((o) => contentToString(o && o.content)).filter(Boolean).join('\n');
    if (v) return v;
  }
  return '';
}

function contentToString(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map(contentToString).filter(Boolean).join('');
  if (typeof v === 'object') return contentToString(v.text !== undefined ? v.text : v.content);
  return String(v);
}

export function finishReason(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return '';
  const choice = Array.isArray(data.choices) ? data.choices[0] : null;
  const v = (choice && (choice.finish_reason || choice.finishReason || choice.stop_reason))
    || data.finish_reason || data.stop_reason || '';
  return v ? String(v) : '';
}

export function isTruncatedReason(reason) {
  return /^(length|max_tokens|max-tokens|maxtokens)$/i.test(String(reason || '').trim());
}

export function looksTruncated(text) {
  const s = String(text == null ? '' : text);
  if (!/[{[]/.test(s)) return false;
  return balancedBlock(s) === '';
}

function isTruncated(data, text) {
  return isTruncatedReason(finishReason(data)) || looksTruncated(text);
}

export function truncatedMessage(half, fallback = '') {
  return `Модель не договорила: ${half}. Попробуйте ещё раз.`
    + (fallback ? ` ${fallback}` : '');
}

export function parseModels(data) {
  const rows = Array.isArray(data) ? data
    : (data && (Array.isArray(data.data) ? data.data : (Array.isArray(data.models) ? data.models : [])));
  const out = [];
  for (const row of rows || []) {
    const id = typeof row === 'string' ? row : (row && (row.id || row.name || row.model));
    if (id && !out.includes(String(id))) out.push(String(id));
  }
  return out;
}

export function classifyError(info = {}) {
  const status = typeof info.status === 'number' ? info.status : null;
  const detail = errorDetail(info.body) || (info.error && info.error.message) || '';
  const err = info.error;
  const where = info.url ? ` (${info.url})` : '';
  const make = (code, message) => ({ ok: false, code, message, status, detail });

  if (err && (err.name === 'AbortError' || err.code === 'ABORT_ERR')) {
    return err.timeout
      ? make('timeout', `Модель не ответила за отведённое время${where}.`)
      : make('aborted', 'Запрос отменён.');
  }
  if (info.gateway === true || status === 502 || status === 504 || (status !== null && isGatewayText(detail))) {
    return make('gateway', GATEWAY_MESSAGE);
  }
  if (status === null) {
    return make('network', `Адрес не отвечает${where}: сервер недоступен, неверный адрес`
      + ' или провайдер не разрешает запросы из браузера (CORS).');
  }
  if (status === 401 || status === 403) {
    return make('auth', `Ключ не принят (${status}). Проверьте ключ API и права на этой модели.`);
  }
  if (status === 404) {
    if (/model/i.test(detail)) {
      return make('model', `Модель «${info.model || '?'}» не найдена (404). Возьмите её из списка моделей.`);
    }
    return make('not-found', `Путь не найден (404)${where}. Скорее всего, в адресе лишний или недостающий /v1.`);
  }
  if (status === 429) return make('rate', 'Слишком много запросов (429). Подождите и повторите.');
  if (status === 400 || status === 422) {
    if (/model/i.test(detail)) {
      return make('model', `Модель «${info.model || '?'}» не подходит: ${detail || 'сервер отверг запрос'}.`);
    }
    return make('bad-request', `Сервер отверг запрос (${status}): ${detail || 'без подробностей'}.`);
  }
  if (status >= 500) return make('server', `Ошибка на стороне сервера (${status}): ${detail || 'без подробностей'}.`);
  return make('http', `Неожиданный ответ (${status}): ${detail || 'без подробностей'}.`);
}

export function safeReason(text, max = 120) {
  let t = String(text || '').trim();
  if (/^[{[]/.test(t)) return '';
  t = t.replace(/\b(?:https?:\/\/|www\.)\S+/gi, '').replace(/\bBearer\s+\S+/gi, '')
    .replace(/\b(?:sk|pk|key|AIza|gsk|xai)[-_A-Za-z0-9]{12,}/g, '').replace(/\b[A-Za-z0-9_-]{28,}\b/g, '')
    .replace(/\s+/g, ' ').replace(/\s+([.,;:])/g, '$1').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

export function secretaryFailure(res = {}) {
  const head = 'Секретарь не ответил';
  const why = safeReason(res.detail);
  const st = res.status ? ` (${res.status})` : '';
  const retry = ' Нажмите «Разобрать заново».';
  if (res.code === 'empty') return `${head}: пустой ответ.${retry}`;
  if (res.code === 'timeout') return `${head}: время вышло.${retry}`;
  if (res.code === 'network') return `${head}: нет связи с моделью. Проверьте сеть и адрес.${retry}`;
  if (res.code === 'gateway') return `${head}: шлюз модели недоступен.${retry}`;
  if (res.code === 'rate' || res.status === 402) return `${head}: квота исчерпана${st}. Подождите или смените ключ.${retry}`;
  if (res.code === 'auth') return `${head}: ключ не принят${st}. Проверьте ключ в настройках.`;
  if (res.code === 'server') return `${head}: ошибка на стороне сервера${st}${why ? `: ${why}` : ''}.${retry}`;
  if (['tavern', 'bad-request', 'http', 'model', 'not-found'].includes(res.code)) {
    return `${head}: провайдер отказал${st}${why ? `: ${why}` : ''}.${retry}`;
  }
  const own = safeReason(res.message);
  return `${head}: ${own || 'причина не названа'}${/[.!?…]$/.test(own) ? '' : '.'}${retry}`;
}

export function errorDetail(body) {
  if (!body) return '';
  if (typeof body === 'string') return body.slice(0, 400).trim();
  if (typeof body !== 'object') return String(body);
  const e = body.error;
  if (typeof e === 'string') return e.slice(0, 400);
  if (e && typeof e === 'object' && e.message) return String(e.message).slice(0, 400);
  if (body.message) return String(body.message).slice(0, 400);
  if (body.detail) return typeof body.detail === 'string' ? body.detail.slice(0, 400) : JSON.stringify(body.detail).slice(0, 400);
  return '';
}

let fetchImpl = (...args) => globalThis.fetch(...args);

export function setFetch(fn) {
  fetchImpl = typeof fn === 'function' ? fn : (...args) => globalThis.fetch(...args);
}

let contextProvider = () => (globalThis.SillyTavern && globalThis.SillyTavern.getContext
  ? globalThis.SillyTavern.getContext()
  : null);

export function setContextProvider(fn) {
  contextProvider = typeof fn === 'function' ? fn : () => null;
}

function tavern(ctx) {
  return ctx || contextProvider();
}

const KEY_INVISIBLE = /[​-‍⁠﻿]/g;

const KEY_EDGES = /^[\s ]+|[\s ]+$/g;

function describeKeyChar(ch) {
  const cp = ch.codePointAt(0);
  const hex = `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
  if (ch === ' ') return 'пробел';
  if (ch === '\n' || ch === '\r') return 'перенос строки';
  if (ch === '\t') return 'табуляция';
  if (cp === 0xA0) return 'неразрывный пробел';
  if (cp < 0x20 || cp === 0x7F) return `управляющий символ ${hex}`;
  if (cp >= 0x400 && cp <= 0x4FF) return `кириллическая буква «${ch}» — скорее всего, вместо похожей латинской`;
  return `символ «${ch}» (${hex})`;
}

export function sanitizeApiKey(raw) {
  const key = String(raw == null ? '' : raw).replace(KEY_INVISIBLE, '').replace(KEY_EDGES, '');
  const at = key.search(/[^\x21-\x7E]/);
  if (at === -1) return { ok: true, key };
  const ch = String.fromCodePoint(key.codePointAt(at));
  return {
    ok: false,
    key,
    position: at + 1,
    message: `В ключе API лишний символ: ${describeKeyChar(ch)}, ${at + 1}-й по счёту.`
      + ' Так бывает, когда ключ копируют из мессенджера или заметок.'
      + ' Вставьте ключ заново — лучше прямо из кабинета провайдера.',
  };
}

export function keyProblem(api) {
  const res = sanitizeApiKey(api && api.key);
  if (res.ok) return null;
  return { ok: false, code: 'bad-key', status: null, detail: '', message: res.message };
}

export function headersFor(api) {
  const h = { 'Content-Type': 'application/json' };
  const res = sanitizeApiKey(api && api.key);
  if (res.ok && res.key) h.Authorization = `Bearer ${res.key}`;
  return h;
}

function defaultSleep(ms, signal) {
  return new Promise((resolve) => {
    if (signal && signal.aborted) { resolve(); return; }
    const done = () => { clearTimeout(timer); if (signal) signal.removeEventListener('abort', done); resolve(); };
    const timer = setTimeout(done, ms);
    if (signal) signal.addEventListener('abort', done, { once: true });
  });
}

let sleepImpl = defaultSleep;

export function setSleep(fn) {
  sleepImpl = typeof fn === 'function' ? fn : defaultSleep;
}

function abortError() {
  return Object.assign(new Error('aborted'), { name: 'AbortError' });
}

async function request(url, init, opts) {
  const pauses = opts.retry === false ? [] : RETRY.pauses;
  let res = await requestOnce(url, init, opts);
  let tries = 1;
  for (const pause of pauses) {
    if (res.ok || !(isRetryableStatus(res.status) || res.code === 'gateway')) break;
    await sleepImpl(pause, opts.signal);
    if (opts.signal && opts.signal.aborted) return classifyError({ error: abortError(), url, model: opts.model });
    res = await requestOnce(url, init, opts);
    tries += 1;
  }
  if (!res.ok && tries > 1 && res.code !== 'gateway') {
    const again = tries - 1 === 1 ? 'уже повторило запрос' : `уже повторило запрос ${tries - 1} раза`;
    return { ...res, tries, message: `${res.message} Расширение ${again} с паузой — попробуйте позже.` };
  }
  return res;
}

async function requestOnce(url, init, { timeout, signal, model }) {
  const ctl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctl.abort(); }, timeout);
  const onAbort = () => ctl.abort();
  if (signal) {
    if (signal.aborted) ctl.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    const res = await fetchImpl(url, { ...init, signal: ctl.signal });
    const raw = await res.text().catch(() => '');
    let data;
    try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
    if (!res.ok) return classifyError({ status: res.status, body: data, url, model });
    if (isGatewayBody(data)) return classifyError({ status: res.status, body: data, url, model, gateway: true });
    return { ok: true, status: res.status, data, raw };
  } catch (error) {
    if (timedOut && error && error.name === 'AbortError') error.timeout = true;
    return classifyError({ error, url, model });
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

export async function listModels(api, opts = {}) {
  if (resolveSource(api) === 'tavern') {
    return {
      ok: false,
      code: 'tavern-no-models',
      status: null,
      detail: '',
      message: 'Список моделей есть только у своего адреса. У актуального подключения таверны модель задаёт сама таверна — здесь её выбирать нечем.',
    };
  }
  const url = modelsUrl(api && api.endpoint);
  if (!url) return { ok: false, code: 'no-endpoint', message: 'Адрес не задан: вписать endpoint.', status: null, detail: '' };
  const bad = keyProblem(api);
  if (bad) return bad;
  const direct = await request(url, { method: 'GET', headers: headersFor(api) }, {
    timeout: opts.timeout || TIMEOUTS.models,
    signal: opts.signal,
  });
  let res = direct;
  let via = '';
  if (!direct.ok && direct.code === 'network') {
    const alt = await listModelsViaTavern(api, opts);
    if (alt && alt.ok) { res = alt; via = 'tavern-backend'; }
    else if (alt && alt.aborted) return alt.aborted;
    else if (alt) {
      return { ...direct, message: `${direct.message} Запрос через сервер таверны тоже не удался: ${alt.message}` };
    }
  }
  if (!res.ok) return res;
  const models = parseModels(res.data);
  if (!models.length) {
    return { ok: false, code: 'empty-list', message: 'Сервер ответил, но список моделей пуст — впишите имя модели вручную.', status: res.status, detail: '' };
  }
  return via ? { ok: true, models, via } : { ok: true, models };
}

export const TAVERN_STATUS_URL = '/api/backends/chat-completions/status';

async function listModelsViaTavern(api, opts = {}) {
  const c = tavern(opts.ctx);
  if (!c || typeof c.getRequestHeaders !== 'function') return null;
  let headers;
  try { headers = c.getRequestHeaders(); } catch { return null; }
  const base = normalizeBase(api && api.endpoint);
  if (!base) return null;
  const body = {
    chat_completion_source: 'openai',
    reverse_proxy: `${base}/v1`,
    proxy_password: sanitizeApiKey(api && api.key).key,
  };
  const res = await request(TAVERN_STATUS_URL, { method: 'POST', headers, body: JSON.stringify(body) }, {
    timeout: opts.timeout || TIMEOUTS.models,
    signal: opts.signal,
    retry: false,
  });
  if (!res.ok) {
    if (res.code === 'aborted') return { ok: false, aborted: res, message: res.message };
    const why = res.status === 403
      ? 'сервер таверны отказал (403) — обновите страницу таверны и повторите.'
      : (res.status ? `сервер таверны ответил ${res.status}.` : 'сервер таверны не ответил.');
    return { ok: false, message: why };
  }
  const data = res.data;
  if (data && typeof data === 'object' && data.error) {
    return {
      ok: false,
      message: 'сервер таверны до адреса дошёл, но списка не получил — адрес не тот или ключ не принят'
        + ' (подробности в консоли сервера таверны).',
    };
  }
  return { ok: true, data, status: res.status };
}

export async function testConnection(api, opts = {}) {
  if (resolveSource(api) === 'tavern') {
    const res = await tavernComplete(opts.ctx, {
      user: 'ping', maxTokens: budgetOf(opts.maxTokens, TOKEN_BUDGETS.ping), profileId: (api && api.profile) || '',
    });
    if (!res.ok && res.code !== 'empty') return res;
    return { ok: true, message: res.profile ? `Связь есть: профиль «${res.profile}» отвечает.` : 'Связь есть: текущее подключение таверны отвечает.', model: res.profile || '' };
  }
  const url = chatUrl(api && api.endpoint);
  if (!url) {
    return { ok: false, code: 'no-endpoint', message: 'Адрес не задан: вписать endpoint.', status: null, detail: '' };
  }
  const model = (api && api.model) || '';
  if (!model) {
    return { ok: false, code: 'no-model', message: 'Модель не выбрана: возьмите её из списка или впишите вручную.', status: null, detail: '' };
  }
  const bad = keyProblem(api);
  if (bad) return bad;
  const body = {
    model,
    messages: [{ role: 'user', content: 'ping' }],
    max_tokens: 1,
    temperature: 0,
  };
  const res = await request(url, { method: 'POST', headers: headersFor(api), body: JSON.stringify(body) }, {
    timeout: opts.timeout || TIMEOUTS.test,
    signal: opts.signal,
    model,
    retry: false,
  });
  if (!res.ok) return res;
  return { ok: true, message: `Связь есть: ${model} отвечает.`, model };
}

const BLANKS = [String.fromCharCode(0x200b), String.fromCharCode(0x200c)];

export function cacheMark(len = 24) {
  let out = '';
  for (let k = 0; k < len; k += 1) out += BLANKS[Math.floor(Math.random() * BLANKS.length)];
  return out;
}

export const withMark = (text) => `${text}${cacheMark()}`;

export function endMissing(text, mark) {
  return Boolean(mark) && !String(text == null ? '' : text).includes(mark);
}

function closed(res, mark) {
  return res && res.ok && endMissing(res.text, mark) ? { ...res, truncated: true, endMissing: true } : res;
}

export const wholeChars = (s) => String(s).replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');

export async function complete(api, req = {}) {
  return closed(await completeOnce(api, req), req.endMark);
}

async function completeOnce(api, req) {
  const system = wholeChars(req.system || '');
  const user = req.again ? withMark(wholeChars(req.user || '')) : wholeChars(req.user || '');
  const { ctx, signal } = req;
  const url = chatUrl(api && api.endpoint);
  const source = resolveSource(api);

  if (source === 'endpoint' && !(url && api && api.model)) {
    return {
      ok: false,
      code: 'no-endpoint',
      status: null,
      detail: '',
      message: url
        ? 'Выбран свой адрес, но модель не выбрана: возьмите её из списка или впишите вручную.'
        : 'Выбран свой адрес, но он не вписан.',
    };
  }

  if (source === 'endpoint') {
    const bad = keyProblem(api);
    if (bad) return bad;
    const messages = [];
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: user });
    const budget = budgetOf(req.maxTokens, TOKEN_BUDGETS.default);
    const body = { model: api.model, messages, temperature: req.temperature ?? 0.7, max_tokens: budget };
    const res = await request(url, { method: 'POST', headers: headersFor(api), body: JSON.stringify(body) }, {
      timeout: req.timeout || TIMEOUTS.complete,
      signal,
      model: api.model,
    });
    if (!res.ok) return res;
    const text = parseCompletion(res.data);
    if (!text.trim()) {
      return {
        ok: false, code: 'empty', status: res.status, detail: res.raw ? String(res.raw).slice(0, 400) : '',
        message: 'Модель вернула пустой ответ.',
      };
    }
    return { ok: true, text, via: 'endpoint', budget, truncated: isTruncated(res.data, text) };
  }

  return tavernComplete(ctx, {
    system, user, maxTokens: budgetOf(req.maxTokens, TOKEN_BUDGETS.default), profileId: (api && api.profile) || '',
    timeout: req.timeout, signal,
  });
}

export const CARD_LIMITS = { field: 1200, firstMessage: 1500 };

const cardStr = (v) => (v == null ? '' : String(v)).trim();

function cut(s, limit) {
  const t = cardStr(s);
  return t.length > limit ? `${t.slice(0, limit).trim()}…` : t;
}

export function firstCharacterMessage(ctx) {
  const c = tavern(ctx);
  const chat = c && Array.isArray(c.chat) ? c.chat : [];
  for (const m of chat) {
    if (!m || m.is_user || m.is_system) continue;
    const text = cardStr(m.mes);
    if (text) return text;
  }
  return '';
}

export function readCharacterCard(ctx) {
  const c = tavern(ctx);
  if (!c) {
    return { ok: false, code: 'no-context', message: 'Контекст SillyTavern недоступен: карточку неоткуда взять.' };
  }

  let fields = null;
  if (typeof c.getCharacterCardFields === 'function') {
    try { fields = c.getCharacterCardFields(); } catch { fields = null; }
  }
  const chars = Array.isArray(c.characters) ? c.characters : [];
  const chid = c.characterId;
  const char = (chid !== null && chid !== undefined && chars[chid]) || null;
  const f = fields || {};

  const card = {
    name: cardStr(c.name2) || cardStr(char && char.name),
    description: cut(f.description || (char && char.description), CARD_LIMITS.field),
    personality: cut(f.personality || (char && char.personality), CARD_LIMITS.field),
    scenario: cut(f.scenario || (char && char.scenario), CARD_LIMITS.field),
    creatorNotes: cut(f.creatorNotes || (char && char.data && char.data.creator_notes), CARD_LIMITS.field),
    firstMessage: cut(firstCharacterMessage(c) || f.firstMessage || (char && char.first_mes), CARD_LIMITS.firstMessage),
  };

  const hasCardText = Boolean(card.description || card.personality || card.scenario || card.creatorNotes);
  if (!hasCardText && !card.firstMessage) {
    if (!char && c.groupId) {
      return {
        ok: false,
        code: 'group',
        message: 'Это групповой чат, и общей карточки в нём нет.',
      };
    }
    if (!char) {
      return { ok: false, code: 'no-character', message: 'Персонаж не выбран: расширению нечего читать.' };
    }
    return {
      ok: false,
      code: 'empty-card',
      message: `Карточка «${card.name || 'без имени'}» пуста: ни описания, ни сценария, ни первого сообщения.`
        + ' Читать нечего.',
    };
  }

  const warnings = [];
  if (!card.firstMessage) warnings.push('первого сообщения нет: предположение построено только по карточке');
  if (!hasCardText) warnings.push('карточка пуста: предположение построено только по первому сообщению');
  return { ok: true, card, warnings };
}

export function cardToText(card) {
  const c = card || {};
  const parts = [];
  if (c.description) parts.push(`Описание: ${c.description}`);
  if (c.personality) parts.push(`Характер: ${c.personality}`);
  if (c.scenario) parts.push(`Сценарий: ${c.scenario}`);
  if (c.creatorNotes) parts.push(`Заметки автора: ${c.creatorNotes}`);
  return parts.join('\n') || '(карточка пуста)';
}

let charLoreSource = null;
export async function warmCharLore() {
  try {
    const mod = await import('../../../world-info.js');
    charLoreSource = mod && mod.world_info ? mod.world_info : null;
  } catch {}
}

export function extraBookNames(ctx) {
  const out = [];
  try {
    const c = tavern(ctx) || {};
    const chars = Array.isArray(c.characters) ? c.characters : [];
    const char = c.characterId !== null && c.characterId !== undefined ? chars[c.characterId] : null;
    const avatar = cardStr(char && char.avatar);
    if (!avatar) return out;
    const bare = avatar.replace(/\.[^./]+$/, '');
    const lore = [c.world_info, c.worldInfoSettings, charLoreSource].map((w) => w && w.charLore).find(Array.isArray) || [];
    for (const e of lore) {
      const name = cardStr(e && e.name);
      if (!name || (name !== avatar && name !== bare)) continue;
      for (const b of Array.isArray(e.extraBooks) ? e.extraBooks : []) {
        const book = cardStr(b);
        if (book && !out.includes(book)) out.push(book);
      }
    }
  } catch {}
  return out;
}

export function activeBookNames(ctx) {
  const c = tavern(ctx) || {};
  const out = [];
  const add = (v) => {
    const name = cardStr(v);
    if (!name || name.startsWith('Колдовстворец — ')) return;
    if (!out.includes(name)) out.push(name);
  };
  try {
    add(c.chatMetadata && c.chatMetadata.world_info);
    const chars = Array.isArray(c.characters) ? c.characters : [];
    const char = c.characterId !== null && c.characterId !== undefined ? chars[c.characterId] : null;
    const data = (char && char.data) || {};
    add(data.extensions && data.extensions.world);
    add(data.character_book && data.character_book.name);
  } catch {}
  extraBookNames(ctx).forEach(add);
  return out;
}

export async function loadLoreEntries(ctx, loadBook, only) {
  const names = Array.isArray(only) ? only : activeBookNames(ctx);
  const c = tavern(ctx) || {};
  const char = Array.isArray(c.characters) && c.characterId != null ? c.characters[c.characterId] : null;
  const embedded = char && char.data && char.data.character_book;
  const entries = [], books = [];
  for (const name of names) {
    let book = null;
    try {
      book = embedded && cardStr(embedded.name) === name ? embedded
        : typeof loadBook === 'function' ? await loadBook(name) : null;
    } catch {}
    const list = bookEntries(book, name);
    if (list.length) { books.push(name); entries.push(...list); }
  }
  return { entries, books, names };
}

export async function generateHeroineTemper(input, api, ctx, opts = {}) {
  const prompt = buildTemperPrompt(input);
  const res = typeof opts.ask === 'function' ? await opts.ask(prompt) : await complete(api, {
    system: prompt.system, user: prompt.user, ctx, signal: opts.signal, timeout: opts.timeout, temperature: 0.5, maxTokens: budgetOf(opts.maxTokens, TOKEN_BUDGETS.temper),
  });
  return res && res.ok && res.truncated !== true ? parseTemperReply(res.text).temper : '';
}

export async function generateMolva(prompt, api, ctx, opts = {}) {
  const res = typeof opts.ask === 'function'
    ? await opts.ask(prompt)
    : await complete(api, {
      system: prompt.system,
      user: prompt.user,
      ctx,
      signal: opts.signal,
      timeout: opts.timeout,
      temperature: 0.95,
      endMark: END_MARK,
      maxTokens: budgetOf(opts.maxTokens, TOKEN_BUDGETS.molva),
    });
  if (!res || !res.ok) return { ok: false, code: (res && res.code) || 'api', error: (res && (res.message || res.error)) || 'запрос не удался' };
  return { ok: true, text: String(res.text || ''), truncated: res.truncated === true, ...(res.endMissing === true ? { endMissing: true } : {}) };
}

export async function generateLoreEnglish(items, api, ctx, opts = {}) {
  const ask = typeof opts.ask === 'function' ? opts.ask : async (prompt) => {
    const res = await complete(api, {
      system: prompt.system,
      user: prompt.user,
      ctx,
      signal: opts.signal,
      timeout: opts.timeout,
      temperature: 0.2,
      maxTokens: budgetOf(opts.maxTokens, TOKEN_BUDGETS.loreEnglish),
    });
    return res.ok ? { ok: true, text: res.text, truncated: res.truncated === true } : { ok: false, code: res.code, message: res.message };
  };
  return translateAll(items, ask, { userName: opts.userName, charNames: opts.charNames, chat: opts.chat, spellings: opts.spellings });
}
