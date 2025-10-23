import { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { ethers } from "ethers";
import crypto from "crypto";
import {
  normalizeAddr,
  setAuthCookie,
  signJwt,
  clearAuthCookie,
} from "../auth.js";

const NONCE_TTL_MS = 1000 * 60 * 10; // 10 min

export async function authRoutes(app: FastifyInstance) {
  // CORS note: ensure server enables credentials and FRONTEND_ORIGIN

  app.get("/auth/nonce", async (req, reply) => {
    const addressRaw = String((req.query as any)?.address || "");
    if (!addressRaw) return reply.code(400).send({ error: "address required" });

    let address: string;
    try {
      address = normalizeAddr(addressRaw);
    } catch {
      return reply.code(400).send({ error: "invalid address" });
    }

    const nonce = crypto.randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + NONCE_TTL_MS);

    await prisma.authNonce.create({
      data: { address, nonce, expiresAt },
    });

    const message = [
      "OFD: Sign to authenticate.",
      `Address: ${address}`,
      `Nonce: ${nonce}`,
      `Expires: ${expiresAt.toISOString()}`,
    ].join("\n");

    return { nonce, message };
  });

  app.post("/auth/verify", async (req, reply) => {
    const { address: addrRaw, signature } = (req.body as any) || {};
    if (!addrRaw || !signature)
      return reply.code(400).send({ error: "missing fields" });

    let address: string;
    try {
      address = normalizeAddr(addrRaw);
    } catch {
      return reply.code(400).send({ error: "invalid address" });
    }

    // find latest un-used nonce
    const last = await prisma.authNonce.findFirst({
      where: { address, used: false },
      orderBy: { id: "desc" },
    });
    if (!last) return reply.code(400).send({ error: "no pending nonce" });
    if (last.expiresAt.getTime() < Date.now()) {
      return reply.code(400).send({ error: "nonce expired" });
    }

    const message = [
      "OFD: Sign to authenticate.",
      `Address: ${address}`,
      `Nonce: ${last.nonce}`,
      `Expires: ${last.expiresAt.toISOString()}`,
    ].join("\n");

    // recover signer
    let recovered: string;
    try {
      recovered = ethers.verifyMessage(message, signature);
    } catch (e) {
      return reply.code(400).send({ error: "bad signature" });
    }

    if (recovered.toLowerCase() !== address) {
      return reply.code(400).send({ error: "address/signature mismatch" });
    }

    // mark nonce used
    await prisma.authNonce.update({
      where: { id: last.id },
      data: { used: true },
    });

    // set cookie
    const token = signJwt(address);
    setAuthCookie(reply, token);

    return { ok: true, address };
  });

  app.post("/auth/logout", async (_req, reply) => {
    clearAuthCookie(reply);
    return { ok: true };
  });
}
