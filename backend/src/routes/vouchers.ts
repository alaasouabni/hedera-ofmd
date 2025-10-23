// routes/vouchers.ts
import { FastifyInstance } from "fastify";
import { prisma } from "../db.js";

export async function vouchersRoutes(fastify: FastifyInstance) {
  // indexer state
  fastify.get("/vouchers/state", async () => {
    const st = await prisma.voucherIndexState.findUnique({ where: { id: 1 } });
    return { lastScanned: st?.lastScanned?.toString() ?? "0" };
  });

  // dashboard aggregate (server-side, off-chain)
  fastify.get<{
    Querystring: { address: string };
  }>("/vouchers/dashboard", async (req, reply) => {
    const address = String(req.query.address || "").toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(address)) {
      reply.code(400);
      return { error: "Invalid address" };
    }

    // ============ Sponsor cards: sum Issue by merchant where sponsor = me ============
    const issuesISponsor = await prisma.voucherIssue.findMany({
      where: { sponsor: address },
      select: { merchant: true, amount: true },
    });

    const byMerchant = new Map<string, bigint>();
    for (const i of issuesISponsor) {
      const amt = BigInt(i.amount);
      byMerchant.set(i.merchant, (byMerchant.get(i.merchant) || 0n) + amt);
    }

    const sponsorCards = [...byMerchant.entries()].map(([merchant, sum]) => ({
      merchant,
      issuedHOFD: sum.toString(), // 18d (client formats nicely)
      // removed: merchantSpentHOFD / supplierRedeemedHOFD
    }));

    // ============ Merchant aggregates (me = merchant) ============
    // Spent, Top suppliers
    const spendsAsMerchant = await prisma.voucherSpend.findMany({
      where: { merchant: address },
      select: { supplier: true, amount: true },
    });

    let spentTotalAsMerchant = 0n;
    const bySupplier = new Map<string, bigint>();
    for (const s of spendsAsMerchant) {
      const a = BigInt(s.amount);
      spentTotalAsMerchant += a;
      bySupplier.set(s.supplier, (bySupplier.get(s.supplier) || 0n) + a);
    }

    const topSuppliers = [...bySupplier.entries()]
      .sort((a, b) => Number(b[1] - a[1]))
      .slice(0, 20)
      .map(([supplier, amount]) => ({
        supplier,
        amountHOFD: amount.toString(),
      }));

    // NEW: who issued to me? (group Issue where merchant = me by sponsor)
    const issuesToMe = await prisma.voucherIssue.findMany({
      where: { merchant: address },
      select: { sponsor: true, amount: true },
    });
    const bySponsor = new Map<string, bigint>();
    for (const it of issuesToMe) {
      const a = BigInt(it.amount);
      bySponsor.set(it.sponsor, (bySponsor.get(it.sponsor) || 0n) + a);
    }
    const issuers = [...bySponsor.entries()]
      .sort((a, b) => Number(b[1] - a[1]))
      .slice(0, 20)
      .map(([sponsor, amt]) => ({
        sponsor,
        issuedHOFD: amt.toString(), // 18d
      }));

    const merchant = {
      // leave balances null; client fills from Mirror Node (keeps your existing UX)
      unspentVOFD: null,
      spentHOFD: spentTotalAsMerchant.toString(),
      topSuppliers,
      issuers, // NEW
    };

    // ============ Supplier aggregates (me = supplier) ============
    const redeems = await prisma.voucherRedeem.findMany({
      where: { supplier: address },
      select: { net: true },
    });
    let claimed = 0n;
    for (const r of redeems) claimed += BigInt(r.net);

    const recentMerchantsRaw = await prisma.voucherSpend.findMany({
      where: { supplier: address },
      orderBy: [{ blockNumber: "desc" }, { logIndex: "desc" }],
      take: 8,
      select: { merchant: true, amount: true },
    });

    const supplier = {
      unclaimedVOFD: null,
      claimedHOFD: claimed.toString(),
      recentMerchants: recentMerchantsRaw.map((r) => ({
        merchant: r.merchant,
        amountHOFD: r.amount,
      })),
    };

    return { sponsor: { cards: sponsorCards }, merchant, supplier };
  });
}
