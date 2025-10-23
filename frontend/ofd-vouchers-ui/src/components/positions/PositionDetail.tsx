// components/positions/PositionDetailsCard.tsx
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

// ── ENV ───────────────────────────────────────────────────────────────────────
const RPC = import.meta.env.VITE_EVM_RPC as string;
const EXPLORER_TX = import.meta.env.VITE_EXPLORER_TX as string | undefined;
const MINTING_HUB = import.meta.env.VITE_MINTING_HUB as string;
const DEPLOY_BLOCK = Number(import.meta.env.VITE_MINTING_HUB_DEPLOY_BLOCK || 0);

// ── Tunables & anti-429 ──────────────────────────────────────────────────────
const RATE_LIMIT_DELAY_MS = Number(
  import.meta.env.VITE_RATE_LIMIT_DELAY_MS || 250
);
const MAX_RETRIES = Number(import.meta.env.VITE_MAX_RETRIES || 5);
const DEFAULT_BACKSCAN = Number(
  import.meta.env.VITE_BACKSCAN_BLOCKS || 250_000
);
const CHUNK_SIZE = Number(import.meta.env.VITE_LOG_CHUNK_SIZE || 2_000);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function withBackoff<T>(fn: () => Promise<T>, label = "rpc"): Promise<T> {
  let delay = RATE_LIMIT_DELAY_MS;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      const code = e?.status ?? e?.code;
      const isRate = code === 429 || /429|rate|limit/i.test(msg);
      if (!isRate || attempt === MAX_RETRIES) throw e;
      await sleep(delay + Math.floor(Math.random() * delay)); // jitter
      delay *= 2;
    }
  }
  throw new Error(`${label} backoff failed`);
}

const assertHasCode = async (
  provider: ethers.Provider,
  addr: string,
  label: string
) => {
  const code = await withBackoff(
    () => provider.getCode(addr),
    `${label}.getCode`
  );
  if (!code || code === "0x")
    throw new Error(`${label} has no code at ${addr}`);
};

// ── ABIs ─────────────────────────────────────────────────────────────────────
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

  // events we scan
  "event PositionOpened(address indexed owner, address indexed position, address original, address collateral)",
  "event ChallengeStarted(address indexed challenger, address indexed position, uint256 size, uint256 number)",
];

const topicPositionOpened = ethers.id(
  "PositionOpened(address,address,address,address)"
);
const topicChallengeStarted = ethers.id(
  "ChallengeStarted(address,address,uint256,uint256)"
);

const toTopicAddress = (addr: string) =>
  ethers.zeroPadValue(ethers.getAddress(addr), 32);

// ── Types & utils ────────────────────────────────────────────────────────────
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
  const provider = useMemo(
    () => new ethers.JsonRpcProvider(RPC, undefined, { batchMaxCount: 20 }),
    []
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

  // challenge/auction state
  const hub = useMemo(
    () => new ethers.Contract(MINTING_HUB, hubAbi, provider),
    [provider]
  );
  const [liqPrice, setLiqPrice] = useState<bigint | null>(null);
  const [avertPhase, setAvertPhase] = useState<number>(0);
  const [openChallenges, setOpenChallenges] = useState<OpenChallenge[]>([]);
  const [challengeAmt, setChallengeAmt] = useState(""); // collateral amount to challenge
  const [challengeMinPrice, setChallengeMinPrice] = useState(""); // OFD per 1 coll (normalized to priceDecimals)
  const [bidSize, setBidSize] = useState<Record<number, string>>({});
  const [bidPostpone, setBidPostpone] = useState<Record<number, boolean>>({});
  const [pendingReturn, setPendingReturn] = useState<bigint>(0n);
  const [expiredPrice, setExpiredPrice] = useState<bigint | null>(null);
  const [expiredBuyAmt, setExpiredBuyAmt] = useState("");

  // ── Owner fallback via PositionOpened (same as before) ─────────────────────
  const fetchOwnerFromEvent = useCallback(
    async (posAddr: string): Promise<string | null> => {
      try {
        const latest = await withBackoff(
          () => provider.getBlockNumber(),
          "getBlockNumber"
        );
        const from =
          DEPLOY_BLOCK > 0
            ? Math.max(DEPLOY_BLOCK, latest - DEFAULT_BACKSCAN)
            : Math.max(0, latest - DEFAULT_BACKSCAN);
        const to = latest;

        for (let start = from; start <= to; start += CHUNK_SIZE) {
          const end = Math.min(start + CHUNK_SIZE - 1, to);
          const logs = await withBackoff(
            () =>
              provider.getLogs({
                address: MINTING_HUB,
                fromBlock: start,
                toBlock: end,
                topics: [topicPositionOpened, null, toTopicAddress(posAddr)],
              }),
            `getLogs owner [${start}-${end}]`
          );
          if (logs.length) {
            const iface = new ethers.Interface(hubAbi);
            for (const lg of logs) {
              try {
                const parsed = iface.parseLog(lg);
                const owner: string = (parsed?.args as any).owner;
                return ethers.getAddress(owner);
              } catch {}
            }
          }
          if (start + CHUNK_SIZE <= to) await sleep(25);
        }
        return null;
      } catch {
        return null;
      }
    },
    [provider]
  );

  // ── Load details ───────────────────────────────────────────────────────────
  const loadDetails = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    setDetails(null);
    setOkMsg(null);
    setErrMsg(null);

    try {
      const posAddr = ethers.getAddress(positionAddress);
      await assertHasCode(provider, posAddr, "Position");
      const pos = new ethers.Contract(posAddr, positionAbi, provider);

      // resolve owner robustly
      let owner: string | null = null;
      try {
        owner = await withBackoff(
          () => pos.owner({ blockTag: "latest" } as any),
          "pos.owner(latest)"
        );
      } catch {
        try {
          owner = await withBackoff(
            () => pos.owner({ blockTag: "safe" } as any),
            "pos.owner(safe)"
          );
        } catch {
          owner = await fetchOwnerFromEvent(posAddr);
        }
      }
      if (!owner) owner = ethers.ZeroAddress;

      // main reads
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
        ofdAddr,
        collateralAddr,
        chData,
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
        withBackoff(() => pos.ofd(), "pos.ofd"),
        withBackoff(() => pos.collateral(), "pos.collateral"),
        withBackoff(() => pos.challengeData(), "pos.challengeData"),
      ]);

      await assertHasCode(provider, collateralAddr, "Collateral");
      const token = new ethers.Contract(collateralAddr, erc20Abi, provider);
      const [collBal, collDecimals, collSymbol] = await Promise.all([
        withBackoff(() => token.balanceOf(posAddr), "token.balanceOf"),
        withBackoff(() => token.decimals(), "token.decimals"),
        withBackoff(() => token.symbol().catch(() => "COLL"), "token.symbol"),
      ]);

      const priceDecimals = 36 - Number(collDecimals);

      setDetails({
        owner,
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
        ofdAddr,
        collateral: collateralAddr,
        collBal,
        collDecimals: Number(collDecimals),
        collSymbol,
        priceDecimals,
      });

      // challenge meta for UI
      const [liq, phase] = chData as [bigint, number];
      setLiqPrice(liq);
      setAvertPhase(Number(phase));

      // default min price for starting a challenge
      setChallengeMinPrice(ethers.formatUnits(price, priceDecimals));

      // expired purchase price (for convenience)
      const exPrice = await withBackoff(
        () => hub.expiredPurchasePrice(posAddr),
        "expiredPurchasePrice"
      );
      setExpiredPrice(exPrice);

      // pending returns (if signed in)
      if (evm?.address) {
        const pr = await withBackoff(
          () => hub.pendingReturns(collateralAddr, evm.address),
          "pendingReturns"
        );
        setPendingReturn(pr as bigint);
      }
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (/missing revert data/i.test(msg) && /0x8da5cb5b/i.test(msg)) {
        setLoadErr(
          "Owner lookup failed on the RPC. Please refresh; falling back shortly."
        );
      } else {
        setLoadErr(e?.reason ?? e?.shortMessage ?? e?.message ?? String(e));
      }
    } finally {
      setLoading(false);
    }
  }, [positionAddress, provider, fetchOwnerFromEvent, hub, evm?.address]);

  useEffect(() => {
    if (!positionAddress) {
      setLoadErr("Missing position address");
      setLoading(false);
      return;
    }
    void loadDetails();
  }, [positionAddress, loadDetails]);

  const isMine =
    !!details &&
    !!evm?.address &&
    details.owner !== ethers.ZeroAddress &&
    details.owner.toLowerCase() === evm.address.toLowerCase();

  // ── Load open challenges for this position ─────────────────────────────────
  const loadChallenges = useCallback(async () => {
    if (!positionAddress) return;
    const posAddr = ethers.getAddress(positionAddress);

    try {
      const latest = await withBackoff(
        () => provider.getBlockNumber(),
        "getBlockNumber"
      );
      const from =
        DEPLOY_BLOCK > 0
          ? Math.max(DEPLOY_BLOCK, latest - DEFAULT_BACKSCAN)
          : Math.max(0, latest - DEFAULT_BACKSCAN);
      const to = latest;

      const numbers = new Set<number>();
      const iface = new ethers.Interface(hubAbi);

      for (let start = from; start <= to; start += CHUNK_SIZE) {
        const end = Math.min(start + CHUNK_SIZE - 1, to);
        const logs = await withBackoff(
          () =>
            provider.getLogs({
              address: MINTING_HUB,
              fromBlock: start,
              toBlock: end,
              topics: [topicChallengeStarted, null, toTopicAddress(posAddr)],
            }),
          `getLogs ChallengeStarted [${start}-${end}]`
        );
        for (const lg of logs) {
          try {
            const parsed = iface.parseLog(lg);
            const num = Number((parsed?.args as any).number);
            numbers.add(num);
          } catch {}
        }
        if (start + CHUNK_SIZE <= to) await sleep(20);
      }

      // Probe on-chain current state for each challenge number
      const arr: OpenChallenge[] = [];
      await Promise.all(
        [...numbers].map(async (num) => {
          const c = await withBackoff(
            () => hub.challenges(num),
            `hub.challenges(${num})`
          );
          const [challenger, start, position, size] = c as [
            string,
            number,
            string,
            bigint
          ];
          if (
            challenger !== ethers.ZeroAddress &&
            position.toLowerCase() === posAddr.toLowerCase() &&
            (size as bigint) > 0n
          ) {
            const currentPrice: bigint = await withBackoff(
              () => hub.price(num),
              `hub.price(${num})`
            );
            arr.push({
              number: num,
              challenger,
              start: Number(start),
              size: size as bigint,
              currentPrice,
            });
          }
        })
      );

      // sort newest first
      arr.sort((a, b) => b.start - a.start);
      setOpenChallenges(arr);
    } catch (e) {
      // non-fatal
      console.warn("loadChallenges error:", e);
      setOpenChallenges([]);
    }
  }, [positionAddress, provider, hub]);

  useEffect(() => {
    void loadChallenges();
  }, [loadChallenges]);

  // ── Allowance helper ───────────────────────────────────────────────────────
  const ensureAllowance = useCallback(
    async (
      tokenAddr: string,
      owner: string,
      spender: string,
      needed: bigint
    ) => {
      const signer = await evmWrite();
      const erc20 = new ethers.Contract(tokenAddr, erc20Abi, signer);
      const current: bigint = await withBackoff(
        () => erc20.allowance(owner, spender),
        "erc20.allowance"
      );
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

  // ── Owner actions (unchanged) ──────────────────────────────────────────────
  const previewNetMint = useCallback(
    async (grossStr: string) => {
      try {
        const gross = ethers.parseUnits(grossStr || "0", 18);
        if (!details || gross === 0n) return "0";
        const pos = new ethers.Contract(positionAddress, positionAbi, provider);
        const net: bigint = await withBackoff(
          () => pos.getUsableMint(gross, true),
          "getUsableMint"
        );
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
        const gross: bigint = await withBackoff(
          () => pos.getMintAmount(net),
          "getMintAmount"
        );
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

  const computeMaxSafeWithdraw = useCallback(() => {
    if (!details) return 0n;
    const { collBal, price, minColl, minted } = details;
    if (minted === 0n) return collBal;
    const num = minted * 10n ** 18n;
    const reqByLiq = (num + price - 1n) / price;
    const required = reqByLiq > minColl ? reqByLiq : minColl;
    return collBal > required ? collBal - required : 0n;
  }, [details]);

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

  // ── Challenge actions ──────────────────────────────────────────────────────
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
      // Approve collateral to hub (collateral is transferred to hub on challenge)
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
      // Try to read return value (ethers v6 returns in "result") — fallback to event toast
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
        // Compute current price and expected OFD offer
        const p: bigint = await withBackoff(
          () => hub.price(num),
          `hub.price(${num})`
        );
        // offer has 18 decimals after (price * size) / 1e18
        const offer = (p * size) / 10n ** 18n;

        // Approve OFD to hub for the offer (avert-phase also uses hub as spender)
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
      // The challenger can "cancel" for free during the avert window by calling bid(num, size, false)
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
      const pr = await withBackoff(
        () => hub.pendingReturns(details.collateral, evm.address),
        "pendingReturns"
      );
      setPendingReturn(pr as bigint);
      await loadChallenges();
      await loadDetails();
    } catch (e: any) {
      setErrMsg(e?.reason ?? e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }, [details, evm?.address, pendingReturn, hub, loadChallenges, loadDetails]);

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
      const priceNow: bigint = await withBackoff(
        () => hub.expiredPurchasePrice(positionAddress),
        "expiredPurchasePrice"
      );
      const cost = (priceNow * amt) / 10n ** 18n; // 18d OFD
      // Approve OFD to the **position** (pos.forceSale will pull)
      await ensureAllowance(
        details.ofdAddr,
        evm.address,
        positionAddress,
        cost
      );

      const signer = await evmWrite();
      const hubWriter = new ethers.Contract(MINTING_HUB, hubAbi, signer);
      const tx = await hubWriter.buyExpiredCollateral(positionAddress, amt);
      const rc = await tx.wait();
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

  // ── Render ─────────────────────────────────────────────────────────────────
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
                          const m: bigint = await withBackoff(
                            () => pos.availableForMinting(),
                            "availableForMinting"
                          );
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
