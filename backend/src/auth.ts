import jwt from "jsonwebtoken";
import { FastifyRequest, FastifyReply } from "fastify";
import { ethers } from "ethers";

const JWT_COOKIE = "ofdauth";
const MAX_AGE_SEC = 60 * 60 * 24 * 7; // 7 days

export function signJwt(address: string) {
  const payload = { address };
  return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: MAX_AGE_SEC });
}

export function setAuthCookie(reply: FastifyReply, token: string) {
  reply.setCookie(JWT_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: MAX_AGE_SEC,
    path: "/",
  });
}

export function clearAuthCookie(reply: FastifyReply) {
  reply.clearCookie(JWT_COOKIE, { path: "/" });
}

export type Authed = { address: string };

export function requireAuth(req: FastifyRequest): Authed {
  const token = (req.cookies?.[JWT_COOKIE] as string | undefined) ?? "";
  if (!token) throw new Error("Not authenticated");
  try {
    const dec = jwt.verify(token, process.env.JWT_SECRET!) as {
      address: string;
    };
    return { address: dec.address.toLowerCase() };
  } catch {
    throw new Error("Invalid session");
  }
}

export function normalizeAddr(a: string) {
  return ethers.getAddress(a).toLowerCase();
}
