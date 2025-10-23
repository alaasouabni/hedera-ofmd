import { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { requireAuth, normalizeAddr } from "../auth.js";

export async function profileRoutes(app: FastifyInstance) {
  // Public: GET /profiles/:address
  app.get("/profiles/:address", async (req, reply) => {
    let address: string;
    try {
      address = normalizeAddr((req.params as any).address);
    } catch {
      return reply.code(400).send({ error: "invalid address" });
    }
    const profile = await prisma.profile.findUnique({ where: { address } });
    if (!profile) return reply.code(404).send({ error: "not found" });
    return profile;
  });

  // Authenticated: GET /profiles/me
  app.get("/profiles/me", async (req, reply) => {
    const { address } = requireAuth(req);
    const profile = await prisma.profile.findUnique({ where: { address } });
    if (!profile) return reply.code(404).send({ error: "not found" });
    return profile;
  });

  // Authenticated: POST /profiles (create/update)
  app.post("/profiles", async (req, reply) => {
    const { address } = requireAuth(req);

    const body = (req.body as any) || {};
    const data = {
      username: String(body.username || "").trim(),
      displayName: String(body.displayName || "").trim() || null,
      bio: String(body.bio || "").trim() || null,
      avatarUrl: String(body.avatarUrl || "").trim() || null,
    };

    if (!/^[a-z0-9_]{3,32}$/i.test(data.username)) {
      return reply
        .code(400)
        .send({ error: "username must be 3-32 chars, letters/digits/_ only" });
    }

    try {
      const up = await prisma.profile.upsert({
        where: { address },
        create: { address, ...data },
        update: { ...data },
      });
      return up;
    } catch (e: any) {
      // handle unique username clash
      const msg = String(e?.message ?? "");
      if (
        msg.includes("Unique constraint failed") ||
        msg.includes("Unique constraint")
      ) {
        return reply.code(409).send({ error: "username already taken" });
      }
      throw e;
    }
  });
}
