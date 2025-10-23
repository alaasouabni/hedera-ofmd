// components/positions/SponsorOpenPositionCard.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useWallet } from "../wallet/WalletProvider";
import { Card, CardHeader, CardTitle, CardContent } from "../ui/Card";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Badge } from "../ui/Badge";
import {
  AlertTriangle,
  CheckCircle2,
  Coins,
  ChevronDown,
  Info,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  Banknote,
} from "lucide-react";
import { evmWrite } from "../../lib/evm";
import { readProviders } from "../../lib/utils";

const MINTING_HUB = import.meta.env.VITE_MINTING_HUB as string;
const HOFD = import.meta.env.VITE_HOFD as string;
const EXPLORER_TX = import.meta.env.VITE_EXPLORER_TX as string | undefined;

const mintingHubAbi = [
  "function openPosition(address _collateralAddress,uint256 _minCollateral,uint256 _initialCollateral,uint256 _mintingMaximum,uint40 _initPeriodSeconds,uint40 _expirationSeconds,uint40 _challengeSeconds,uint24 _riskPremium,uint256 _liqPrice,uint24 _reservePPM) returns (address)",
  "function OPENING_FEE() view returns (uint256)",
  "function applicationFee() view returns (uint256)",
  "function CHALLENGER_REWARD() view returns (uint24)",
  "error IncompatibleCollateral()",
  "error InsufficientCollateral()",
];

const erc20AbiMinimal = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
];

// ── Presets (env w/ logo support, or fallback) ────────────────────────────────
type Preset = {
  label: string;
  symbol?: string;
  address: string;
  decimals?: number;
  logo?: string;
};

const PRESET_COLLATERALS: Preset[] = (() => {
  try {
    const raw = (import.meta as any).env.VITE_COLLATERALS;
    if (raw) return JSON.parse(raw);
  } catch {}
  return [
    {
      label: "MockVOL (18d)",
      symbol: "VOL",
      address: "0xe9cb34F4B1a879B0A36EB52f8042EbA7565CfA69",
      decimals: 18,
      logo: "https://avatars.githubusercontent.com/u/5040036?s=200&v=4", // placeholder
    },
  ];
})();

// ── Utils ─────────────────────────────────────────────────────────────────────
async function assertHasCode(provider: any, addr: string, label: string) {
  const code = await provider.getCode(addr);
  if (!code || code === "0x")
    throw new Error(`${label} has no code at ${addr}`);
}
const onlyNum = (v: string) => v.replace(/[^\d.]/g, "");
const fmt = (v: bigint, d = 18, dp = 6) => {
  const s = readProviders.ethers.formatUnits(v, d);
  const [i, dec = ""] = s.split(".");
  const clipped = dec.slice(0, dp).replace(/0+$/, "");
  return clipped ? `${i}.${clipped}` : i;
};

// Small internal UI helpers
const FieldLabel: React.FC<React.PropsWithChildren> = ({ children }) => (
  <label
    className="text-[11px] uppercase tracking-[.08em] text-[var(--muted)]
               select-none"
    style={{ fontFeatureSettings: "'tnum' 1" }}
  >
    {children}
  </label>
);

const Chip: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
}> = ({ children, onClick, active, disabled, title }) => (
  <button
    type="button"
    title={title}
    onClick={onClick}
    disabled={disabled}
    aria-pressed={!!active}
    className={[
      // layout
      "h-8 px-3 inline-flex items-center justify-center rounded-full",
      "text-xs font-medium transition",
      // base surface
      "bg-[var(--panel)]/70 ring-1 ring-[var(--border)] shadow-sm",
      "hover:bg-[var(--panel)]/90",
      // active state: visible in light AND dark
      active
        ? "text-[var(--primary)] bg-[var(--primary)]/12 ring-[var(--primary)]/40"
        : "text-[var(--foreground)]/80",
      // focus & disabled
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/50 focus-visible:ring-offset-1",
      disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer",
      // nicer motion
      "hover:scale-[1.015] active:scale-[0.99]",
    ].join(" ")}
  >
    {children}
  </button>
);

const TokenCard: React.FC<{
  label: string;
  address: string;
  symbol?: string;
  decimals?: number;
  logo?: string;
  active: boolean;
  onClick: () => void;
}> = ({ label, address, symbol, decimals, logo, active, onClick }) => {
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "group w-full flex items-center gap-3 p-3 rounded-2xl text-left transition",
        "bg-[var(--glass)]/80 backdrop-blur-sm",
        "ring-1",
        active
          ? "ring-[var(--primary)] shadow-[0_0_0_3px_color-mix(in_oklab,theme(colors.primary),transparent_70%)]"
          : "ring-[var(--border)] hover:ring-[var(--primary)]/60",
      ].join(" ")}
    >
      <div className="h-8 w-8 rounded-xl overflow-hidden ring-1 ring-[var(--border)] bg-[var(--panel)] flex items-center justify-center">
        {logo ? (
          <img
            src={logo}
            alt={symbol ?? label}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="text-[11px]">{symbol ?? "?"}</div>
        )}
      </div>
      <div className="flex-1">
        <div className="text-sm font-medium leading-tight">{label}</div>
        <div className="text-[11px] text-[var(--muted)]">
          {symbol
            ? `${symbol}${decimals != null ? ` · ${decimals}d` : ""}`
            : "Token"}{" "}
          · {short}
        </div>
      </div>
      {active && (
        <Badge tone="blue" className="shrink-0">
          Selected
        </Badge>
      )}
    </button>
  );
};

export function SponsorOpenPositionCard() {
  const { evm } = useWallet();

  // UI state
  const [busy, setBusy] = useState<
    null | "check" | "pre" | "approve" | "approveOFD" | "send"
  >(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // selection state
  const [presetKey, setPresetKey] = useState<string>(
    PRESET_COLLATERALS[0]?.address ?? "custom"
  );

  // form state
  const [collateralAddr, setCollateralAddr] = useState<string>(
    PRESET_COLLATERALS[0]?.address ?? ""
  );
  const [liqPriceOFD, setLiqPriceOFD] = useState("1000");
  const [minCollateral, setMinCollateral] = useState("5");
  const [initialCollateral, setInitialCollateral] = useState("25");
  const [initialLimitOFD, setInitialLimitOFD] = useState("40000");
  const [feesPercent, setFeesPercent] = useState("2");
  const [reservePercent, setReservePercent] = useState("10");

  // advanced
  const [durationDays, setDurationDays] = useState("180");
  const [challengePeriodSeconds, setChallengePeriodSeconds] = useState("901");
  const [minApplicationPeriodSeconds, setMinApplicationPeriodSeconds] =
    useState("518400");

  // token/meta/balances
  const [collMeta, setCollMeta] = useState<{
    symbol: string;
    decimals: number;
  } | null>(null);
  const [collBalance, setCollBalance] = useState<bigint | null>(null);
  const [collAllowance, setCollAllowance] = useState<bigint | null>(null);
  const [ofdBalance, setOfdBalance] = useState<bigint | null>(null);
  const [ofdAllowance, setOfdAllowance] = useState<bigint | null>(null);
  const [openingFee, setOpeningFee] = useState<bigint | null>(null);

  const disabled = useMemo(
    () => !evm?.address || !collateralAddr || busy !== null,
    [evm?.address, collateralAddr, busy]
  );

  const resetStatus = () => {
    setErr(null);
    setOk(null);
  };

  // preset → fill address & optimistic meta
  useEffect(() => {
    if (presetKey === "custom") return;
    const chosen = PRESET_COLLATERALS.find(
      (c) => c.address.toLowerCase() === presetKey.toLowerCase()
    );
    if (chosen) {
      setCollateralAddr(chosen.address);
      if (chosen.decimals != null || chosen.symbol) {
        setCollMeta({
          decimals: chosen.decimals ?? 18,
          symbol: chosen.symbol ?? "COLL",
        });
      }
    }
  }, [presetKey]);

  // derived + soft guards
  const derived = useMemo(() => {
    const dec = collMeta?.decimals ?? 18;
    const PRICE_DECIMALS = 36 - dec;
    const toColl = (v: string) =>
      readProviders.ethers.parseUnits(v || "0", dec);
    const toOFD = (v: string) => readProviders.ethers.parseUnits(v || "0", 18);
    const toPrice = (v: string) =>
      readProviders.ethers.parseUnits(v || "0", PRICE_DECIMALS);

    const minCol = toColl(minCollateral);
    const liqP = toPrice(liqPriceOFD);
    const guardOk = minCol * liqP >= 3500n * 10n ** 36n;

    const initCol = toColl(initialCollateral);
    const cap18 = (initCol * liqP) / 10n ** 18n;
    const reservePPM = BigInt(Math.round(Number(reservePercent || "0") * 1e4));
    const capAfterReserve = (cap18 * (1_000_000n - reservePPM)) / 1_000_000n;

    return {
      dec,
      PRICE_DECIMALS,
      toColl,
      toOFD,
      toPrice,
      guardOk,
      capAfterReserve,
    };
  }, [
    collMeta?.decimals,
    minCollateral,
    liqPriceOFD,
    initialCollateral,
    reservePercent,
  ]);

  // fetch token info/balances
  useEffect(() => {
    (async () => {
      if (!evm?.address || !collateralAddr) return;
      try {
        setBusy("check");
        const signer = await evmWrite();
        const provider = signer.provider!;
        const hub = new readProviders.ethers.Contract(
          MINTING_HUB,
          mintingHubAbi,
          signer
        );
        const coll = new readProviders.ethers.Contract(
          collateralAddr,
          erc20AbiMinimal,
          signer
        );
        const ofd = new readProviders.ethers.Contract(
          HOFD,
          erc20AbiMinimal,
          signer
        );

        await Promise.all([
          assertHasCode(provider, MINTING_HUB, "MintingHub"),
          assertHasCode(provider, collateralAddr, "Collateral"),
          assertHasCode(provider, HOFD, "hOFD"),
        ]);

        let symbol = collMeta?.symbol;
        let decimals = collMeta?.decimals;
        try {
          [symbol, decimals] = await Promise.all([
            coll.symbol(),
            coll.decimals(),
          ]);
        } catch {}
        if (symbol && decimals != null)
          setCollMeta({ symbol, decimals: Number(decimals) });

        const [cBal, cAlw, hBal, hAlw] = await Promise.all([
          coll.balanceOf(evm.address),
          coll.allowance(evm.address, MINTING_HUB),
          ofd.balanceOf(evm.address),
          ofd.allowance(evm.address, MINTING_HUB),
        ]);

        setCollBalance(cBal);
        setCollAllowance(cAlw);
        setOfdBalance(hBal);
        setOfdAllowance(hAlw);

        let fee: bigint | null = null;
        try {
          fee = await hub.OPENING_FEE();
        } catch {
          try {
            fee = await hub.applicationFee();
          } catch {}
        }
        setOpeningFee(fee);
      } catch (e) {
        console.warn("precheck failed", e);
      } finally {
        setBusy(null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evm?.address, collateralAddr]);

  // allowance helper
  async function ensureAllowance(
    token: any,
    owner: string,
    spender: string,
    required: bigint
  ) {
    const current: bigint = await token.allowance(owner, spender);
    if (current >= required) return;
    try {
      const tx = await token.approve(spender, required);
      await tx.wait();
    } catch {
      const tx0 = await token.approve(spender, 0);
      await tx0.wait();
      const tx1 = await token.approve(spender, required);
      await tx1.wait();
    }
  }

  // main action
  const openPosition = useCallback(async () => {
    resetStatus();
    if (!evm?.address) return setErr("Connect your EVM wallet first.");

    try {
      const signer = await evmWrite();
      const provider = signer.provider!;
      const hub = new readProviders.ethers.Contract(
        MINTING_HUB,
        mintingHubAbi,
        signer
      );
      const collateral = new readProviders.ethers.Contract(
        collateralAddr,
        erc20AbiMinimal,
        signer
      );
      const ofd = new readProviders.ethers.Contract(
        HOFD,
        erc20AbiMinimal,
        signer
      );

      await assertHasCode(provider, MINTING_HUB, "MintingHub");
      await assertHasCode(provider, collateralAddr, "Collateral");
      await assertHasCode(provider, HOFD, "hOFD");

      const dec = collMeta?.decimals ?? (await collateral.decimals());
      if (dec > 24) throw new Error(`Collateral decimals (${dec}) > 24`);
      const PRICE_DECIMALS = 36 - dec;

      const toColl = (v: string) =>
        readProviders.ethers.parseUnits(v || "0", dec);
      const toOFD18 = (v: string) =>
        readProviders.ethers.parseUnits(v || "0", 18);
      const toPrice = (v: string) =>
        readProviders.ethers.parseUnits(v || "0", PRICE_DECIMALS);

      let initSecs = BigInt(minApplicationPeriodSeconds || "0");
      const MIN_INIT = 5n * 24n * 3600n;
      if (initSecs < MIN_INIT) initSecs = MIN_INIT;

      let challengeSecs = BigInt(challengePeriodSeconds || "0");
      if (challengeSecs <= initSecs) challengeSecs = initSecs + 1n;

      const expireSecs = BigInt(Math.max(1, Number(durationDays))) * 86_400n;
      let riskPremiumPPM = BigInt(Math.round(Number(feesPercent) * 1e4));
      let reservePPM = BigInt(Math.round(Number(reservePercent) * 1e4));
      if (riskPremiumPPM > 1_000_000n) throw new Error("feesPercent > 100%");
      if (reservePPM > 1_000_000n) throw new Error("reservePercent > 100%");
      try {
        const CR: bigint = await hub.CHALLENGER_REWARD();
        if (reservePPM < CR) reservePPM = CR;
      } catch {}

      const minColl = toColl(minCollateral);
      const initColl = toColl(initialCollateral);
      const liqPrice = toPrice(liqPriceOFD);
      let mintMax = toOFD18(initialLimitOFD);

      if (minColl * liqPrice < 3500n * 10n ** 36n)
        throw new Error("Min collateral × liq price must be ≥ 3500 OFD.");

      const collateralAtLiq_18d = (initColl * liqPrice) / 10n ** 18n;
      const capAdj =
        (collateralAtLiq_18d * (1_000_000n - reservePPM)) / 1_000_000n;
      if (mintMax > capAdj) mintMax = capAdj;

      setBusy("approve");
      const cBal: bigint = await collateral.balanceOf(evm.address);
      if (cBal < initColl) throw new Error("Insufficient collateral balance.");
      await ensureAllowance(collateral, evm.address, MINTING_HUB, initColl);

      setBusy("approveOFD");
      let fee = openingFee;
      if (fee == null) {
        try {
          fee = await hub.OPENING_FEE();
        } catch {
          try {
            fee = await hub.applicationFee();
          } catch {
            fee = readProviders.ethers.parseUnits("1000", 18);
          }
        }
      }
      const hBal: bigint = await ofd.balanceOf(evm.address);
      if (hBal < fee!)
        throw new Error(`Need ${fmt(fee!, 18)} hOFD for opening fee`);
      await ensureAllowance(ofd, evm.address, MINTING_HUB, fee!);

      setBusy("pre");
      try {
        await hub.openPosition.staticCall(
          collateralAddr,
          minColl,
          initColl,
          mintMax,
          initSecs,
          expireSecs,
          challengeSecs,
          Number(riskPremiumPPM),
          liqPrice,
          Number(reservePPM)
        );
      } catch (e: any) {
        const iface = new readProviders.ethers.Interface(mintingHubAbi);
        const data = e?.data || e?.error?.data || e?.info?.error?.data;
        try {
          const decoded = iface.parseError(data);
          setErr(
            `Preflight revert: ${decoded?.name}${
              decoded?.args?.length ? `(${decoded.args.join(", ")})` : ""
            }`
          );
        } catch {
          setErr(
            e?.reason ?? e?.shortMessage ?? e?.message ?? "Preflight reverted"
          );
        }
        setBusy(null);
        return;
      }

      setBusy("send");
      const tx = await hub.openPosition(
        collateralAddr,
        minColl,
        initColl,
        mintMax,
        initSecs,
        expireSecs,
        challengeSecs,
        Number(riskPremiumPPM),
        liqPrice,
        Number(reservePPM)
      );
      await tx.wait();
      setOk(
        `Position opened successfully.${
          EXPLORER_TX ? ` View tx: ${EXPLORER_TX}${tx.hash}` : ""
        }`
      );
    } catch (e: any) {
      setErr(e?.reason ?? e?.shortMessage ?? e?.message ?? String(e));
    } finally {
      setBusy(null);
    }
  }, [
    evm?.address,
    collateralAddr,
    collMeta?.decimals,
    minCollateral,
    initialCollateral,
    initialLimitOFD,
    feesPercent,
    liqPriceOFD,
    reservePercent,
    durationDays,
    challengePeriodSeconds,
    minApplicationPeriodSeconds,
    openingFee,
  ]);

  const stepLabel =
    busy === "check"
      ? "Checking balances…"
      : busy === "approve"
      ? "Approving collateral…"
      : busy === "approveOFD"
      ? "Approving opening fee…"
      : busy === "pre"
      ? "Preflighting…"
      : busy === "send"
      ? "Opening…"
      : null;

  // quick pick values
  const qpPrice = ["500", "1000", "1500", "2000"];
  const qpPremium = ["1", "2", "3", "5"];
  const qpReserve = ["5", "10", "15", "20"];
  const qpTenor = [
    { l: "30d", v: "30" },
    { l: "90d", v: "90" },
    { l: "180d", v: "180" },
    { l: "365d", v: "365" },
  ];
  const qpChallenge = [
    { l: "15m", v: String(15 * 60) },
    { l: "30m", v: String(30 * 60) },
    { l: "1h", v: String(60 * 60) },
  ];
  const qpInit = [
    { l: "5d (min)", v: String(5 * 24 * 3600) },
    { l: "6d", v: String(6 * 24 * 3600) },
    { l: "7d", v: String(7 * 24 * 3600) },
    { l: "10d", v: String(10 * 24 * 3600) },
  ];

  // chosen preset meta (for logo)
  const activePreset = PRESET_COLLATERALS.find(
    (c) => c.address.toLowerCase() === presetKey.toLowerCase()
  );

  const MAX_UINT256 = (1n << 256n) - 1n;

  const fmtTerse = (v: bigint, d = 18) => {
    // compact but accurate for tokens: show K / M / B / T for integer tokens
    const one = 10n ** BigInt(d);
    const whole = v / one;
    const suffixes: [string, bigint][] = [
      ["T", 1_000_000_000_000n],
      ["B", 1_000_000_000n],
      ["M", 1_000_000n],
      ["K", 1_000n],
    ];
    for (const [s, th] of suffixes) {
      if (whole >= th) {
        const scaled = (whole * 1000n) / th; // keep 3 digits of precision
        const i = scaled / 1000n;
        const f = scaled % 1000n;
        const frac =
          f === 0n
            ? ""
            : `.${f.toString().padStart(3, "0").replace(/0+$/, "")}`;
        return `${i}${frac}${s}`;
      }
    }
    // small values → use your precise formatter (tabular)
    const s = readProviders.ethers.formatUnits(v, d);
    const [i, dec = ""] = s.split(".");
    const trimmed = dec.slice(0, 4).replace(/0+$/, "");
    return trimmed ? `${i}.${trimmed}` : i;
  };

  const isUnlimited = (v?: bigint | null) => !!v && v === MAX_UINT256;

  const StatChip: React.FC<{
    icon: React.ReactNode;
    label: string;
    value: React.ReactNode;
    title?: string;
  }> = ({ icon, label, value, title }) => (
    <div
      title={typeof value === "string" ? value : title}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ring-1 ring-[var(--border)]
               bg-[var(--glass)]/70 backdrop-blur-sm text-xs"
      style={{ fontFeatureSettings: "'tnum' 1, 'ss01' 1" }} // tabular nums if available
    >
      <span className="opacity-70">{icon}</span>
      <span className="text-[11px] text-[var(--muted)]">{label}:</span>
      <span className="font-medium">{value}</span>
    </div>
  );

  const InfoStrip: React.FC<{
    guardOk: boolean;
    collBalance: bigint | null;
    collAllowance: bigint | null;
    ofdBalance: bigint | null;
    ofdAllowance: bigint | null;
    capAfterReserve: bigint;
    collDecimals: number;
  }> = ({
    guardOk,
    collBalance,
    collAllowance,
    ofdBalance,
    ofdAllowance,
    capAfterReserve,
    collDecimals,
  }) => {
    return (
      <div
        className={[
          "rounded-2xl p-3 ring-1 bg-gradient-to-br backdrop-blur",
          "from-[var(--glass)]/80 to-transparent",
          guardOk ? "ring-emerald-400/40" : "ring-rose-400/40",
        ].join(" ")}
      >
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 text-xs">
            <Info size={14} className="text-[var(--muted)]" />
            <span className="text-[var(--muted)]">
              Requirement: <b>minCollateral × liqPrice ≥ 3500 OFD</b>
            </span>
          </div>
          <span
            className={[
              "inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs ring-1",
              guardOk
                ? "bg-emerald-500/10 text-emerald-600 ring-emerald-500/30"
                : "bg-rose-500/10 text-rose-600 ring-rose-500/30",
            ].join(" ")}
          >
            <span
              className={[
                "h-1.5 w-1.5 rounded-full",
                guardOk ? "bg-emerald-500" : "bg-rose-500",
              ].join(" ")}
            />
            {guardOk ? "Ready" : "Needs adjustment"}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {collBalance != null && (
            <StatChip
              icon={<Banknote size={13} />}
              label="Coll balance"
              value={fmtTerse(collBalance, collDecimals)}
              title={readProviders.ethers.formatUnits(
                collBalance,
                collDecimals
              )}
            />
          )}
          {/* {collAllowance != null && (
            <StatChip
              icon={<ShieldCheck size={13} />}
              label="Coll allowance"
              value={
                isUnlimited(collAllowance)
                  ? "Unlimited"
                  : fmtTerse(collAllowance, collDecimals)
              }
              title={
                isUnlimited(collAllowance)
                  ? "Unlimited"
                  : readProviders.ethers.formatUnits(
                      collAllowance,
                      collDecimals
                    )
              }
            />
          )} */}
          {ofdBalance != null && (
            <StatChip
              icon={<Banknote size={13} />}
              label="hOFD balance"
              value={fmtTerse(ofdBalance, 18)}
              title={readProviders.ethers.formatUnits(ofdBalance, 18)}
            />
          )}
          {/* {ofdAllowance != null && (
            <StatChip
              icon={<ShieldCheck size={13} />}
              label="hOFD allowance"
              value={
                isUnlimited(ofdAllowance)
                  ? "Unlimited"
                  : fmtTerse(ofdAllowance, 18)
              }
              title={
                isUnlimited(ofdAllowance)
                  ? "Unlimited"
                  : readProviders.ethers.formatUnits(ofdAllowance, 18)
              }
            />
          )} */}
          <StatChip
            icon={<Sparkles size={13} />}
            label="Est. mint cap (after reserve)"
            value={<span>{fmtTerse(capAfterReserve, 18)}&nbsp;OFD</span>}
            title={readProviders.ethers.formatUnits(capAfterReserve, 18)}
          />
        </div>
      </div>
    );
  };

  return (
    <Card className="overflow-hidden">
      {/* Decorative gradient top border */}
      <div className="h-1 w-full bg-gradient-to-r from-[var(--primary)]/70 via-sky-400/60 to-fuchsia-400/60" />
      <CardHeader className="bg-[var(--panel)]/50 backdrop-blur supports-[backdrop-filter]:backdrop-blur-md">
        <CardTitle className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-xl bg-[var(--glass)] ring-1 ring-[var(--border)] flex items-center justify-center">
            <Coins size={16} />
          </div>
          <span>Open Position (Mint hOFD against collateral)</span>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Stats ribbon */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-[var(--muted)]">Hub</span>
          <Badge>{MINTING_HUB}</Badge>

          {collMeta?.symbol && (
            <>
              <span className="text-[var(--muted)] ml-3">Collateral</span>
              <Badge tone="blue">
                {collMeta.symbol} · {collMeta.decimals}d
              </Badge>
            </>
          )}

          {openingFee != null && (
            <>
              <span className="text-[var(--muted)] ml-3">Opening fee</span>
              <Badge tone="amber">{fmt(openingFee, 18)} hOFD</Badge>
            </>
          )}

          <Button
            variant="outline"
            onClick={() => window.location.reload()}
            className="ml-auto"
            title="Refresh balances"
          >
            <RefreshCw size={14} />
          </Button>
        </div>

        {/* Guidance + balances */}
        <InfoStrip
          guardOk={derived.guardOk}
          collBalance={collBalance}
          collAllowance={collAllowance}
          ofdBalance={ofdBalance}
          ofdAllowance={ofdAllowance}
          capAfterReserve={derived.capAfterReserve}
          collDecimals={collMeta?.decimals ?? 18}
        />

        {/* Collateral selection */}
        <div className="space-y-2">
          <FieldLabel>Collateral</FieldLabel>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {PRESET_COLLATERALS.map((p) => (
              <TokenCard
                key={p.address}
                label={p.label}
                symbol={p.symbol}
                decimals={p.decimals}
                address={p.address}
                logo={p.logo}
                active={presetKey.toLowerCase() === p.address.toLowerCase()}
                onClick={() => setPresetKey(p.address)}
              />
            ))}
            {/* Custom tile */}
            <button
              type="button"
              onClick={() => setPresetKey("custom")}
              className={[
                "flex items-center justify-between p-3 rounded-2xl transition",
                "bg-[var(--glass)]/80 ring-1 ring-[var(--border)] hover:ring-[var(--primary)]/60",
              ].join(" ")}
            >
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-xl bg-[var(--panel)] ring-1 ring-[var(--border)] flex items-center justify-center text-[11px]">
                  0x
                </div>
                <div>
                  <div className="text-sm font-medium">Custom address…</div>
                  <div className="text-[11px] text-[var(--muted)]">
                    Paste any ERC-20 collateral
                  </div>
                </div>
              </div>
              {presetKey === "custom" && <Badge tone="blue">Selected</Badge>}
            </button>
          </div>

          {presetKey === "custom" && (
            <div className="grid gap-1 mt-2">
              <FieldLabel>Custom collateral address</FieldLabel>
              <Input
                placeholder="0x…"
                value={collateralAddr}
                onChange={(e) => setCollateralAddr(e.target.value.trim())}
              />
            </div>
          )}
        </div>

        {/* Core inputs */}
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <FieldLabel>Liquidation price (OFD per 1 collateral)</FieldLabel>
            <div className="flex items-center gap-2">
              <Input
                value={liqPriceOFD}
                onChange={(e) => setLiqPriceOFD(onlyNum(e.target.value))}
                placeholder="1000"
              />
              <div className="flex gap-1">
                {qpPrice.map((v) => (
                  <Chip
                    key={v}
                    onClick={() => setLiqPriceOFD(v)}
                    active={liqPriceOFD === v}
                  >
                    {v}
                  </Chip>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <FieldLabel>Min collateral</FieldLabel>
            <Input
              value={minCollateral}
              onChange={(e) => setMinCollateral(onlyNum(e.target.value))}
              placeholder="5"
            />
          </div>

          <div className="space-y-1">
            <FieldLabel>Initial deposit</FieldLabel>
            <Input
              value={initialCollateral}
              onChange={(e) => setInitialCollateral(onlyNum(e.target.value))}
              placeholder="25"
            />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <FieldLabel>Initial mint limit (OFD)</FieldLabel>
            <div className="flex items-center gap-2">
              <Input
                value={initialLimitOFD}
                onChange={(e) => setInitialLimitOFD(onlyNum(e.target.value))}
                placeholder="40000"
              />
              <Chip
                onClick={() =>
                  setInitialLimitOFD(fmt(derived.capAfterReserve, 18))
                }
                title="Use reserve-adjusted cap"
              >
                <Sparkles size={14} className="mr-1 -mt-[1px]" />
                Cap
              </Chip>
            </div>
          </div>

          <div className="space-y-1">
            <FieldLabel>Risk premium (%)</FieldLabel>
            <div className="flex gap-1">
              <Input
                value={feesPercent}
                onChange={(e) => setFeesPercent(onlyNum(e.target.value))}
                placeholder="2"
              />
              {qpPremium.map((v) => (
                <Chip
                  key={v}
                  onClick={() => setFeesPercent(v)}
                  active={feesPercent === v}
                >
                  {v}
                </Chip>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <FieldLabel>Reserve (%)</FieldLabel>
            <div className="flex gap-1">
              <Input
                value={reservePercent}
                onChange={(e) => setReservePercent(onlyNum(e.target.value))}
                placeholder="10"
              />
              {qpReserve.map((v) => (
                <Chip
                  key={v}
                  onClick={() => setReservePercent(v)}
                  active={reservePercent === v}
                >
                  {v}
                </Chip>
              ))}
            </div>
          </div>
        </div>

        {/* Advanced */}
        <div className="pt-1">
          <button
            type="button"
            className="text-xs text-[var(--primary)] underline decoration-dotted flex items-center gap-1"
            onClick={() => setShowAdvanced((s) => !s)}
          >
            <ChevronDown
              size={14}
              className={
                showAdvanced
                  ? "rotate-180 transition-transform"
                  : "transition-transform"
              }
            />
            Advanced (tenor / challenge / init period)
          </button>

          {showAdvanced && (
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <FieldLabel>Duration (days)</FieldLabel>
                <div className="flex gap-1">
                  <Input
                    value={durationDays}
                    onChange={(e) => setDurationDays(onlyNum(e.target.value))}
                    placeholder="180"
                  />
                  {qpTenor.map((o) => (
                    <Chip
                      key={o.v}
                      onClick={() => setDurationDays(o.v)}
                      active={durationDays === o.v}
                    >
                      {o.l}
                    </Chip>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <FieldLabel>Challenge period (s)</FieldLabel>
                <div className="flex gap-1">
                  <Input
                    value={challengePeriodSeconds}
                    onChange={(e) =>
                      setChallengePeriodSeconds(onlyNum(e.target.value))
                    }
                    placeholder="901"
                  />
                  {qpChallenge.map((o) => (
                    <Chip
                      key={o.v}
                      onClick={() => setChallengePeriodSeconds(o.v)}
                      active={challengePeriodSeconds === o.v}
                    >
                      {o.l}
                    </Chip>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <FieldLabel>Min application period (s)</FieldLabel>
                <div className="flex gap-1">
                  <Input
                    value={minApplicationPeriodSeconds}
                    onChange={(e) =>
                      setMinApplicationPeriodSeconds(onlyNum(e.target.value))
                    }
                    placeholder="518400"
                  />
                  {qpInit.map((o) => (
                    <Chip
                      key={o.v}
                      onClick={() => setMinApplicationPeriodSeconds(o.v)}
                      active={minApplicationPeriodSeconds === o.v}
                    >
                      {o.l}
                    </Chip>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* CTA & status */}
        <div className="flex items-center gap-2">
          <Button
            onClick={openPosition}
            disabled={disabled || !derived.guardOk}
          >
            {stepLabel ?? "Open Position"}
          </Button>
          {!derived.guardOk && (
            <span className="text-xs text-rose-600 flex items-center gap-1">
              <AlertTriangle size={14} /> Raise minCollateral or liqPrice to
              meet 3500 OFD.
            </span>
          )}
        </div>

        {err && (
          <div className="flex items-start gap-2 text-sm text-rose-600">
            <AlertTriangle size={16} className="mt-0.5" />
            <span className="break-all">{err}</span>
          </div>
        )}
        {ok && (
          <div className="flex items-start gap-2 text-sm text-emerald-600">
            <CheckCircle2 size={16} className="mt-0.5" />
            <span>{ok}</span>
          </div>
        )}

        <div className="text-[11px] text-[var(--muted)]">
          Flow: check balances → approve collateral → approve opening fee →
          preflight → open. Price auto-scaled to{" "}
          <code>36 − collateralDecimals</code>.
        </div>
      </CardContent>
    </Card>
  );
}

export { SponsorOpenPositionCard as OpenPositionCard } from "./SponsorOpenPositionCard";
