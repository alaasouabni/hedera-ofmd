// components/positions/PositionDetailsCard.tsx
// Backend-driven reads + original on-chain write actions preserved

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useWallet } from "../wallet/WalletProvider";
import { Card, CardHeader, CardTitle, CardContent } from "../ui/Card";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { AddressPill } from "../ui/AddressPill";
import { Input } from "../ui/Input";
import {
  ArrowLeft,
  DollarSign,
  Shield,
  Sparkles,
  TimerReset,
  ArrowDownToLine,
} from "lucide-react";
import { ethers } from "ethers";
import { useNavigate, useParams } from "react-router-dom";
import { evmWrite } from "../../lib/evm";
import { api, type PositionItem, type Challenge, asBig } from "../../lib/api";

// ── ENV ───────────────────────────────────────────────────────────────────────
const RPC = import.meta.env.VITE_EVM_RPC as string;
const EXPLORER_TX = import.meta.env.VITE_EXPLORER_TX as string | undefined;
const MINTING_HUB = import.meta.env.VITE_MINTING_HUB as string;

// ── ABIs (same as your original) ─────────────────────────────────────────────
const positionAbi = [
  // actions
  "function mint(address target, uint256 amount)",
  "function repay(uint256 amount) returns (uint256)",
  "function withdrawCollateral(address target, uint256 amount)",
  "function adjustPrice(uint256 newPrice)",

  // views
  "function owner() view returns (address)",
  "function availableForMinting() view returns (uint256)",
  "function getUsableMint(uint256 totalMint, bool afterFees) view returns (uint256)",
  "function getMintAmount(uint256 usableMint) view returns (uint256)",
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

  // needed for challenge UI
  "function challengeData() view returns (uint256 liqPrice, uint40 phase)",
];

const erc20Abi = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)",
];

// MintingHub
const hubAbi = [
  "function challenge(address _positionAddr, uint256 _collateralAmount, uint256 minimumPrice) returns (uint256)",
  "function bid(uint32 _challengeNumber, uint256 size, bool postponeCollateralReturn)",
  "function price(uint32 challengeNumber) view returns (uint256)",
  "function challenges(uint256) view returns (address challenger, uint40 start, address position, uint256 size)",
  "function pendingReturns(address collateral, address beneficiary) view returns (uint256)",
  "function returnPostponedCollateral(address collateral, address target)",
  "function expiredPurchasePrice(address pos) view returns (uint256)",
  "function buyExpiredCollateral(address pos, uint256 upToAmount) returns (uint256)",
];

// ── Types & utils (same helpers as original) ─────────────────────────────────
type PosDetails = {
  owner: string;
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
  collateral: string;
  collBal: bigint;
  collDecimals: number;
  collSymbol: string;
  priceDecimals: number; // 36 - collDecimals
  ofdAddr: string;
};

type OpenChallenge = {
  number: number;
  challenger: string;
  start: number; // uint40
  size: bigint; // remaining collateral size (token decimals)
  currentPrice: bigint; // OFD per 1 coll, 36-collDecimals decimals
};

const onlyNum = (v: string) => v.replace(/[^\d.]/g, "");
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

// ── Component ────────────────────────────────────────────────────────────────
export default function PositionDetailsCard({
  positionAddress: addrProp,
}: {
  positionAddress?: string;
}) {
  const params = useParams<{ address?: string; addr?: string }>();
  const positionAddress = addrProp ?? params.address ?? params.addr ?? "";

  const navigate = useNavigate();
  const { evm } = useWallet();

  // for helper reads (getUsableMint / getMintAmount / challengeData / priceNow)
  const provider = useMemo(
    () => new ethers.JsonRpcProvider(RPC, undefined, { batchMaxCount: 20 }),
    []
  );
  const hub = useMemo(
    () => new ethers.Contract(MINTING_HUB, hubAbi, provider),
    [provider]
  );

  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [details, setDetails] = useState<PosDetails | null>(null);

  const [busy, setBusy] = useState(false);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const [mintAmt, setMintAmt] = useState("");
  const [repayAmt, setRepayAmt] = useState("");
  const [withdrawAmt, setWithdrawAmt] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [netPreview, setNetPreview] = useState<string | null>(null);
  const [grossFromNet, setGrossFromNet] = useState<string | null>(null);

  // challenge/auction
  const [liqPrice, setLiqPrice] = useState<bigint | null>(null);
  const [avertPhase, setAvertPhase] = useState<number>(0);
  const [openChallenges, setOpenChallenges] = useState<OpenChallenge[]>([]);
  const [challengeAmt, setChallengeAmt] = useState("");
  const [challengeMinPrice, setChallengeMinPrice] = useState("");
  const [bidSize, setBidSize] = useState<Record<number, string>>({});
  const [bidPostpone, setBidPostpone] = useState<Record<number, boolean>>({});
  const [pendingReturn, setPendingReturn] = useState<bigint>(0n);
  const [expiredPrice, setExpiredPrice] = useState<bigint | null>(null);
  const [expiredBuyAmt, setExpiredBuyAmt] = useState("");

  // ── Backend-driven load of details; plus on-chain challengeData ────────────
  const loadDetails = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    setDetails(null);
    setOkMsg(null);
    setErrMsg(null);

    try {
      const row: PositionItem = await api.position(
        positionAddress.toLowerCase()
      );

      // map backend row into the same shape your original logic uses
      const d: PosDetails = {
        owner: row.owner,
        minted: asBig(row.minted),
        price: asBig(row.price),
        reservePPM: row.reservePPM,
        riskPPM: row.riskPPM,
        minColl: asBig(row.minColl),
        limit: asBig(row.limit),
        start: row.start,
        cooldown: row.cooldown,
        expiration: row.expiration,
        challenged: asBig(row.challenged),
        challengePeriod: row.challengePeriod,
        collateral: row.collateral,
        collBal: asBig(row.collBal),
        collDecimals: row.collDecimals,
        collSymbol: row.collSymbol,
        priceDecimals: row.priceDecimals,
        ofdAddr: row.ofdAddr,
      };
      setDetails(d);

      // default min price for starting a challenge
      setChallengeMinPrice(ethers.formatUnits(d.price, d.priceDecimals));

      // on-chain: challengeData for avert window + current liq price
      const pos = new ethers.Contract(positionAddress, positionAbi, provider);
      const [liq, phase] = (await pos.challengeData()) as [bigint, number];
      setLiqPrice(liq);
      setAvertPhase(Number(phase));

      // expired price via backend (for display)
      const ex = await api.expiredPrice(positionAddress.toLowerCase());
      setExpiredPrice(asBig(ex.price));

      // pending returns via backend (for display); signer still needed for claim
      if (evm?.address) {
        const pr = await api.pendingReturns(evm.address, row.collateral);
        setPendingReturn(asBig(pr.pending));
      }
    } catch (e: any) {
      setLoadErr(e?.reason ?? e?.shortMessage ?? e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [positionAddress, provider, evm?.address]);

  // ── Backend-driven load of open challenges ─────────────────────────────────
  const loadChallenges = useCallback(async () => {
    try {
      const list = await api.challenges(positionAddress.toLowerCase());
      const mapped: OpenChallenge[] = list.map((c) => ({
        number: c.number,
        challenger: c.challenger,
        start: c.start,
        size: asBig(c.size),
        currentPrice: asBig(c.currentPrice),
      }));
      // newest first
      mapped.sort((a, b) => b.start - a.start);
      setOpenChallenges(mapped);
    } catch (e) {
      console.warn("loadChallenges (backend) error:", e);
      setOpenChallenges([]);
    }
  }, [positionAddress]);

  useEffect(() => {
    if (!positionAddress) {
      setLoadErr("Missing position address");
      setLoading(false);
      return;
    }
    void loadDetails();
    void loadChallenges();
  }, [positionAddress, loadDetails, loadChallenges]);

  const isMine =
    !!details &&
    !!evm?.address &&
    details.owner !== ethers.ZeroAddress &&
    details.owner.toLowerCase() === evm.address.toLowerCase();

  // ── Allowance helper (unchanged) ───────────────────────────────────────────
  const ensureAllowance = useCallback(
    async (
      tokenAddr: string,
      owner: string,
      spender: string,
      needed: bigint
    ) => {
      const signer = await evmWrite();
      const erc20 = new ethers.Contract(tokenAddr, erc20Abi, signer);
      const current: bigint = await erc20.allowance(owner, spender);
      if (current >= needed) return;
      try {
        const tx = await erc20.approve(spender, needed);
        await tx.wait();
      } catch {
        const tx0 = await erc20.approve(spender, 0n);
        await tx0.wait();
        const tx1 = await erc20.approve(spender, needed);
        await tx1.wait();
      }
    },
    []
  );

  // ── Owner actions (UNCHANGED logic; helpers still read on-chain) ───────────
  const previewNetMint = useCallback(
    async (grossStr: string) => {
      try {
        const gross = ethers.parseUnits(grossStr || "0", 18);
        if (!details || gross === 0n) return "0";
        const pos = new ethers.Contract(positionAddress, positionAbi, provider);
        const net: bigint = await pos.getUsableMint(gross, true);
        return fmt18(net, 6);
      } catch {
        return null;
      }
    },
    [provider, details, positionAddress]
  );

  const reverseGrossFromNet = useCallback(
    async (netStr: string) => {
      try {
        if (!details) return null;
        const net = ethers.parseUnits(netStr || "0", 18);
        const pos = new ethers.Contract(positionAddress, positionAbi, provider);
        const gross: bigint = await pos.getMintAmount(net);
        return fmt18(gross, 6);
      } catch {
        return null;
      }
    },
    [provider, details, positionAddress]
  );

  const handleMint = useCallback(async () => {
    if (!details || !evm?.address) return;
    let gross: bigint;
    try {
      gross = ethers.parseUnits(mintAmt || "0", 18);
    } catch {
      setErrMsg("Invalid amount");
      return;
    }
    if (gross <= 0n) {
      setErrMsg("Enter amount > 0");
      return;
    }
    setBusy(true);
    setErrMsg(null);
    setOkMsg(null);
    try {
      const signer = await evmWrite();
      const pos = new ethers.Contract(positionAddress, positionAbi, signer);
      const tx = await pos.mint(evm.address, gross);
      await tx.wait();
      setOkMsg(
        `Minted ${fmt18(gross)} OFD${EXPLORER_TX ? ` · tx: ${tx.hash}` : ""}`
      );
      void loadDetails();
    } catch (e: any) {
      setErrMsg(e?.reason ?? e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }, [details, evm?.address, mintAmt, positionAddress, loadDetails]);

  const handleRepay = useCallback(async () => {
    if (!details || !evm?.address) return;
    let amount: bigint;
    try {
      amount = ethers.parseUnits(repayAmt || "0", 18);
    } catch {
      setErrMsg("Invalid amount");
      return;
    }
    if (amount <= 0n) {
      setErrMsg("Enter amount > 0");
      return;
    }
    setBusy(true);
    setErrMsg(null);
    setOkMsg(null);
    try {
      await ensureAllowance(
        details.ofdAddr,
        evm.address,
        positionAddress,
        amount
      );
      const signer = await evmWrite();
      const pos = new ethers.Contract(positionAddress, positionAbi, signer);
      const tx = await pos.repay(amount);
      await tx.wait();
      setOkMsg(
        `Repay sent: ${fmt18(amount)} OFD${
          EXPLORER_TX ? ` · tx: ${tx.hash}` : ""
        }`
      );
      void loadDetails();
    } catch (e: any) {
      setErrMsg(e?.reason ?? e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }, [
    details,
    evm?.address,
    repayAmt,
    ensureAllowance,
    positionAddress,
    loadDetails,
  ]);

  const handleWithdraw = useCallback(async () => {
    if (!details || !evm?.address) return;
    let amount: bigint;
    try {
      amount = ethers.parseUnits(withdrawAmt || "0", details.collDecimals);
    } catch {
      setErrMsg("Invalid amount");
      return;
    }
    if (amount <= 0n) {
      setErrMsg("Enter amount > 0");
      return;
    }
    setBusy(true);
    setErrMsg(null);
    setOkMsg(null);
    try {
      const signer = await evmWrite();
      const pos = new ethers.Contract(positionAddress, positionAbi, signer);
      const tx = await pos.withdrawCollateral(evm.address, amount);
      await tx.wait();
      setOkMsg(
        `Withdrew ${fmtUnits(amount, details.collDecimals)} ${
          details.collSymbol
        }${EXPLORER_TX ? ` · tx: ${tx.hash}` : ""}`
      );
      void loadDetails();
    } catch (e: any) {
      setErrMsg(e?.reason ?? e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }, [details, evm?.address, withdrawAmt, positionAddress, loadDetails]);

  const handleAdjustPrice = useCallback(async () => {
    if (!details) return;
    let p: bigint;
    try {
      p = ethers.parseUnits(onlyNum(newPrice) || "0", details.priceDecimals);
    } catch {
      setErrMsg("Invalid price");
      return;
    }
    if (p <= 0n) {
      setErrMsg("Enter price > 0");
      return;
    }
    setBusy(true);
    setErrMsg(null);
    setOkMsg(null);
    try {
      const signer = await evmWrite();
      const pos = new ethers.Contract(positionAddress, positionAbi, signer);
      const tx = await pos.adjustPrice(p);
      await tx.wait();
      setOkMsg(
        `Price updated${
          EXPLORER_TX ? ` · tx: ${tx.hash}` : ""
        }. Cooldown may apply if raised.`
      );
      void loadDetails();
    } catch (e: any) {
      setErrMsg(e?.reason ?? e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }, [details, newPrice, positionAddress, loadDetails]);

  // live net preview
  useEffect(() => {
    if (!mintAmt) {
      setNetPreview(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const v = await previewNetMint(mintAmt);
      if (!cancelled) setNetPreview(v);
    })();
    return () => {
      cancelled = true;
    };
  }, [mintAmt, previewNetMint]);

  // ── Challenge actions (UNCHANGED logic) ────────────────────────────────────
  const handleStartChallenge = useCallback(async () => {
    if (!details || !evm?.address) return;
    let amount: bigint;
    let minP: bigint;
    try {
      amount = ethers.parseUnits(challengeAmt || "0", details.collDecimals);
      minP = ethers.parseUnits(
        onlyNum(challengeMinPrice) || "0",
        details.priceDecimals
      );
    } catch {
      setErrMsg("Invalid input");
      return;
    }
    if (amount <= 0n || minP <= 0n) {
      setErrMsg("Enter amounts > 0");
      return;
    }
    setBusy(true);
    setErrMsg(null);
    setOkMsg(null);
    try {
      await ensureAllowance(
        details.collateral,
        evm.address,
        MINTING_HUB,
        amount
      );
      const signer = await evmWrite();
      const hubWriter = new ethers.Contract(MINTING_HUB, hubAbi, signer);
      const tx = await hubWriter.challenge(positionAddress, amount, minP);
      const rc = await tx.wait();
      const idx = (rc as any)?.result ? Number((rc as any).result) : undefined;
      setOkMsg(
        `Challenge started${idx != null ? ` (#${idx})` : ""}${
          EXPLORER_TX ? ` · tx: ${tx.hash}` : ""
        }`
      );
      setChallengeAmt("");
      await loadChallenges();
      await loadDetails();
    } catch (e: any) {
      setErrMsg(e?.reason ?? e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }, [
    details,
    evm?.address,
    challengeAmt,
    challengeMinPrice,
    positionAddress,
    ensureAllowance,
    loadChallenges,
    loadDetails,
  ]);

  const handleBid = useCallback(
    async (num: number) => {
      if (!details || !evm?.address) return;
      const sizeStr = bidSize[num] || "0";
      let size: bigint;
      try {
        size = ethers.parseUnits(onlyNum(sizeStr) || "0", details.collDecimals);
      } catch {
        setErrMsg("Invalid size");
        return;
      }
      if (size <= 0n) {
        setErrMsg("Enter amount > 0");
        return;
      }
      setBusy(true);
      setErrMsg(null);
      setOkMsg(null);
      try {
        const p: bigint = await hub.price(num);
        const offer = (p * size) / 10n ** 18n;
        await ensureAllowance(details.ofdAddr, evm.address, MINTING_HUB, offer);

        const signer = await evmWrite();
        const hubWriter = new ethers.Contract(MINTING_HUB, hubAbi, signer);
        const tx = await hubWriter.bid(num, size, !!bidPostpone[num]);
        await tx.wait();

        setOkMsg(
          `Bid sent on #${num} · approx cost ${fmt18(offer)} OFD${
            EXPLORER_TX ? ` · tx: ${tx.hash}` : ""
          }`
        );
        await loadChallenges();
        await loadDetails();
      } catch (e: any) {
        setErrMsg(e?.reason ?? e?.message ?? String(e));
      } finally {
        setBusy(false);
      }
    },
    [
      details,
      evm?.address,
      bidSize,
      bidPostpone,
      hub,
      ensureAllowance,
      loadChallenges,
      loadDetails,
    ]
  );

  const handleCancelAsChallenger = useCallback(
    async (num: number) => {
      if (!details || !evm?.address) return;
      const oc = openChallenges.find((c) => c.number === num);
      if (!oc) return;
      setBusy(true);
      setErrMsg(null);
      setOkMsg(null);
      try {
        const size = oc.size; // full cancel by default
        const signer = await evmWrite();
        const hubWriter = new ethers.Contract(MINTING_HUB, hubAbi, signer);
        const tx = await hubWriter.bid(num, size, false);
        await tx.wait();
        setOkMsg(
          `Challenge #${num} cancelled.${
            EXPLORER_TX ? ` · tx: ${tx.hash}` : ""
          }`
        );
        await loadChallenges();
        await loadDetails();
      } catch (e: any) {
        setErrMsg(e?.reason ?? e?.message ?? String(e));
      } finally {
        setBusy(false);
      }
    },
    [details, evm?.address, openChallenges, loadChallenges, loadDetails]
  );

  const handleClaimPostponed = useCallback(async () => {
    if (!details || !evm?.address || pendingReturn === 0n) return;
    setBusy(true);
    setErrMsg(null);
    setOkMsg(null);
    try {
      const signer = await evmWrite();
      const hubWriter = new ethers.Contract(MINTING_HUB, hubAbi, signer);
      const tx = await hubWriter.returnPostponedCollateral(
        details.collateral,
        evm.address
      );
      await tx.wait();
      setOkMsg(
        `Claimed postponed collateral: ${fmtUnits(
          pendingReturn,
          details.collDecimals
        )} ${details.collSymbol}${EXPLORER_TX ? ` · tx: ${tx.hash}` : ""}`
      );
      // refresh via backend & on-chain
      const pr = await api.pendingReturns(evm.address, details.collateral);
      setPendingReturn(asBig(pr.pending));
      await loadChallenges();
      await loadDetails();
    } catch (e: any) {
      setErrMsg(e?.reason ?? e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }, [details, evm?.address, pendingReturn, loadChallenges, loadDetails]);

  const handleBuyExpired = useCallback(async () => {
    if (!details || !evm?.address) return;
    if (Date.now() / 1000 <= details.expiration) {
      setErrMsg("Position not expired yet.");
      return;
    }
    let amt: bigint;
    try {
      amt = ethers.parseUnits(
        onlyNum(expiredBuyAmt) || "0",
        details.collDecimals
      );
    } catch {
      setErrMsg("Invalid amount");
      return;
    }
    if (amt <= 0n) {
      setErrMsg("Enter amount > 0");
      return;
    }
    setBusy(true);
    setErrMsg(null);
    setOkMsg(null);
    try {
      // get latest price on-chain for cost/allowance calc
      const priceNow: bigint = await hub.expiredPurchasePrice(positionAddress);
      const cost = (priceNow * amt) / 10n ** 18n; // 18d OFD
      await ensureAllowance(
        details.ofdAddr,
        evm.address,
        positionAddress,
        cost
      );

      const signer = await evmWrite();
      const hubWriter = new ethers.Contract(MINTING_HUB, hubAbi, signer);
      const tx = await hubWriter.buyExpiredCollateral(positionAddress, amt);
      await tx.wait();
      setOkMsg(
        `Expired buy sent (requested ${fmtUnits(amt, details.collDecimals)} ${
          details.collSymbol
        }) at ~${fmt18(cost)} OFD${EXPLORER_TX ? ` · tx: ${tx.hash}` : ""}`
      );
      await loadDetails();
    } catch (e: any) {
      setErrMsg(e?.reason ?? e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }, [
    details,
    evm?.address,
    expiredBuyAmt,
    ensureAllowance,
    hub,
    loadDetails,
    positionAddress,
  ]);

  // ── Render (same UI as original) ───────────────────────────────────────────
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft size={14} />
          </Button>
          Position Details
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {!positionAddress ? (
          <div className="text-sm text-rose-600">Missing position address.</div>
        ) : loading ? (
          <div className="text-sm text-[var(--muted)]">Loading…</div>
        ) : loadErr ? (
          <div className="text-sm text-rose-600 break-all">{loadErr}</div>
        ) : !details ? (
          <div className="text-sm text-rose-600">Unable to load position.</div>
        ) : (
          <>
            {/* Header row */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-[var(--muted)]">Position</span>
              <AddressPill addr={positionAddress} />
              <span className="text-[var(--muted)] ml-2">Collateral</span>
              <AddressPill addr={details.collateral} />
              <span className="text-[var(--muted)] ml-2">Owner</span>
              <AddressPill addr={details.owner} />
              {EXPLORER_TX ? (
                <a
                  className="ml-auto text-[var(--primary)] underline decoration-dotted"
                  href={`${EXPLORER_TX}${positionAddress}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View on explorer
                </a>
              ) : null}
            </div>

            {/* Status & metrics */}
            <div className="flex flex-wrap gap-2 text-xs">
              {Date.now() / 1000 >= details.expiration ? (
                <Badge tone="rose">Expired</Badge>
              ) : Date.now() / 1000 <= details.cooldown ? (
                <Badge tone="amber">
                  Cooling until{" "}
                  {new Date(details.cooldown * 1000).toLocaleString()}
                </Badge>
              ) : Date.now() / 1000 >= details.start ? (
                <Badge tone="green">Active</Badge>
              ) : (
                <Badge tone="blue">
                  Active from {new Date(details.start * 1000).toLocaleString()}
                </Badge>
              )}
              {details.challenged > 0n ? (
                <Badge tone="rose">
                  Challenged:{" "}
                  {fmtUnits(details.challenged, details.collDecimals)}{" "}
                  {details.collSymbol}
                </Badge>
              ) : (
                <Badge tone="blue">
                  Challenge period: {Math.round(details.challengePeriod / 3600)}
                  h
                </Badge>
              )}
              <Badge tone="amber">
                Price:{" "}
                {ethers.formatUnits(details.price, details.priceDecimals)} OFD /
                1 {details.collSymbol}
              </Badge>
              <Badge>
                Minted: <b className="ml-1">{fmt18(details.minted)}</b> OFD
              </Badge>
              <Badge tone="amber">
                Reserve: {details.reservePPM / 10_000}% · Risk premium:{" "}
                {details.riskPPM / 10_000}%
              </Badge>
              <Badge>
                Collateral: {fmtUnits(details.collBal, details.collDecimals)}{" "}
                {details.collSymbol}
              </Badge>
              <Badge>
                Min Collateral:{" "}
                {fmtUnits(details.minColl, details.collDecimals)}{" "}
                {details.collSymbol}
              </Badge>
            </div>

            {/* ── Challenge & Auction (everyone) ─────────────────────────────── */}
            <div className="space-y-3 rounded-2xl border p-4 bg-[var(--glass)]/30">
              <div className="text-sm font-medium">Challenge & Auction</div>

              {/* Start challenge */}
              <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto] items-center">
                <Input
                  placeholder={`Collateral to challenge (${details.collSymbol})`}
                  value={challengeAmt}
                  onChange={(e) => setChallengeAmt(onlyNum(e.target.value))}
                  disabled={busy}
                />
                <Input
                  placeholder={`Minimum price (OFD / 1 ${details.collSymbol})`}
                  value={challengeMinPrice}
                  onChange={(e) =>
                    setChallengeMinPrice(onlyNum(e.target.value))
                  }
                  disabled={busy}
                />
                <Button
                  onClick={handleStartChallenge}
                  disabled={busy || !challengeAmt || !challengeMinPrice}
                >
                  {busy ? "Starting…" : "Start challenge"}
                </Button>
              </div>
              {liqPrice != null && (
                <div className="text-[11px] text-[var(--muted)]">
                  Avert window length: <b>{Math.round(avertPhase / 3600)}h</b> ·
                  Current liquidation price:{" "}
                  <b>
                    {ethers.formatUnits(liqPrice, details.priceDecimals)} OFD
                  </b>
                </div>
              )}

              {/* Open challenges list */}
              <div className="flex items-center justify-between pt-2">
                <div className="text-xs text-[var(--muted)]">
                  Open challenges for this position
                </div>
                <Button
                  variant="outline"
                  onClick={() => loadChallenges()}
                  disabled={busy}
                >
                  Refresh
                </Button>
              </div>

              {openChallenges.length === 0 ? (
                <div className="text-sm text-[var(--muted)]">
                  No open challenges.
                </div>
              ) : (
                <div className="space-y-3">
                  {openChallenges.map((c) => {
                    const isChallenger =
                      evm?.address &&
                      c.challenger.toLowerCase() === evm.address.toLowerCase();
                    const avertEnds = c.start + (avertPhase || 0);
                    const inAvert = Date.now() / 1000 <= avertEnds;
                    return (
                      <div
                        key={c.number}
                        className="rounded-xl border p-3 text-xs space-y-2"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone="blue">#{c.number}</Badge>
                          <span className="text-[var(--muted)]">
                            Challenger
                          </span>
                          <AddressPill addr={c.challenger} />
                          <span className="text-[var(--muted)]">Started</span>
                          <span>
                            {new Date(c.start * 1000).toLocaleString()}
                          </span>
                          <span className="ml-auto text-[var(--muted)]">
                            {inAvert ? (
                              <>
                                Avert until{" "}
                                <b>
                                  {new Date(avertEnds * 1000).toLocaleString()}
                                </b>
                              </>
                            ) : (
                              <>Auction live</>
                            )}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge>
                            Remaining: {fmtUnits(c.size, details.collDecimals)}{" "}
                            {details.collSymbol}
                          </Badge>
                          <Badge tone="amber">
                            Current price:{" "}
                            {ethers.formatUnits(
                              c.currentPrice,
                              details.priceDecimals
                            )}{" "}
                            OFD / 1 {details.collSymbol}
                          </Badge>
                        </div>

                        <div className="grid gap-2 md:grid-cols-[1fr_auto_auto] items-center">
                          <Input
                            placeholder={`Amount (${details.collSymbol})`}
                            value={bidSize[c.number] ?? ""}
                            onChange={(e) =>
                              setBidSize((s) => ({
                                ...s,
                                [c.number]: onlyNum(e.target.value),
                              }))
                            }
                            disabled={busy}
                          />
                          {!isChallenger && (
                            <label className="inline-flex items-center gap-2 text-[11px] px-3">
                              <input
                                type="checkbox"
                                checked={!!bidPostpone[c.number]}
                                onChange={(e) =>
                                  setBidPostpone((s) => ({
                                    ...s,
                                    [c.number]: e.target.checked,
                                  }))
                                }
                                disabled={busy || inAvert}
                              />
                              Postpone collateral return to challenger
                              (post-avert only)
                            </label>
                          )}
                          <div className="flex gap-2">
                            {isChallenger && inAvert ? (
                              <Button
                                variant="outline"
                                onClick={() =>
                                  handleCancelAsChallenger(c.number)
                                }
                                disabled={busy}
                                title="Cancel (or reduce) during avert phase"
                              >
                                Cancel (free)
                              </Button>
                            ) : null}
                            <Button
                              onClick={() => handleBid(c.number)}
                              disabled={busy || !(bidSize[c.number] ?? "")}
                            >
                              {busy
                                ? "Submitting…"
                                : isChallenger && inAvert
                                ? "Reduce"
                                : inAvert
                                ? "Avert (buy @ liq)"
                                : "Bid"}
                            </Button>
                          </div>
                        </div>
                        <div className="text-[11px] text-[var(--muted)]">
                          Cost estimate updates at click; price is time-varying
                          after avert.
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Postponed returns (challenger) */}
              {evm?.address && pendingReturn > 0n && (
                <div className="rounded-xl border p-3 flex items-center justify-between">
                  <div className="text-xs">
                    You have postponed returns:{" "}
                    <b>
                      {fmtUnits(pendingReturn, details.collDecimals)}{" "}
                      {details.collSymbol}
                    </b>
                  </div>
                  <Button onClick={handleClaimPostponed} disabled={busy}>
                    Claim
                  </Button>
                </div>
              )}
            </div>

            {/* ── Expired purchase (anyone) ──────────────────────────────────── */}
            {Date.now() / 1000 > details.expiration && (
              <div className="space-y-2 rounded-2xl border p-4 bg-[var(--glass)]/30">
                <div className="text-sm font-medium">
                  Buy expired collateral
                </div>
                <div className="grid gap-2 md:grid-cols-[1fr_auto] items-center">
                  <Input
                    placeholder={`Amount (${details.collSymbol})`}
                    value={expiredBuyAmt}
                    onChange={(e) => setExpiredBuyAmt(onlyNum(e.target.value))}
                    disabled={busy}
                  />
                  <Button
                    onClick={handleBuyExpired}
                    disabled={busy || !expiredBuyAmt}
                  >
                    {busy ? "Buying…" : "Buy expired"}
                  </Button>
                </div>
                {expiredPrice != null && (
                  <div className="text-[11px] text-[var(--muted)]">
                    Current expired price:{" "}
                    <b>
                      {ethers.formatUnits(expiredPrice, details.priceDecimals)}{" "}
                      OFD
                    </b>{" "}
                    / 1 {details.collSymbol}
                  </div>
                )}
              </div>
            )}

            {/* ── Owner actions (only if I am the owner) ─────────────────────── */}
            {isMine ? (
              <div className="space-y-6">
                {/* Mint */}
                <div className="space-y-2">
                  <div className="text-sm font-medium">Mint</div>
                  <div className="grid gap-2 md:grid-cols-[1fr_auto_auto] items-center">
                    <Input
                      placeholder="Amount to mint (OFD, 18d)"
                      value={mintAmt}
                      onChange={(e) => setMintAmt(onlyNum(e.target.value))}
                      disabled={busy}
                    />
                    <Button
                      variant="outline"
                      onClick={async () => {
                        try {
                          const pos = new ethers.Contract(
                            positionAddress,
                            positionAbi,
                            provider
                          );
                          const m: bigint = await pos.availableForMinting();
                          setMintAmt(fmt18(m, 6));
                        } catch (e: any) {
                          setErrMsg(e?.message ?? String(e));
                        }
                      }}
                      disabled={busy}
                    >
                      <Sparkles size={14} />
                      <span className="ml-2">Max</span>
                    </Button>
                    <Button onClick={handleMint} disabled={busy || !mintAmt}>
                      {busy ? "Minting…" : "Mint"}
                    </Button>
                  </div>
                  <div className="text-[11px] text-[var(--muted)] flex flex-wrap gap-3">
                    {netPreview != null && (
                      <span>
                        ≈ You receive (after reserve & fee): <b>{netPreview}</b>{" "}
                        OFD
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <DollarSign size={12} />
                      Want a specific net? Enter here:&nbsp;
                      <input
                        className="h-6 px-2 rounded-md border bg-transparent text-xs"
                        placeholder="Net OFD"
                        onChange={async (e) => {
                          const g = await reverseGrossFromNet(
                            onlyNum(e.target.value)
                          );
                          setGrossFromNet(g);
                        }}
                      />
                      {grossFromNet ? (
                        <span className="ml-1">
                          → Mint this gross: <b>{grossFromNet}</b> OFD
                        </span>
                      ) : null}
                    </span>
                  </div>
                </div>

                {/* Repay */}
                <div className="space-y-2">
                  <div className="text-sm font-medium">Repay</div>
                  <div className="grid gap-2 md:grid-cols-[1fr_auto_auto] items-center">
                    <Input
                      placeholder="Amount to repay (OFD)"
                      value={repayAmt}
                      onChange={(e) => setRepayAmt(onlyNum(e.target.value))}
                      disabled={busy}
                    />
                    <Button
                      variant="outline"
                      onClick={() => {
                        const repay =
                          (details.minted *
                            BigInt(1_000_000 - details.reservePPM)) /
                          1_000_000n;
                        setRepayAmt(fmt18(repay, 6));
                      }}
                      disabled={busy}
                      title="Fill with the amount that typically closes the position"
                    >
                      <Shield size={14} />
                      <span className="ml-2">Close (est.)</span>
                    </Button>
                    <Button onClick={handleRepay} disabled={busy || !repayAmt}>
                      {busy ? "Repaying…" : "Repay"}
                    </Button>
                  </div>
                </div>

                {/* Withdraw */}
                <div className="space-y-2">
                  <div className="text-sm font-medium">Withdraw collateral</div>
                  <div className="grid gap-2 md:grid-cols-[1fr_auto_auto_auto] items-center">
                    <Input
                      placeholder={`Amount in ${details.collSymbol}`}
                      value={withdrawAmt}
                      onChange={(e) => setWithdrawAmt(onlyNum(e.target.value))}
                      disabled={busy}
                    />
                    <Button
                      variant="outline"
                      onClick={() => {
                        const num = details.minted * 10n ** 18n;
                        const reqByLiq =
                          (num + details.price - 1n) / details.price;
                        const required =
                          reqByLiq > details.minColl
                            ? reqByLiq
                            : details.minColl;
                        const safe =
                          details.collBal > required
                            ? details.collBal - required
                            : 0n;
                        setWithdrawAmt(fmtUnits(safe, details.collDecimals, 6));
                      }}
                      disabled={busy}
                      title="Max without risking liquidation (keeps position healthy)"
                    >
                      <TimerReset size={14} />
                      <span className="ml-2">Max safe</span>
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        setWithdrawAmt(
                          fmtUnits(details.collBal, details.collDecimals, 6)
                        )
                      }
                      disabled={busy}
                      title="Withdraw everything (may close if below minimum)"
                    >
                      <ArrowDownToLine size={14} />
                      <span className="ml-2">All</span>
                    </Button>
                    <Button
                      onClick={handleWithdraw}
                      disabled={busy || !withdrawAmt}
                    >
                      {busy ? "Withdrawing…" : "Withdraw"}
                    </Button>
                  </div>
                </div>

                {/* Adjust price */}
                <div className="space-y-2">
                  <div className="text-sm font-medium">Adjust price</div>
                  <div className="grid gap-2 md:grid-cols-[1fr_auto] items-center">
                    <Input
                      placeholder={`New price (OFD per 1 ${details.collSymbol})`}
                      value={newPrice}
                      onChange={(e) => setNewPrice(onlyNum(e.target.value))}
                      disabled={busy}
                    />
                    <Button
                      onClick={handleAdjustPrice}
                      disabled={busy || !newPrice}
                    >
                      {busy ? "Updating…" : "Update price"}
                    </Button>
                  </div>
                  <div className="text-[11px] text-[var(--muted)]">
                    Current:{" "}
                    <b>
                      {ethers.formatUnits(details.price, details.priceDecimals)}{" "}
                      OFD / 1 {details.collSymbol}
                    </b>
                    . Raising the price triggers a 3-day cooldown (minting
                    paused).
                  </div>
                </div>

                {/* Alerts */}
                {errMsg ? (
                  <div className="text-sm text-rose-600 break-all">
                    {errMsg}
                  </div>
                ) : okMsg ? (
                  <div className="text-sm text-emerald-600 break-all">
                    {okMsg}
                  </div>
                ) : null}
              </div>
            ) : (
              <>
                {/* Alerts for non-owner */}
                {errMsg ? (
                  <div className="text-sm text-rose-600 break-all">
                    {errMsg}
                  </div>
                ) : okMsg ? (
                  <div className="text-sm text-emerald-600 break-all">
                    {okMsg}
                  </div>
                ) : null}
                <div className="text-xs text-[var(--muted)]">
                  {details.owner === ethers.ZeroAddress
                    ? "Owner could not be resolved from RPC; owner actions hidden."
                    : "You’re not the owner. Owner actions are hidden."}
                </div>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
