// components/positions/PositionsListCard.tsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { useWallet } from "../wallet/WalletProvider";
import { Card, CardHeader, CardTitle, CardContent } from "../ui/Card";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { AddressPill } from "../ui/AddressPill";
import { List, RefreshCw, ChevronLeft } from "lucide-react";
import { ethers } from "ethers";
import type { Log } from "ethers";

const MINTING_HUB = import.meta.env.VITE_MINTING_HUB as string;
const RPC = import.meta.env.VITE_EVM_RPC as string;
const EXPLORER_TX = import.meta.env.VITE_EXPLORER_TX as string | undefined;

const DEPLOY_BLOCK = Number(import.meta.env.VITE_MINTING_HUB_DEPLOY_BLOCK || 0);

// tunables (reuse your working values)
const DEFAULT_BACKSCAN = Number(
  import.meta.env.VITE_BACKSCAN_BLOCKS || 250_000
);
const CHUNK_SIZE = Number(import.meta.env.VITE_LOG_CHUNK_SIZE || 2_000);
const RATE_LIMIT_DELAY_MS = Number(
  import.meta.env.VITE_RATE_LIMIT_DELAY_MS || 250
);
const MAX_RETRIES = Number(import.meta.env.VITE_MAX_RETRIES || 5);
const THROTTLE_BLOCK_POLL_MS = Number(
  import.meta.env.VITE_THROTTLE_BLOCK_POLL_MS || 4000
);
const DETAILS_BATCH_DELAY_MS = Number(
  import.meta.env.VITE_DETAILS_BATCH_DELAY_MS || 50
);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function withBackoff<T>(fn: () => Promise<T>, label = "rpc"): Promise<T> {
  let delay = RATE_LIMIT_DELAY_MS;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      const code = e?.status ?? e?.code;
      const is429 = code === 429 || /429|rate|limit/i.test(msg);
      if (!is429 || attempt === MAX_RETRIES) throw e;
      await sleep(delay + Math.floor(Math.random() * delay));
      delay *= 2;
    }
  }
  throw new Error(`${label} backoff failed`);
}

// ── ABIs ──────────────────────────────────────────────────────────────────────
const mintingHubAbi = [
  "event PositionOpened(address indexed owner, address indexed position, address original, address collateral)",
];

const positionAbi = [
  // views
  "function expiration() view returns (uint40)",
  "function cooldown() view returns (uint40)",
  "function challengedAmount() view returns (uint256)",
  "function challengePeriod() view returns (uint40)",
  "function start() view returns (uint40)",
  "function price() view returns (uint256)",
  "function minted() view returns (uint256)",
  "function limit() view returns (uint256)",
  "function reserveContribution() view returns (uint24)",
  "function riskPremiumPPM() view returns (uint24)",
  "function minimumCollateral() view returns (uint256)",
  "function ofd() view returns (address)",
  "function collateral() view returns (address)",
];

const erc20Abi = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
];

// ── Types ─────────────────────────────────────────────────────────────────────
type PositionItem = {
  owner: string;
  position: string;
  original: string;
  collateral: string;
  blockNumber: bigint;
  txHash: string;
  timestamp?: number;
};

type PosDetails = {
  minted: bigint;
  price: bigint;
  reservePPM: number;
  riskPPM: number;
  minColl: bigint;
  limit: bigint;
  start: number;
  cooldown: number;
  expiration: number;
  challenged: bigint;
  challengePeriod: number;
  collBal: bigint;
  collDecimals: number;
  collSymbol: string;
  priceDecimals: number; // 36 - collDecimals
  ofdAddr: string;
};

// ── Utils ─────────────────────────────────────────────────────────────────────
const topicPositionOpened = ethers.id(
  "PositionOpened(address,address,address,address)"
);
const toTopicAddress = (addr: string) =>
  ethers.zeroPadValue(ethers.getAddress(addr), 32);

const fmt18 = (v: bigint, dp = 6) => {
  const s = ethers.formatUnits(v, 18);
  const [i, d = ""] = s.split(".");
  const dec = d.slice(0, dp).replace(/0+$/, "");
  return dec ? `${i}.${dec}` : i;
};
const fmtUnits = (v: bigint, d: number, dp = 6) => {
  const s = ethers.formatUnits(v, d);
  const [i, dec = ""] = s.split(".");
  const clipped = dec.slice(0, dp).replace(/0+$/, "");
  return clipped ? `${i}.${clipped}` : i;
};

// ──────────────────────────────────────────────────────────────────────────────

export function PositionsListCard({
  title = "Positions",
  filterOwner,
}: {
  title?: string;
  filterOwner: string | null;
}) {
  const navigate = useNavigate();
  const { evm } = useWallet();
  const [items, setItems] = useState<PositionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanPct, setScanPct] = useState(0);
  const [usedFallback, setUsedFallback] = useState(false);
  const [range, setRange] = useState<{ from: number; to: number } | null>(null);

  const [details, setDetails] = useState<Record<string, PosDetails | null>>({});

  const scanIdRef = useRef(0);
  const itemsRef = useRef<PositionItem[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const provider = useMemo(
    () => new ethers.JsonRpcProvider(RPC, undefined, { batchMaxCount: 20 }),
    []
  );
  const hub = useMemo(
    () => new ethers.Contract(MINTING_HUB, mintingHubAbi, provider),
    [provider]
  );

  // Cache block timestamps
  const blockTsCache = useRef<Map<number, number>>(new Map()).current;
  const getBlockTs = useCallback(
    async (bn: number) => {
      if (blockTsCache.has(bn)) return blockTsCache.get(bn)!;
      const block = await withBackoff(() => provider.getBlock(bn), "getBlock");
      const ts = Number(block?.timestamp ?? 0);
      blockTsCache.set(bn, ts);
      return ts;
    },
    [provider, blockTsCache]
  );

  const mapLog = useCallback(
    async (log: Log): Promise<PositionItem | null> => {
      try {
        const parsed = hub.interface.parseLog(log);
        const { owner, position, original, collateral } =
          parsed?.args as unknown as {
            owner: string;
            position: string;
            original: string;
            collateral: string;
          };

        let timestamp: number | undefined;
        try {
          timestamp = await getBlockTs(log.blockNumber);
        } catch {}

        return {
          owner,
          position,
          original,
          collateral,
          blockNumber: BigInt(log.blockNumber),
          txHash: log.transactionHash!,
          timestamp,
        };
      } catch {
        return null;
      }
    },
    [hub.interface, getBlockTs]
  );

  const getLogsChunked = useCallback(
    async (params: {
      address: string;
      fromBlock: number;
      toBlock: number;
      topics: (string | null)[] | (string | string[] | null)[];
      chunkSize?: number;
      ownerFilter?: string;
      scanId: number;
    }) => {
      const { address, topics, ownerFilter, scanId } = params;
      const chunkSize = params.chunkSize ?? CHUNK_SIZE;
      const totalBlocks = params.toBlock - params.fromBlock + 1;
      const chunks = Math.max(1, Math.ceil(totalBlocks / chunkSize));
      const out: Log[] = [];
      let from = params.fromBlock;

      for (let i = 0; i < chunks; i++) {
        if (scanIdRef.current !== scanId) break;
        const end = Math.min(from + chunkSize - 1, params.toBlock);

        const logs = await withBackoff(
          () =>
            provider.getLogs({
              address,
              fromBlock: from,
              toBlock: end,
              topics,
            }),
          `getLogs [${from}-${end}]`
        );

        if (ownerFilter) {
          const filtered: Log[] = [];
          for (const lg of logs) {
            try {
              const parsed = hub.interface.parseLog(lg);
              const owner: string = (parsed?.args as any).owner;
              if (owner.toLowerCase() === ownerFilter) filtered.push(lg);
            } catch {}
          }
          out.push(...filtered);
        } else {
          out.push(...logs);
        }

        setScanPct(Math.round(((i + 1) / chunks) * 100));
        from = end + 1;
        if (i + 1 < chunks) await sleep(35);
      }
      return out;
    },
    [provider, hub.interface]
  );

  const computeDefaultRange = useCallback(async () => {
    const latest = await withBackoff(
      () => provider.getBlockNumber(),
      "getBlockNumber"
    );
    if (DEPLOY_BLOCK > 0) {
      const from = Math.max(DEPLOY_BLOCK, latest - DEFAULT_BACKSCAN);
      return { from, to: latest };
    }
    return { from: Math.max(0, latest - DEFAULT_BACKSCAN), to: latest };
  }, [provider]);

  const load = useCallback(
    async (opts?: { from?: number; to?: number }) => {
      setLoading(true);
      setScanPct(0);
      setUsedFallback(false);
      const myScanId = ++scanIdRef.current;

      try {
        const latest = await withBackoff(
          () => provider.getBlockNumber(),
          "getBlockNumber"
        );
        const { from, to } = opts ?? (await computeDefaultRange());
        setRange({ from: from ?? DEPLOY_BLOCK, to: to ?? latest });

        let logs: Log[] = [];
        if (filterOwner) {
          logs = await getLogsChunked({
            address: MINTING_HUB,
            fromBlock: from ?? DEPLOY_BLOCK,
            toBlock: to ?? latest,
            topics: [topicPositionOpened, toTopicAddress(filterOwner)],
            scanId: myScanId,
          });

          if (scanIdRef.current === myScanId && logs.length === 0) {
            setUsedFallback(true);
            logs = await getLogsChunked({
              address: MINTING_HUB,
              fromBlock: from ?? DEPLOY_BLOCK,
              toBlock: to ?? latest,
              topics: [topicPositionOpened],
              ownerFilter: filterOwner.toLowerCase(),
              scanId: myScanId,
            });
          }
        } else {
          logs = await getLogsChunked({
            address: MINTING_HUB,
            fromBlock: from ?? DEPLOY_BLOCK,
            toBlock: to ?? latest,
            topics: [topicPositionOpened],
            scanId: myScanId,
          });
        }

        if (scanIdRef.current !== myScanId) return;

        const mapped = (await Promise.all(logs.map(mapLog))).filter(
          Boolean
        ) as PositionItem[];
        mapped.sort((a, b) => Number(b.blockNumber - a.blockNumber));
        setItems(mapped);
      } catch (e) {
        console.error("load positions failed", e);
        setItems([]);
      } finally {
        if (scanIdRef.current === myScanId) {
          setLoading(false);
          setScanPct(0);
        }
      }
    },
    [provider, computeDefaultRange, getLogsChunked, mapLog, filterOwner]
  );

  useEffect(() => {
    load();
  }, [load]);

  // live tailing (throttled)
  // live tailing (throttled)
  const lastBlockQueryRef = useRef(0);

  useEffect(() => {
    // keep your async logic in here
    const onBlock = async (bn: number) => {
      if (loading) return;
      const now = Date.now();
      if (now - lastBlockQueryRef.current < THROTTLE_BLOCK_POLL_MS) return;
      lastBlockQueryRef.current = now;

      try {
        const fetchLogs = () =>
          provider.getLogs({
            address: MINTING_HUB,
            fromBlock: bn,
            toBlock: bn,
            topics: filterOwner
              ? [topicPositionOpened, toTopicAddress(filterOwner)]
              : [topicPositionOpened],
          });

        let newLogs: Log[] = await withBackoff(fetchLogs, "live getLogs");
        if (!newLogs.length && filterOwner) {
          newLogs = await withBackoff(
            () =>
              provider.getLogs({
                address: MINTING_HUB,
                fromBlock: bn,
                toBlock: bn,
                topics: [topicPositionOpened],
              }),
            "live fallback getLogs"
          );
        }

        if (!newLogs.length) return;

        const mapped = (await Promise.all(newLogs.map(mapLog))).filter(
          Boolean
        ) as PositionItem[];
        const filtered = filterOwner
          ? mapped.filter(
              (m) => m.owner.toLowerCase() === filterOwner.toLowerCase()
            )
          : mapped;

        if (filtered.length) {
          const existing = new Set(
            itemsRef.current.map((i) => `${i.txHash}-${i.position}`)
          );
          const fresh = filtered.filter(
            (i) => !existing.has(`${i.txHash}-${i.position}`)
          );
          if (fresh.length) {
            setItems((prev) =>
              [...fresh, ...prev].sort((a, b) =>
                Number(b.blockNumber - a.blockNumber)
              )
            );
          }
        }
      } catch {}
    };

    // wrap async handler so the emitter doesn't see a returned Promise
    const handler = (bn: number) => {
      void onBlock(bn);
    };

    provider.on("block", handler);

    // IMPORTANT: cleanup must be synchronous and return void
    return () => {
      provider.off("block", handler);
    };
  }, [provider, filterOwner, mapLog, loading]); // (you can drop `loading` if you want fewer re-subscribes)

  const scanOlder = useCallback(async () => {
    if (!range) return;
    const depth = range.to - range.from + 1;
    const newFrom = Math.max(0, range.from - depth);
    await load({ from: newFrom, to: range.to });
  }, [range, load]);

  // ── DETAILS for ALL positions (gentle on RPC) ───────────────────────────────
  const fetchDetails = useCallback(
    async (posAddr: string, collateralAddr: string): Promise<PosDetails> => {
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
    },
    [provider]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = items;
      for (const it of list) {
        if (cancelled) break;
        const key = it.position.toLowerCase();
        if (details[key] == null) {
          try {
            const d = await fetchDetails(it.position, it.collateral);
            if (!cancelled) setDetails((prev) => ({ ...prev, [key]: d }));
          } catch {
            if (!cancelled) setDetails((prev) => ({ ...prev, [key]: null }));
          }
          if (!cancelled) await sleep(DETAILS_BATCH_DELAY_MS);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, fetchDetails]);

  // ────────────────────────────────────────────────────────────────────────────

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <List size={16} /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs text-[var(--muted)] flex items-center gap-2">
            <span>Hub</span>
            <Badge>{MINTING_HUB}</Badge>
            {range ? (
              <span className="ml-2">
                Blocks {range.from.toLocaleString()} →{" "}
                {range.to.toLocaleString()}
              </span>
            ) : null}
            {loading ? <span className="ml-2">{scanPct}%</span> : null}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => load()} disabled={loading}>
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              <span className="ml-2">
                {loading ? "Refreshing…" : "Refresh"}
              </span>
            </Button>
            <Button
              variant="outline"
              onClick={scanOlder}
              disabled={loading || !range || range.from === 0}
              title="Scan an older window as well"
            >
              <ChevronLeft size={14} />
              <span className="ml-2">Scan older</span>
            </Button>
          </div>
        </div>

        {items.length === 0 && !loading && (
          <div className="text-sm text-[var(--muted)]">
            No positions found in this window
            {filterOwner ? " for your wallet" : ""}.
            {usedFallback ? " (Scanned all events in-range.)" : ""}
          </div>
        )}

        {items.map((it) => {
          const key = it.position.toLowerCase();
          const d = details[key] || null;

          const activeNow = !!d && Date.now() / 1000 >= d.start;
          const cooling = !!d && Date.now() / 1000 <= d.cooldown;
          const expired = !!d && Date.now() / 1000 >= d.expiration;
          const challenged = !!d && d.challenged > 0n;

          return (
            <div
              key={`${it.txHash}-${it.position}`}
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/position/${it.position}`)}
              onKeyDown={(e) =>
                e.key === "Enter" ? navigate(`/position/${it.position}`) : null
              }
              className="rounded-2xl border p-4 space-y-3 bg-[var(--glass)]/40 hover:bg-[var(--glass)]/60 transition cursor-pointer"
              title="Open position details"
            >
              {/* header row */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-[var(--muted)]">Position</span>
                <AddressPill addr={it.position} />
                <Badge tone="blue">{it.blockNumber.toString()}</Badge>
                <span className="text-[var(--muted)] ml-2">Collateral</span>
                <AddressPill addr={it.collateral} />
                <span className="text-[var(--muted)] ml-2">Owner</span>
                <AddressPill addr={it.owner} />
                {it.timestamp ? (
                  <span className="text-[var(--muted)]">
                    · {new Date((it.timestamp || 0) * 1000).toLocaleString()}
                  </span>
                ) : null}
                {EXPLORER_TX ? (
                  <a
                    className="ml-auto text-[var(--primary)] underline decoration-dotted"
                    href={`${EXPLORER_TX}${it.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    View tx
                  </a>
                ) : null}
              </div>

              {/* Summary chips (for ALL positions) */}
              {d ? (
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge tone={expired ? "rose" : cooling ? "amber" : "green"}>
                    {expired
                      ? "Expired"
                      : cooling
                      ? `Cooling until ${new Date(
                          d.cooldown * 1000
                        ).toLocaleString()}`
                      : activeNow
                      ? "Active"
                      : `Active from ${new Date(
                          d.start * 1000
                        ).toLocaleString()}`}
                  </Badge>
                  {challenged ? (
                    <Badge tone="rose">
                      Challenged: {fmtUnits(d.challenged, d.collDecimals)}{" "}
                      {d.collSymbol}
                    </Badge>
                  ) : (
                    <Badge tone="blue">
                      Challenge period: {Math.round(d.challengePeriod / 3600)}h
                    </Badge>
                  )}
                  <Badge tone="amber">
                    Price: {ethers.formatUnits(d.price, d.priceDecimals)} OFD /
                    1 {d.collSymbol}
                  </Badge>
                  <Badge>
                    Minted: <b className="ml-1">{fmt18(d.minted)}</b> OFD
                  </Badge>
                  <Badge tone="amber">
                    Reserve: {d.reservePPM / 10_000}% · Risk premium:{" "}
                    {d.riskPPM / 10_000}%
                  </Badge>
                  <Badge>
                    Collateral: {fmtUnits(d.collBal, d.collDecimals)}{" "}
                    {d.collSymbol}
                  </Badge>
                  <Badge>
                    Min Collateral: {fmtUnits(d.minColl, d.collDecimals)}{" "}
                    {d.collSymbol}
                  </Badge>
                </div>
              ) : (
                <div className="text-xs text-[var(--muted)]">
                  Loading details…
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
