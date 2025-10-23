// src/lib/api.ts
const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

async function j<T>(p: Promise<Response>): Promise<T> {
  const r = await p;
  const txt = await r.text();
  if (!r.ok) {
    // surface backend errors nicely
    throw new Error(txt || r.statusText);
  }
  // parse as JSON (no reviver), then downstream normalizers coerce fields
  return JSON.parse(txt);
}

/** expand scientific-notation strings (integers only) into plain decimal */
const expandExpInt = (raw: string): string => {
  let s = raw.trim();
  const neg = s.startsWith("-");
  if (neg || s.startsWith("+")) s = s.slice(1);

  // Fast path: already a plain integer
  if (/^\d+$/.test(s)) return neg ? `-${s}` : s;

  // General: a[.b]e±k
  const m = s.match(/^(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/);
  if (!m) throw new Error(`Not an integer in scientific notation: "${raw}"`);
  const [, intPart, fracPart = "", expStr] = m;
  const exp = parseInt(expStr, 10);

  if (exp >= 0) {
    // Move decimal point to the right by exp
    if (fracPart.length <= exp) {
      // purely integer after shift → append zeros
      const digits = intPart + fracPart + "0".repeat(exp - fracPart.length);
      return neg ? `-${digits}` : digits;
    } else {
      // fractional remainder would remain → only acceptable if it's all zeros
      const moved = intPart + fracPart.slice(0, exp);
      const rest = fracPart.slice(exp);
      if (!/^0+$/.test(rest)) {
        throw new Error(
          `Expected integer but got fractional scientific string: "${raw}"`
        );
      }
      return neg ? `-${moved || "0"}` : moved || "0";
    }
  } else {
    // exp < 0 → decimal point moves left → integer only if all shifted-out digits are zeros
    const k = -exp;
    if (/^0+$/.test(intPart.slice(intPart.length - k))) {
      const kept = intPart.slice(0, Math.max(0, intPart.length - k)) || "0";
      // any fracPart makes it fractional unless it’s all zeros
      if (fracPart && !/^0+$/.test(fracPart)) {
        throw new Error(
          `Expected integer but got fractional scientific string: "${raw}"`
        );
      }
      return neg ? `-${kept}` : kept;
    }
    throw new Error(
      `Expected integer but got fractional scientific string: "${raw}"`
    );
  }
};

/** convert only from bigint|string; never from number (prevents 1e+31 bugs) */
export const asBig = (v: unknown): bigint => {
  if (typeof v === "bigint") return v;
  if (typeof v === "string") {
    const s = v.trim();
    if (/^[+-]?\d+$/.test(s)) return BigInt(s);
    if (/[eE]/.test(s)) return BigInt(expandExpInt(s));
    // fallthrough: not a plain integer
    throw new Error(`Expected integer string; got "${v}"`);
  }
  // If you hit this, something converted a big value to a JS number earlier.
  throw new Error(
    "Expected bigint string from API; got a number. Clear caches and ensure API returns strings."
  );
};

// ---------- DTOs ----------

export type PositionItem = {
  id: string;
  owner: string;
  original: string;
  collateral: string;
  openedBlock: string; // bigint-as-string
  openedTx: string;
  openedTs: number; // unix seconds are safe as number
  minted: string; // bigint-as-string
  price: string; // bigint-as-string
  reservePPM: number;
  riskPPM: number;
  minColl: string; // bigint-as-string
  limit: string; // bigint-as-string
  start: number;
  cooldown: number;
  expiration: number;
  challenged: string; // bigint-as-string
  challengePeriod: number;
  ofdAddr: string;
  collBal: string; // bigint-as-string
  collDecimals: number;
  collSymbol: string;
  priceDecimals: number;
};

export type Challenge = {
  number: number;
  positionId: string;
  challenger: string;
  start: number;
  size: string; // bigint-as-string
  currentPrice: string; // bigint-as-string
  status: "open" | "closed";
};

// ---------- Normalizers (force any accidental numbers → strings) ----------

const normalizePosition = (p: any): PositionItem => ({
  id: String(p.id),
  owner: String(p.owner),
  original: String(p.original ?? p.id),
  collateral: String(p.collateral),
  openedBlock: String(p.openedBlock),
  openedTx: String(p.openedTx ?? "0x"),
  openedTs: Number(p.openedTs ?? 0),
  minted: String(p.minted ?? "0"),
  price: String(p.price ?? "0"),
  reservePPM: Number(p.reservePPM ?? 0),
  riskPPM: Number(p.riskPPM ?? 0),
  minColl: String(p.minColl ?? "0"),
  limit: String(p.limit ?? "0"),
  start: Number(p.start ?? 0),
  cooldown: Number(p.cooldown ?? 0),
  expiration: Number(p.expiration ?? 0),
  challenged: String(p.challenged ?? "0"),
  challengePeriod: Number(p.challengePeriod ?? 0),
  ofdAddr: String(p.ofdAddr ?? "0x0000000000000000000000000000000000000000"),
  collBal: String(p.collBal ?? "0"),
  collDecimals: Number(p.collDecimals ?? 18),
  collSymbol: String(p.collSymbol ?? "COLL"),
  priceDecimals: Number(p.priceDecimals ?? 18),
});

const normalizeChallenge = (c: any): Challenge => ({
  number: Number(c.number),
  positionId: String(c.positionId),
  challenger: String(c.challenger),
  start: Number(c.start ?? 0),
  size: String(c.size ?? "0"),
  currentPrice: String(c.currentPrice ?? "0"),
  status: c.status === "closed" ? "closed" : "open",
});

// ---------- API ----------

export const api = {
  positions: async (owner?: string) => {
    const url = owner
      ? `${API_BASE}/positions?owner=${owner}`
      : `${API_BASE}/positions`;
    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json();
    return (data as any[]).map(normalizePosition);
  },

  position: async (id: string): Promise<PositionItem> => {
    const data = await j<any>(
      fetch(`${API_BASE}/positions/${id}`, { cache: "no-store" })
    );
    return normalizePosition(data);
  },

  challenges: async (id: string): Promise<Challenge[]> => {
    const data = await j<any[]>(
      fetch(`${API_BASE}/positions/${id}/challenges`, { cache: "no-store" })
    );
    return data.map(normalizeChallenge);
  },

  pendingReturns: async (
    addr: string,
    collateral: string
  ): Promise<{ pending: string }> => {
    const data = await j<{ pending: string }>(
      fetch(`${API_BASE}/wallets/${addr}/pending-returns/${collateral}`, {
        cache: "no-store",
      })
    );
    // coerce just in case
    return { pending: String((data as any)?.pending ?? "0") };
  },

  expiredPrice: async (id: string): Promise<{ price: string }> => {
    const data = await j<{ price: string }>(
      fetch(`${API_BASE}/positions/${id}/expired-price`, { cache: "no-store" })
    );
    return { price: String((data as any)?.price ?? "0") };
  },

  state: async (): Promise<{ lastScanned: string }> => {
    const data = await j<{ lastScanned: string }>(
      fetch(`${API_BASE}/state`, { cache: "no-store" })
    );
    return { lastScanned: String((data as any)?.lastScanned ?? "0") };
  },
};

export type Profile = {
  address: string;
  username: string;
  displayName?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  createdAt: string;
  updatedAt: string;
};

export const profileApi = {
  // Auth
  nonce: (address: string) =>
    j<{ nonce: string; message: string }>(
      fetch(`${API_BASE}/auth/nonce?address=${address}`, {
        credentials: "include",
      })
    ),
  verify: (address: string, signature: string) =>
    j<{ ok: true; address: string }>(
      fetch(`${API_BASE}/auth/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ address, signature }),
      })
    ),
  logout: () =>
    j<{ ok: true }>(
      fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        credentials: "include",
      })
    ),

  // Profiles
  get: (address: string) =>
    j<Profile>(
      fetch(`${API_BASE}/profiles/${address}`, { credentials: "include" })
    ),
  me: () =>
    j<Profile>(fetch(`${API_BASE}/profiles/me`, { credentials: "include" })),
  upsert: (p: {
    username: string;
    displayName?: string;
    bio?: string;
    avatarUrl?: string;
  }) =>
    j<Profile>(
      fetch(`${API_BASE}/profiles`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(p),
      })
    ),
};
