import { MAX_RETRIES, RATE_LIMIT_DELAY_MS } from './env.js';

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function withBackoff<T>(fn: () => Promise<T>, label = 'rpc'): Promise<T> {
  let delay = RATE_LIMIT_DELAY_MS;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      const code = e?.status ?? e?.code;
      const is429 = code === 429 || /429|rate|limit/i.test(msg);
      if (!is429 || attempt === MAX_RETRIES) throw e;
      await sleep(delay + Math.floor(Math.random() * delay));
      delay *= 2;
    }
  }
  throw new Error(`${label} backoff failed`);
}
