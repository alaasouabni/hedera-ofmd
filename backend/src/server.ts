// src/server.ts (or index.ts)
import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";

import { HOST, PORT } from "./env.js";
import { registerRoutes } from "./routes.js";
import { authRoutes } from "./routes/auth.js";
import { profileRoutes } from "./routes/profiles.js";
import { vouchersRoutes } from "./routes/vouchers.js";

import { backfill, liveTail, refreshAllDetails } from "./indexer.js";
import { backfillVouchers, liveTailVouchers } from "./voucherIndexer.js";

async function start() {
  const app = Fastify({ logger: { transport: { target: "pino-pretty" } } });

  // Plugins
  await app.register(cookie);
  await app.register(cors, {
    origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173",
    credentials: true,
  });

  // Routes
  await registerRoutes(app);
  await app.register(authRoutes);
  await app.register(profileRoutes);
  await app.register(vouchersRoutes);

  // Manage timers
  let detailsTimer: NodeJS.Timeout | null = null;
  app.addHook("onClose", async () => {
    if (detailsTimer) clearInterval(detailsTimer);
  });

  // Start HTTP server FIRST (don’t block on indexing)
  await app.listen({ host: HOST, port: PORT });
  app.log.info(`API listening on http://${HOST}:${PORT}`);

  // ── Background tasks (sequenced per indexer) ──────────────────────────────
  // Positions indexer: backfill → then live tail
  void (async () => {
    try {
      await backfill(); // your positions backfill (deploy → latest)
      app.log.info("Positions backfill complete.");
    } catch (e) {
      app.log.warn({ err: e }, "Positions backfill failed");
    }
    // live tail regardless of backfill outcome
    try {
      await liveTail(); // if liveTail is non-async, just call liveTail();
    } catch (e) {
      app.log.warn({ err: e }, "Positions live tail failed to start");
    }
  })();

  // Voucher indexer: backfill → then live tail (prevents overlap & gaps)
  void (async () => {
    try {
      await backfillVouchers(); // defaults to DEPLOY → latest
      app.log.info("Vouchers backfill complete.");
    } catch (e) {
      app.log.warn({ err: e }, "Vouchers backfill failed");
    }
    try {
      await liveTailVouchers(); // resumes from DB lastScanned
    } catch (e) {
      app.log.warn({ err: e }, "Vouchers live tail failed to start");
    }
  })();

  // Periodic details refresh
  detailsTimer = setInterval(() => {
    refreshAllDetails().catch((e) =>
      app.log.warn({ err: e }, "refreshAllDetails failed")
    );
  }, 120_000);
}

// Bootstrap
start().catch((err) => {
  console.error(err);
  process.exit(1);
});
