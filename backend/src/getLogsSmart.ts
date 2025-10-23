import { Log } from 'ethers';
import { provider } from './provider.js';
import { withBackoff } from './backoff.js';

export async function getLogsSmart(params: {
  address: string;
  fromBlock: number;
  toBlock: number;
  topics?: (string | null)[] | (string | string[] | null)[];
  label?: string;
  minSpan?: number; // don't split below this many blocks
}): Promise<Log[]> {
  const { address, fromBlock, toBlock } = params;
  const topics = params.topics;
  const label = params.label ?? 'getLogs';
  const minSpan = params.minSpan ?? 50;

  async function inner(from: number, to: number): Promise<Log[]> {
    try {
      return await withBackoff(
        () => provider.getLogs({ address, fromBlock: from, toBlock: to, topics }),
        `${label} [${from}-${to}]`
      );
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      const code = e?.code ?? e?.status;
      const isTimeout = code === -32020 || /504|timeout|mirror node upstream failure/i.test(msg);
      // If it's a timeout and the span is large, split and recurse
      if (!isTimeout || (to - from) <= minSpan) throw e;
      const mid = from + Math.floor((to - from) / 2);
      const left = await inner(from, mid);
      const right = await inner(mid + 1, to);
      return left.concat(right);
    }
  }

  return inner(fromBlock, toBlock);
}
