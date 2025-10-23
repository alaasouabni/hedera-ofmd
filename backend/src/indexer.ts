// src/indexer.ts
import { ethers, Log } from "ethers";
import { prisma } from "./db.js";
import { provider } from "./provider.js";
import { mintingHubAbi, positionAbi, erc20Abi } from "./abis.js";
import { getLogsSmart } from "./getLogsSmart.js";
import {
  BACKSCAN_BLOCKS, // still available if you want a cap
  LOG_CHUNK_SIZE,
  DETAILS_BATCH_DELAY_MS,
  THROTTLE_BLOCK_POLL_MS,
  MINTING_HUB,
  DEPLOY_BLOCK,
} from "./env.js";
import { sleep, withBackoff } from "./backoff.js";

const hub = new ethers.Contract(MINTING_HUB, mintingHubAbi, provider);
const ifaceHub = new ethers.Interface(mintingHubAbi);
const ifacePos = new ethers.Interface(positionAbi);

const topicPositionOpened = ethers.id(
  "PositionOpened(address,address,address,address)"
);
const topicChallengeStarted = ethers.id(
  "ChallengeStarted(address,address,uint256,uint256)"
);
const topicChallengeAverted = ethers.id(
  "ChallengeAverted(address,uint256,uint256)"
);
const topicChallengeSucceeded = ethers.id(
  "ChallengeSucceeded(address,uint256,uint256,uint256,uint256)"
);

export const ZERO = ethers.ZeroAddress;
export const isZero = (a?: string) => !a || a.toLowerCase() === ZERO;

/** returns true if there is code at address */
export async function hasCode(p: ethers.Provider, addr: string) {
  if (isZero(addr)) return false;
  const code = await p.getCode(addr);
  return !!code && code !== "0x";
}

const toTopicAddress = (addr: string) =>
  ethers.zeroPadValue(ethers.getAddress(addr), 32);

const blockTsCache = new Map<number, number>();
async function getBlockTs(bn: number) {
  if (blockTsCache.has(bn)) return blockTsCache.get(bn)!;
  const block = await withBackoff(() => provider.getBlock(bn), "getBlock");
  const ts = Number(block?.timestamp ?? 0);
  blockTsCache.set(bn, ts);
  return ts;
}

type PositionOpenedEvt = {
  owner: string;
  position: string;
  original: string;
  collateral: string;
};

async function fetchDetails(posAddr: string, collateralAddr: string) {
  const pos = new ethers.Contract(posAddr, positionAbi, provider);
  const token = new ethers.Contract(collateralAddr, erc20Abi, provider);
  const [
    minted,
    price,
    reservePPM,
    riskPPM,
    minColl,
    limit,
    start,
    cooldown,
    expiration,
    challenged,
    chPeriod,
    collBal,
    collDecimals,
    collSymbol,
    ofdAddr,
  ] = await Promise.all([
    withBackoff(() => pos.minted(), "pos.minted"),
    withBackoff(() => pos.price(), "pos.price"),
    withBackoff(() => pos.reserveContribution(), "pos.reserveContribution"),
    withBackoff(() => pos.riskPremiumPPM(), "pos.riskPremiumPPM"),
    withBackoff(() => pos.minimumCollateral(), "pos.minimumCollateral"),
    withBackoff(() => pos.limit(), "pos.limit"),
    withBackoff(() => pos.start(), "pos.start"),
    withBackoff(() => pos.cooldown(), "pos.cooldown"),
    withBackoff(() => pos.expiration(), "pos.expiration"),
    withBackoff(() => pos.challengedAmount(), "pos.challengedAmount"),
    withBackoff(() => pos.challengePeriod(), "pos.challengePeriod"),
    withBackoff(() => token.balanceOf(posAddr), "token.balanceOf"),
    withBackoff(() => token.decimals(), "token.decimals"),
    withBackoff(() => token.symbol().catch(() => "COLL"), "token.symbol"),
    withBackoff(() => pos.ofd(), "pos.ofd"),
  ]);

  const priceDecimals = 36 - Number(collDecimals);
  return {
    minted,
    price,
    reservePPM: Number(reservePPM),
    riskPPM: Number(riskPPM),
    minColl,
    limit,
    start: Number(start),
    cooldown: Number(cooldown),
    expiration: Number(expiration),
    challenged,
    challengePeriod: Number(chPeriod),
    collBal,
    collDecimals: Number(collDecimals),
    collSymbol,
    priceDecimals,
    ofdAddr,
  };
}

async function upsertPositionFromLog(lg: Log) {
  const parsed = ifaceHub.parseLog(lg);
  const { owner, position, original, collateral } =
    parsed?.args as unknown as PositionOpenedEvt;
  const ts = await getBlockTs(lg.blockNumber);
  const d = await fetchDetails(position, collateral);

  await prisma.position.upsert({
    where: { id: position.toLowerCase() },
    create: {
      id: position.toLowerCase(),
      owner: owner.toLowerCase(),
      original: String(original).toLowerCase(),
      collateral: collateral.toLowerCase(),
      openedBlock: BigInt(lg.blockNumber),
      openedTx: lg.transactionHash ?? "0x",
      openedTs: ts,
      minted: d.minted.toString(),
      price: d.price.toString(),
      reservePPM: d.reservePPM,
      riskPPM: d.riskPPM,
      minColl: d.minColl.toString(),
      limit: d.limit.toString(),
      start: d.start,
      cooldown: d.cooldown,
      expiration: d.expiration,
      challenged: d.challenged.toString(),
      challengePeriod: d.challengePeriod,
      ofdAddr: d.ofdAddr.toLowerCase(),
      collBal: d.collBal.toString(),
      collDecimals: d.collDecimals,
      collSymbol: d.collSymbol,
      priceDecimals: d.priceDecimals,
    },
    update: {
      owner: owner.toLowerCase(),
      original: String(original).toLowerCase(),
      collateral: collateral.toLowerCase(),
      minted: d.minted.toString(),
      price: d.price.toString(),
      reservePPM: d.reservePPM,
      riskPPM: d.riskPPM,
      minColl: d.minColl.toString(),
      limit: d.limit.toString(),
      start: d.start,
      cooldown: d.cooldown,
      expiration: d.expiration,
      challenged: d.challenged.toString(),
      challengePeriod: d.challengePeriod,
      ofdAddr: d.ofdAddr.toLowerCase(),
      collBal: d.collBal.toString(),
      collDecimals: d.collDecimals,
      collSymbol: d.collSymbol,
      priceDecimals: d.priceDecimals,
    },
  });
}

/** Ensure a Position row exists; skip zero/EOA. */
async function ensurePositionExists(positionAddr: string) {
  const id = positionAddr?.toLowerCase();
  if (!id || isZero(id)) return null;

  const found = await prisma.position.findUnique({ where: { id } });
  if (found) return found;

  if (!(await hasCode(provider, positionAddr))) {
    console.warn("skip ensurePositionExists: no code at address", {
      positionAddr,
    });
    return null;
  }

  // Try to reconstruct from the PositionOpened event (canonical)
  const latest = await withBackoff(
    () => provider.getBlockNumber(),
    "getBlockNumber"
  );
  const from = DEPLOY_BLOCK > 0 ? DEPLOY_BLOCK : 0;
  const to = latest;

  for (let start = from; start <= to; start += LOG_CHUNK_SIZE) {
    const end = Math.min(start + LOG_CHUNK_SIZE - 1, to);
    const logs = await withBackoff(
      () =>
        provider.getLogs({
          address: MINTING_HUB,
          fromBlock: start,
          toBlock: end,
          topics: [topicPositionOpened, null, toTopicAddress(positionAddr)],
        }),
      `getLogs ensurePosition [${start}-${end}]`
    );
    for (const lg of logs) {
      try {
        await upsertPositionFromLog(lg);
        return await prisma.position.findUnique({ where: { id } });
      } catch {}
    }
    if (start + LOG_CHUNK_SIZE <= to) await sleep(15);
  }

  // Fallback: direct reads — only if contract code is present (already checked)
  try {
    const pos = new ethers.Contract(positionAddr, positionAbi, provider);
    const collateral: string = await withBackoff(
      () => pos.collateral(),
      "pos.collateral"
    );
    const owner: string = await withBackoff(
      () => pos.owner().catch(() => ethers.ZeroAddress),
      "pos.owner"
    );
    const d = await fetchDetails(positionAddr, collateral);
    return await prisma.position.create({
      data: {
        id,
        owner: owner.toLowerCase(),
        original: id,
        collateral: collateral.toLowerCase(),
        openedBlock: BigInt(0),
        openedTx: "0x",
        openedTs: 0,
        minted: d.minted.toString(),
        price: d.price.toString(),
        reservePPM: d.reservePPM,
        riskPPM: d.riskPPM,
        minColl: d.minColl.toString(),
        limit: d.limit.toString(),
        start: d.start,
        cooldown: d.cooldown,
        expiration: d.expiration,
        challenged: d.challenged.toString(),
        challengePeriod: d.challengePeriod,
        ofdAddr: d.ofdAddr.toLowerCase(),
        collBal: d.collBal.toString(),
        collDecimals: d.collDecimals,
        collSymbol: d.collSymbol,
        priceDecimals: d.priceDecimals,
      },
    });
  } catch (e) {
    console.warn("ensurePositionExists fallback failed for", positionAddr, e);
    // Minimal stub to satisfy FK; details can be refreshed later
    return await prisma.position.create({
      data: {
        id,
        owner: ethers.ZeroAddress,
        original: id,
        collateral: ethers.ZeroAddress,
        openedBlock: BigInt(0),
        openedTx: "0x",
        openedTs: 0,
        minted: "0",
        price: "0",
        reservePPM: 0,
        riskPPM: 0,
        minColl: "0",
        limit: "0",
        start: 0,
        cooldown: 0,
        expiration: 0,
        challenged: "0",
        challengePeriod: 0,
        ofdAddr: ethers.ZeroAddress,
        collBal: "0",
        collDecimals: 18,
        collSymbol: "COLL",
        priceDecimals: 18,
      },
    });
  }
}

/** choose the starting block: state.lastScanned+1, else DEPLOY_BLOCK, else 0 */
async function pickStartBlock(explicitFrom?: number) {
  if (typeof explicitFrom === "number") return explicitFrom;
  const state = await prisma.indexState
    .findUnique({ where: { id: 1 } })
    .catch(() => null);
  if (state?.lastScanned != null) {
    const v =
      typeof state.lastScanned === "bigint"
        ? Number(state.lastScanned)
        : Number(state.lastScanned);
    if (Number.isFinite(v)) return v + 1;
  }
  if (DEPLOY_BLOCK && DEPLOY_BLOCK > 0) return DEPLOY_BLOCK;
  return 0;
}

export async function backfill(fromBlock?: number, toBlock?: number) {
  const latest = await withBackoff(
    () => provider.getBlockNumber(),
    "getBlockNumber"
  );
  const from = await pickStartBlock(fromBlock);
  const to = toBlock ?? latest;

  let start = Math.min(from, to);
  while (start <= to) {
    const end = Math.min(start + LOG_CHUNK_SIZE - 1, to);

    // 1) index PositionOpened
    const logs = await withBackoff(
      () =>
        getLogsSmart({
          address: MINTING_HUB,
          fromBlock: start,
          toBlock: end,
          topics: [topicPositionOpened],
          label: "PositionOpened",
        }),
      `getLogs PositionOpened [${start}-${end}]`
    );
    for (const lg of logs) {
      try {
        await upsertPositionFromLog(lg);
      } catch (e) {
        console.error("upsertPositionFromLog", e);
      }
    }

    // 2) ChallengeStarted → ensure position, upsert open
    const chStartLogs = await withBackoff(
      () =>
        getLogsSmart({
          address: MINTING_HUB,
          fromBlock: start,
          toBlock: end,
          topics: [topicChallengeStarted],
          label: "ChallengeStarted",
        }),
      `getLogs ChallengeStarted [${start}-${end}]`
    );
    for (const lg of chStartLogs) {
      try {
        const parsed = ifaceHub.parseLog(lg);
        const num = Number(parsed?.args?.number);
        const position = String(parsed?.args?.position || "").toLowerCase();
        if (isZero(position)) continue; // guard
        await ensurePositionExists(position); // safe (hasCode inside)

        const [challenger, chStart, posFromState, size] = await withBackoff(
          () => hub.challenges(num),
          `hub.challenges(${num})`
        );

        // extra safety: if storage says different position, trust indexed event
        if (isZero(String(posFromState))) {
          // ok
        }

        const currentPrice = await withBackoff(
          () => hub.price(num),
          `hub.price(${num})`
        );

        await prisma.challenge.upsert({
          where: { number_positionId: { number: num, positionId: position } },
          create: {
            number: num,
            positionId: position,
            challenger: String(challenger).toLowerCase(),
            start: Number(chStart),
            size: String(size),
            currentPrice: String(currentPrice),
            status: "open",
          },
          update: {
            challenger: String(challenger).toLowerCase(),
            start: Number(chStart),
            size: String(size),
            currentPrice: String(currentPrice),
            status: "open",
          },
        });
      } catch (e) {
        console.warn("challenge upsert error", e);
      }
    }

    // 3) Averted/Succeeded → update size / possibly close
    const otherLogs = await withBackoff(
      () =>
        provider.getLogs({
          address: MINTING_HUB,
          fromBlock: start,
          toBlock: end,
          topics: [[topicChallengeAverted, topicChallengeSucceeded]],
        }),
      `getLogs Averted|Succeeded [${start}-${end}]`
    );
    for (const lg of otherLogs) {
      try {
        const ev = ifaceHub.parseLog(lg);
        const num = Number(ev?.args?.number);
        const positionIndexed: string | undefined = ev?.args?.position
          ? String(ev.args.position).toLowerCase()
          : undefined;

        const [challenger, chStart, posFromState, size] = await withBackoff(
          () => hub.challenges(num),
          `hub.challenges(${num})`
        );

        // Prefer the indexed event position; fall back to storage if missing
        let position =
          positionIndexed || String(posFromState || "").toLowerCase();

        if (BigInt(size) === 0n) {
          if (position && !isZero(position)) {
            await prisma.challenge.upsert({
              where: {
                number_positionId: { number: num, positionId: position },
              },
              create: {
                number: num,
                positionId: position,
                challenger: String(challenger).toLowerCase(),
                start: Number(chStart),
                size: "0",
                currentPrice: "0",
                status: "closed",
              },
              update: { size: "0", currentPrice: "0", status: "closed" },
            });
          } else {
            // If we cannot recover the position address (deleted in storage), close by number
            await prisma.challenge.updateMany({
              where: { number: num, status: "open" },
              data: { size: "0", currentPrice: "0", status: "closed" },
            });
          }
          continue;
        }

        // Still open; update with price/size
        const currentPrice = await withBackoff(
          () => hub.price(num),
          `hub.price(${num})`
        );

        if (position && !isZero(position)) {
          await ensurePositionExists(position); // guard; no-op if exists / zero
          await prisma.challenge.upsert({
            where: { number_positionId: { number: num, positionId: position } },
            create: {
              number: num,
              positionId: position,
              challenger: String(challenger).toLowerCase(),
              start: Number(chStart),
              size: String(size),
              currentPrice: String(currentPrice),
              status: "open",
            },
            update: {
              size: String(size),
              currentPrice: String(currentPrice),
              status: "open",
            },
          });
        } else {
          // No position address we can trust → skip write ( nothing to key on )
          console.warn("challenge lifecycle: missing position for number", num);
        }
      } catch (e) {
        console.warn("challenge lifecycle update error", e);
      }
    }

    // persist scan height
    await prisma.indexState.upsert({
      where: { id: 1 },
      create: { id: 1, lastScanned: BigInt(end) },
      update: { lastScanned: BigInt(end) },
    });

    start = end + 1;
    if (start <= to) await sleep(25);
  }
}

export async function refreshAllDetails() {
  const positions = await prisma.position.findMany({
    select: { id: true, collateral: true },
  });
  for (const p of positions) {
    try {
      if (isZero(p.id) || !(await hasCode(provider, p.id))) continue;
      const d = await fetchDetails(p.id, p.collateral);
      await prisma.position.update({
        where: { id: p.id },
        data: {
          minted: d.minted.toString(),
          price: d.price.toString(),
          reservePPM: d.reservePPM,
          riskPPM: d.riskPPM,
          minColl: d.minColl.toString(),
          limit: d.limit.toString(),
          start: d.start,
          cooldown: d.cooldown,
          expiration: d.expiration,
          challenged: d.challenged.toString(),
          challengePeriod: d.challengePeriod,
          ofdAddr: d.ofdAddr.toLowerCase(),
          collBal: d.collBal.toString(),
          collDecimals: d.collDecimals,
          collSymbol: d.collSymbol,
          priceDecimals: d.priceDecimals,
        },
      });
    } catch (e) {
      console.warn("refresh details error", e);
    }
    await sleep(DETAILS_BATCH_DELAY_MS);
  }
}

export async function liveTail() {
  // resume from persisted height if available; otherwise from current chain head
  const state = await prisma.indexState
    .findUnique({ where: { id: 1 } })
    .catch(() => null);
  let last =
    state?.lastScanned != null
      ? Number(state.lastScanned)
      : await provider.getBlockNumber();

  setInterval(async () => {
    try {
      const latest = await provider.getBlockNumber();
      if (latest <= last) return;
      await backfill(last + 1, latest);
      last = latest;
    } catch (e) {
      console.warn("liveTail error", e);
    }
  }, THROTTLE_BLOCK_POLL_MS);
}
