import { ethers, Log } from "ethers";
import { prisma } from "./db.js";
import { provider } from "./provider.js";
import { voucherModuleAbi } from "./abis.js";
import { withBackoff, sleep } from "./backoff.js";
import {
  LOG_CHUNK_SIZE,
  THROTTLE_BLOCK_POLL_MS,
  VOUCHER_MODULE,
  VOUCHER_DEPLOY_BLOCK,
  BACKSCAN_BLOCKS,
} from "./env.js";

const iface = new ethers.Interface(voucherModuleAbi);

const topicIssue = ethers.id("Issue(address,address,uint256)");
const topicSpend = ethers.id("Spend(address,address,uint256)");
const topicRedeem = ethers.id("Redeem(address,uint256,uint256,uint256)");

const blockTsCache = new Map<number, number>();
async function getBlockTs(bn: number) {
  if (blockTsCache.has(bn)) return blockTsCache.get(bn)!;
  const block = await withBackoff(() => provider.getBlock(bn), "getBlock");
  const ts = Number(block?.timestamp ?? 0);
  blockTsCache.set(bn, ts);
  return ts;
}

async function handleLogs(logs: Log[]) {
  for (const lg of logs) {
    try {
      const ev = iface.parseLog(lg);

      if (ev?.name === "Issue") {
        const sponsor = (ev.args.sponsor as string).toLowerCase();
        const merchant = (ev.args.merchant as string).toLowerCase();
        const amount = (ev.args.amount as bigint).toString();

        await prisma.voucherIssue.upsert({
          where: {
            txHash_logIndex: {
              txHash: lg.transactionHash!,
              logIndex: Number(lg.index),
            },
          },
          create: {
            txHash: lg.transactionHash!,
            logIndex: Number(lg.index),
            blockNumber: BigInt(lg.blockNumber),
            timestamp: await getBlockTs(lg.blockNumber),
            sponsor,
            merchant,
            amount,
          },
          update: {}, // idempotent
        });
      }

      if (ev?.name === "Spend") {
        const merchant = (ev.args.merchant as string).toLowerCase();
        const supplier = (ev.args.supplier as string).toLowerCase();
        const amount = (ev.args.amount as bigint).toString();

        await prisma.voucherSpend.upsert({
          where: {
            txHash_logIndex: {
              txHash: lg.transactionHash!,
              logIndex: Number(lg.index),
            },
          },
          create: {
            txHash: lg.transactionHash!,
            logIndex: Number(lg.index),
            blockNumber: BigInt(lg.blockNumber),
            timestamp: await getBlockTs(lg.blockNumber),
            merchant,
            supplier,
            amount,
          },
          update: {},
        });
      }

      if (ev?.name === "Redeem") {
        const supplier = (ev.args.supplier as string).toLowerCase();
        const gross = (ev.args.gross as bigint).toString();
        const fee = (ev.args.fee as bigint).toString();
        const net = (ev.args.net as bigint).toString();

        await prisma.voucherRedeem.upsert({
          where: {
            txHash_logIndex: {
              txHash: lg.transactionHash!,
              logIndex: Number(lg.index),
            },
          },
          create: {
            txHash: lg.transactionHash!,
            logIndex: Number(lg.index),
            blockNumber: BigInt(lg.blockNumber),
            timestamp: await getBlockTs(lg.blockNumber),
            supplier,
            gross,
            fee,
            net,
          },
          update: {},
        });
      }
    } catch {
      // not our event / parse fail -> ignore
    }
  }
}

/**
 * Full/forward backfill:
 * - If from/to not provided: scan from DEPLOY (or 0) to latest.
 * - Updates voucherIndexState.lastScanned continuously (monotonic increasing).
 */
// voucherIndexer.ts
export async function backfillVouchers(fromBlock?: number, toBlock?: number) {
  const latest = await withBackoff(
    () => provider.getBlockNumber(),
    "getBlockNumber"
  );

  // read cursor
  const state = await prisma.voucherIndexState.findUnique({ where: { id: 1 } });
  const last = state?.lastScanned ? Number(state.lastScanned) : undefined;

  const computedDefaultFrom =
    VOUCHER_DEPLOY_BLOCK > 0
      ? Math.max(VOUCHER_DEPLOY_BLOCK, latest - BACKSCAN_BLOCKS)
      : Math.max(0, latest - BACKSCAN_BLOCKS);

  // prefer explicit param > DB cursor > env default window
  const from =
    fromBlock ??
    (last != null ? Math.min(last + 1, latest) : computedDefaultFrom);

  const to = toBlock ?? latest;

  if (from > to) return; // nothing to do

  let start = from;
  while (start <= to) {
    const end = Math.min(start + LOG_CHUNK_SIZE - 1, to);
    const logs = await withBackoff(
      () =>
        provider.getLogs({
          address: VOUCHER_MODULE,
          fromBlock: start,
          toBlock: end,
          topics: [[topicIssue, topicSpend, topicRedeem]],
        }),
      `voucher getLogs [${start}-${end}]`
    );

    await handleLogs(logs);

    await prisma.voucherIndexState.upsert({
      where: { id: 1 },
      create: { id: 1, lastScanned: BigInt(end) },
      update: { lastScanned: BigInt(end) },
    });

    start = end + 1;
    if (start <= to) await sleep(25);
  }
}

/**
 * Live tail:
 * - Resumes from DB lastScanned (or from deploy-1 if empty) up to the current tip, repeatedly.
 */
export async function liveTailVouchers() {
  // baseline from DB (don’t skip history on restarts)
  const state = await prisma.voucherIndexState.findUnique({ where: { id: 1 } });
  let last =
    state?.lastScanned != null
      ? Number(state.lastScanned)
      : VOUCHER_DEPLOY_BLOCK && VOUCHER_DEPLOY_BLOCK > 0
      ? VOUCHER_DEPLOY_BLOCK - 1
      : -1;

  setInterval(async () => {
    try {
      const latest = await provider.getBlockNumber();
      if (latest <= last) return;

      // catch up forward
      await backfillVouchers(last + 1, latest);
      last = latest;
    } catch (e) {
      console.warn("liveTailVouchers error", e);
    }
  }, THROTTLE_BLOCK_POLL_MS);
}
