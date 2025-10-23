import { FastifyInstance } from 'fastify';
import { prisma } from './db.js';
import { z } from 'zod';
import { provider } from './provider.js';
import { ethers } from 'ethers';
import { mintingHubAbi } from './abis.js';
import { MINTING_HUB } from './env.js';

const hub = new ethers.Contract(MINTING_HUB, mintingHubAbi, provider);

// --- helpers to make JSON safe (no BigInt) ---
const toStr = (v: any) => (typeof v === 'bigint' ? v.toString() : v);
const shapePosition = (row: any) => ({
  id: row.id,
  owner: row.owner,
  original: row.original,
  collateral: row.collateral,
  openedBlock: toStr(row.openedBlock),
  openedTx: row.openedTx,
  openedTs: row.openedTs,
  minted: String(row.minted),
  price: String(row.price),
  reservePPM: row.reservePPM,
  riskPPM: row.riskPPM,
  minColl: String(row.minColl),
  limit: String(row.limit),
  start: row.start,
  cooldown: row.cooldown,
  expiration: row.expiration,
  challenged: String(row.challenged),
  challengePeriod: row.challengePeriod,
  ofdAddr: row.ofdAddr,
  collBal: String(row.collBal),
  collDecimals: row.collDecimals,
  collSymbol: row.collSymbol,
  priceDecimals: row.priceDecimals,
});
const shapeChallenge = (row: any) => ({
  number: row.number,
  positionId: row.positionId,
  challenger: row.challenger,
  start: row.start,
  size: String(row.size),
  currentPrice: String(row.currentPrice),
  status: row.status,
});

export async function registerRoutes(app: FastifyInstance) {
  app.get('/health', async () => ({ ok: true }));

  app.get('/state', async () => {
    const st = await prisma.indexState.findUnique({ where: { id: 1 } });
    return st ? { lastScanned: st.lastScanned.toString() } : { lastScanned: '0' };
  });

  // GET /positions?owner=0x...&limit=100
  app.get('/positions', async (req, res) => {
    const q = z
      .object({
        owner: z.string().optional(),
        limit: z.coerce.number().min(1).max(500).default(100),
      })
      .parse(req.query);

    const where = q.owner ? { owner: q.owner.toLowerCase() } : {};
    const rows = await prisma.position.findMany({
      where,
      orderBy: { openedBlock: 'desc' },
      take: q.limit,
    });
    return rows.map(shapePosition);
  });

  // GET /positions/:id
  app.get('/positions/:id', async (req, res) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const row = await prisma.position.findUnique({ where: { id: id.toLowerCase() } });
    if (!row) return res.status(404).send({ error: 'Not found' });
    return shapePosition(row);
  });

  // GET /positions/:id/challenges
  app.get('/positions/:id/challenges', async (req, res) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const rows = await prisma.challenge.findMany({
      where: { positionId: id.toLowerCase(), status: 'open' },
      orderBy: { start: 'desc' },
    });
    // refresh current prices (cheap) on the fly
    const refreshed = await Promise.all(
      rows.map(async (c) => {
        try {
          const p = await hub.price(c.number);
          return shapeChallenge({ ...c, currentPrice: p });
        } catch {
          return shapeChallenge(c);
        }
      })
    );
    return refreshed;
  });

  // GET /wallets/:addr/pending-returns/:collateral
  app.get('/wallets/:addr/pending-returns/:collateral', async (req, res) => {
    const { addr, collateral } = z.object({ addr: z.string(), collateral: z.string() }).parse(req.params);
    const v = await hub.pendingReturns(collateral, addr);
    return { pending: v.toString() };
  });

  // GET /positions/:id/expired-price
  app.get('/positions/:id/expired-price', async (req, res) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const v = await hub.expiredPurchasePrice(id);
    return { price: v.toString() };
  });
}
