import 'dotenv/config';

const requireEnv = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env ${k}`);
  return v;
};

export const EVM_RPC = requireEnv('EVM_RPC');
export const MINTING_HUB = requireEnv('MINTING_HUB');
export const DEPLOY_BLOCK = Number(process.env.MINTING_HUB_DEPLOY_BLOCK ?? 0);

export const BACKSCAN_BLOCKS = Number(process.env.BACKSCAN_BLOCKS ?? 250000);
export const LOG_CHUNK_SIZE = Number(process.env.LOG_CHUNK_SIZE ?? 2000);
export const RATE_LIMIT_DELAY_MS = Number(process.env.RATE_LIMIT_DELAY_MS ?? 250);
export const MAX_RETRIES = Number(process.env.MAX_RETRIES ?? 5);
export const THROTTLE_BLOCK_POLL_MS = Number(process.env.THROTTLE_BLOCK_POLL_MS ?? 4000);
export const DETAILS_BATCH_DELAY_MS = Number(process.env.DETAILS_BATCH_DELAY_MS ?? 50);

export const PORT = Number(process.env.PORT ?? 4000);
export const HOST = process.env.HOST ?? '0.0.0.0';

export const VOUCHER_MODULE = requireEnv('VOUCHER_MODULE');
export const VOUCHER_DEPLOY_BLOCK = Number(process.env.VOUCHER_DEPLOY_BLOCK ?? 0);