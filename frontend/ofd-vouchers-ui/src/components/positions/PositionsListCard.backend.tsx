// components/positions/PositionsListCard.tsx (backend-driven reads, original logic preserved)
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWallet } from "../wallet/WalletProvider";
import { Card, CardHeader, CardTitle, CardContent } from "../ui/Card";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { AddressPill } from "../ui/AddressPill";
import { List, RefreshCw, ChevronLeft } from "lucide-react";
import { ethers } from "ethers";
import { api, type PositionItem, asBig } from "../../lib/api";

const MINTING_HUB = import.meta.env.VITE_MINTING_HUB as string;
const EXPLORER_TX = import.meta.env.VITE_EXPLORER_TX as string | undefined;
const THROTTLE_BLOCK_POLL_MS = Number(
  import.meta.env.VITE_THROTTLE_BLOCK_POLL_MS || 4000
);

// ── utils (same output as original) ──────────────────────────────────────────
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

export function PositionsListCard({
  title = "Positions",
  filterOwner,
}: {
  title?: string;
  filterOwner: string | null;
}) {
  const navigate = useNavigate();
  const { evm } = useWallet(); // kept to mirror original signature (not used)
  const [items, setItems] = useState<PositionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanPct, setScanPct] = useState(0); // cosmetic, preserved
  const [usedFallback] = useState(false); // preserved flag (backend handles filtering)
  const [range, setRange] = useState<{ from: number; to: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setScanPct(0);
    try {
      const owner = filterOwner ? filterOwner.toLowerCase() : undefined;

      // backend read (optionally let server filter; safety-net client filter)
      const list = await api.positions();
      const filtered = owner
        ? list.filter((p) => p.owner.toLowerCase() === owner)
        : list;

      // sort by openedBlock desc, using safe bigint conversion
      filtered.sort((a, b) => {
        const A = asBig(a.openedBlock);
        const B = asBig(b.openedBlock);
        return A === B ? 0 : A < B ? 1 : -1;
      });
      setItems(filtered);

      // range UI from /state (approximation, same display as backend version)
      const st = await api.state();
      const to = Number(st.lastScanned || 0);
      setRange({ from: Math.max(0, to - 250000), to });

      // cosmetic progress reset
      setScanPct(0);
    } catch (e) {
      console.error(e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [filterOwner]);

  useEffect(() => {
    load();
  }, [load]);

  // simple polling to stay fresh (preserved)
  useEffect(() => {
    const t = setInterval(() => {
      if (!loading) load();
    }, THROTTLE_BLOCK_POLL_MS);
    return () => clearInterval(t);
  }, [loading, load]);

  // “Scan older” button preserved — adjusts displayed window and reloads,
  // while the backend controls the actual indexed depth.
  const scanOlder = useCallback(async () => {
    if (!range) return;
    const depth = range.to - range.from + 1;
    const newFrom = Math.max(0, range.from - depth);
    setRange({ from: newFrom, to: range.to });
    await load();
  }, [range, load]);

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
                Indexed blocks {range.from.toLocaleString()} →{" "}
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
            No positions found in the indexed window
            {filterOwner ? " for your wallet" : ""}.
            {usedFallback ? " (Scanned all events in-range.)" : ""}
          </div>
        )}

        {items.map((it) => {
          const now = Math.floor(Date.now() / 1000);
          const activeNow = now >= it.start;
          const cooling = now <= it.cooldown;
          const expired = now >= it.expiration;
          const challenged = asBig(it.challenged) > 0n;

          const showTx =
            !!EXPLORER_TX &&
            typeof it.openedTx === "string" &&
            it.openedTx.length > 10 &&
            it.openedTx !== "0x";

          return (
            <div
              key={`${it.openedTx}-${it.id}`}
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/position/${it.id}`)}
              onKeyDown={(e) =>
                e.key === "Enter" ? navigate(`/position/${it.id}`) : null
              }
              className="rounded-2xl border p-4 space-y-3 bg-[var(--glass)]/40 hover:bg-[var(--glass)]/60 transition cursor-pointer"
              title="Open position details"
            >
              {/* header row */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-[var(--muted)]">Position</span>
                <AddressPill addr={it.id} />
                <Badge tone="blue">{String(it.openedBlock)}</Badge>
                <span className="text-[var(--muted)] ml-2">Collateral</span>
                <AddressPill addr={it.collateral} />
                <span className="text-[var(--muted)] ml-2">Owner</span>
                <AddressPill addr={it.owner} />
                {it.openedTs ? (
                  <span className="text-[var(--muted)]">
                    · {new Date((it.openedTs || 0) * 1000).toLocaleString()}
                  </span>
                ) : null}
                {showTx ? (
                  <a
                    className="ml-auto text-[var(--primary)] underline decoration-dotted"
                    href={`${EXPLORER_TX}${it.openedTx}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    View tx
                  </a>
                ) : null}
              </div>

              {/* Summary chips (same logic/formatting as original) */}
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge tone={expired ? "rose" : cooling ? "amber" : "green"}>
                  {expired
                    ? "Expired"
                    : cooling
                    ? `Cooling until ${new Date(
                        it.cooldown * 1000
                      ).toLocaleString()}`
                    : activeNow
                    ? "Active"
                    : `Active from ${new Date(
                        it.start * 1000
                      ).toLocaleString()}`}
                </Badge>
                {challenged ? (
                  <Badge tone="rose">
                    Challenged:{" "}
                    {ethers.formatUnits(asBig(it.challenged), it.collDecimals)}{" "}
                    {it.collSymbol}
                  </Badge>
                ) : (
                  <Badge tone="blue">
                    Challenge period: {Math.round(it.challengePeriod / 3600)}h
                  </Badge>
                )}
                <Badge tone="amber">
                  Price: {ethers.formatUnits(asBig(it.price), it.priceDecimals)}{" "}
                  OFD / 1 {it.collSymbol}
                </Badge>
                <Badge>
                  Minted: <b className="ml-1">{fmt18(asBig(it.minted))}</b> OFD
                </Badge>
                <Badge tone="amber">
                  Reserve: {it.reservePPM / 10_000}% · Risk premium:{" "}
                  {it.riskPPM / 10_000}%
                </Badge>
                <Badge>
                  Collateral: {fmtUnits(asBig(it.collBal), it.collDecimals)}{" "}
                  {it.collSymbol}
                </Badge>
                <Badge>
                  Min Collateral: {fmtUnits(asBig(it.minColl), it.collDecimals)}{" "}
                  {it.collSymbol}
                </Badge>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
