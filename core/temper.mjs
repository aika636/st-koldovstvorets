import { heroWords, presetGender } from './gender.mjs';
import { lastBlock } from './leak.mjs';
import { END_MARK, goodProfile } from './feed-text.mjs';

export const PERSONA_MAX = 1500;
export const TEMPER_MAX = 400;

const oneLine = (v, max) => (typeof v === 'string' ? v : '').replace(/\s+/g, ' ').trim().slice(0, max).trim();

export function buildTemperPrompt(input) {
  const i = input || {};
  const w = heroWords(presetGender(i.preset));
  const persona = oneLine(i.persona, PERSONA_MAX);
  const name = oneLine(i.heroine, 80);
  return {
    system: 'Ты помогаешь вести школьную молву в ролевой игре; все участники совершеннолетние (18+). Отвечай одной короткой строкой, без пояснений и markdown.',
    user: [
      `Описание ${w.heroGen}${name ? ` (${name})` : ''}:`,
      persona,
      '',
      `НРАВ: одна-две фразы своими словами, каков нрав ${w.heroGen} в глазах школы и как с ${w.she === 'она' ? 'ней' : 'ним'} обращаются. Только по описанию.`,
      `Ответ — строка «НРАВ: …», затем строка «${END_MARK}».`,
    ].join('\n'),
  };
}

export function parseTemperReply(text) {
  const clean = String(text == null ? '' : text).replace(/<!--[\s\S]*?(?:-->|$)/g, '').replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').replace(/\r/g, '');
  for (const line of lastBlock(clean, { mark: END_MARK }).split('\n')) {
    const body = line.replace(/^\s*(?:[-–—*•]|\d+[.)])\s*/, '').replace(/[*`]+/g, '').trim();
    if (!body || new RegExp(`^${END_MARK}`, 'iu').test(body)) continue;
    const m = /^[\s*_#>`-]*нрав(?:\s*\([^)]*\))?\s*[:—–]\s*(.+)$/iu.exec(body);
    const got = goodProfile(m ? m[1] : body, { min: 8, max: TEMPER_MAX });
    if (got) return { temper: got };
  }
  return { temper: '' };
}
