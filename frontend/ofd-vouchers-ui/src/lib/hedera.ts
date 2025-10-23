// lib/hedera.ts
import {
  AccountAllowanceApproveTransaction,
  AccountBalanceQuery,
  AccountId,
  Client,
  ContractId,
  ContractInfoQuery,
  Hbar,
  TokenAssociateTransaction,
  TokenId,
  Transaction,
  TransactionId,
} from "@hashgraph/sdk";
import Long from "long";
import {
  HEDERA_NET,
  HederaJsonRpcMethod,
  getHederaAccountId,
  getEip155Provider,
} from "./appkit";

const NET = HEDERA_NET;
const VOFD = import.meta.env.VITE_VOFD as string;
const VOUCHER_MODULE = import.meta.env.VITE_VOUCHER_MODULE as string;

function nodeClient() {
  return NET === "mainnet" ? Client.forMainnet() : Client.forTestnet();
}

function withNodes<T extends Transaction>(t: T): T {
  if (NET !== "mainnet") {
    t.setNodeAccountIds([
      AccountId.fromString("0.0.3"),
      AccountId.fromString("0.0.4"),
      AccountId.fromString("0.0.5"),
      AccountId.fromString("0.0.6"),
    ]);
  }
  return t;
}

// ---------- Mirror helpers (free) ----------
function mirrorBase() {
  switch (NET) {
    case "mainnet":
      return "https://mainnet-public.mirrornode.hedera.com";
    default:
      return "https://testnet.mirrornode.hedera.com";
  }
}

async function fetchContractAccountIdFromMirror(
  evmAddress: string
): Promise<string> {
  // /api/v1/contracts/{idOrAddress} returns a single contract object
  const r = await fetch(`${mirrorBase()}/api/v1/contracts/${evmAddress}`);
  if (!r.ok) {
    throw new Error(
      `Mirror query failed for contract ${evmAddress} (${r.status})`
    );
  }
  const j = await r.json();
  const contractId: string | undefined = j.contract_id || j.contractId || j.id; // support possible shapes
  if (!contractId) {
    throw new Error(`Mirror response missing contract_id for ${evmAddress}`);
  }
  return contractId; // e.g. "0.0.123456"
}

function freezeForWallet<T extends Transaction>(t: T): T {
  const payer = getHederaAccountId();
  t.setTransactionId(TransactionId.generate(AccountId.fromString(payer)));
  withNodes(t);
  return t.freezeWith(nodeClient());
}
function bytesToBase64(bytes: Uint8Array) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

// Use the **same** session’s provider to call Hedera JSON-RPC
async function signAndExecute(txn: Transaction) {
  const accountId = getHederaAccountId();
  const transactionList = bytesToBase64(txn.toBytes());
  return await getEip155Provider().request({
    method: HederaJsonRpcMethod.SignAndExecuteTransaction,
    params: {
      signerAccountId: `hedera:${NET}:${accountId}`,
      transactionList,
    },
  });
}

// ---- APIs you already use ----
export async function fetchVOFDBalance(
  hederaAccountId: string
): Promise<bigint> {
  const ab = await new AccountBalanceQuery()
    .setAccountId(hederaAccountId)
    .execute(nodeClient());
  const tid = TokenId.fromEvmAddress(0, 0, VOFD);
  const raw = ab.tokens?.get(tid) ?? 0;
  return BigInt(typeof raw === "number" ? raw : (raw as Long).toString());
}

export async function hederaAssociateToken(hederaAccountId: string) {
  const tokenId = TokenId.fromEvmAddress(0, 0, VOFD);
  const txn = freezeForWallet(
    new TokenAssociateTransaction()
      .setAccountId(AccountId.fromString(hederaAccountId))
      .setTokenIds([tokenId])
      .setMaxTransactionFee(new Hbar(5))
  );
  return await signAndExecute(txn);
}

/** amountHOFDWei is 18d wei; contract converts 18->8, so approval must be multiple of 1e10. */
export function toVOFDInt64(amountHOFDWei: bigint): Long {
  if (amountHOFDWei % 10_000_000_000n !== 0n)
    throw new Error("Amount must be multiple of 1e10");
  const q = amountHOFDWei / 10_000_000_000n;
  const max = (1n << 63n) - 1n;
  if (q > max) throw new Error("VOFD int64 overflow");
  return Long.fromString(q.toString(), false);
}

export async function hederaApproveVOFDAllowance(
  hederaAccountId: string,
  amountHOFDWei: bigint
) {
  const amount = toVOFDInt64(amountHOFDWei);

  // ✅ Use Mirror Node to get the contract's account id (spender)
  const spenderAccountIdStr = await fetchContractAccountIdFromMirror(
    VOUCHER_MODULE
  );
  const spenderAccountId = AccountId.fromString(spenderAccountIdStr);

  const tokenId = TokenId.fromEvmAddress(0, 0, VOFD);

  const txn = freezeForWallet(
    new AccountAllowanceApproveTransaction()
      .approveTokenAllowance(
        tokenId,
        AccountId.fromString(hederaAccountId),
        spenderAccountId,
        amount
      )
      .setMaxTransactionFee(new Hbar(5))
  );

  return await signAndExecute(txn);
}
