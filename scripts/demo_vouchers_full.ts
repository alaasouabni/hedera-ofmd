/* eslint-disable no-console */
/**
 * End-to-end vouchers demo for Hedera:
 * - Creates Sponsor/Merchant/Supplier Hedera accounts (ECDSA), funds them
 * - Creates vOFD HTS token (if not already created)
 * - Associates, grants KYC+unfreezes, assigns roles
 * - hOFD flow: approve -> issue -> spend -> redeem
 *
 * Run:
 *   npx hardhat run --network hederaTestnet scripts/demo_vouchers_full.ts
 *
 * Required env:
 *   HEDERA_OPERATOR_ID=0.0.xxxx
 *   HEDERA_OPERATOR_KEY=302e0201... (or 302d0201... depending on format)
 */

import { ethers } from "hardhat";
import type { HardhatRuntimeEnvironment } from "hardhat/types";
import {
  AccountAllowanceApproveTransaction,
  AccountBalanceQuery,
  AccountCreateTransaction,
  AccountId,
  Client,
  ContractId,
  ContractInfoQuery,
  Hbar,
  PrivateKey,
  TokenAssociateTransaction,
  TokenId,
} from "@hashgraph/sdk";
import * as fs from "node:fs";
import * as path from "node:path";
import hre from "hardhat";

type NewAcct = {
  label: "SPONSOR" | "MERCHANT" | "SUPPLIER";
  accountId: string; // 0.0.x
  evmAddress: string; // 0x...
  privRaw: string; // 0x...
  pubHex: string; // 0x04...
};

async function main() {
  const {
    deployments: { get, getOrNull },
    ethers,
    network,
  } = hre;

  // convert 18-decimal hOFD amount to 8-decimal vOFD int64 units
  function toVUnitsInt64(amountHOFD: bigint): bigint {
    if (amountHOFD % 10_000_000_000n !== 0n) {
      throw new Error("amountHOFD must be multiple of 1e10 for 8-dec vOFD");
    }
    const v = amountHOFD / 10_000_000_000n; // 18 -> 8
    if (v > BigInt("9223372036854775807"))
      throw new Error("vOFD int64 overflow");
    return v;
  }
  // -------- Params (adjust if you want) --------
  const INIT_HBAR = 5; // each new account starts with 75 HBAR
  const ISSUE_HOFD = ethers.parseUnits("1000", 18); // sponsor backs 1000 hOFD
  const SPEND_HOFD = ethers.parseUnits("250", 18); // merchant spends 250 hOFD
  const REDEEM_HOFD = SPEND_HOFD; // supplier redeems the same

  // These amounts must be multiples of 1e10 (18 -> 8 decimals conversion inside contract)
  const mustBeMultiple1e10 = (x: bigint) => x % 10_000_000_000n === 0n;
  if (
    !mustBeMultiple1e10(ISSUE_HOFD) ||
    !mustBeMultiple1e10(SPEND_HOFD) ||
    !mustBeMultiple1e10(REDEEM_HOFD)
  ) {
    throw new Error(
      "Amounts must be multiples of 1e10 (contract converts 18->8 decimals)."
    );
  }

  // -------- Hedera SDK client (operator = deployer) --------
  const OPERATOR_ID = process.env.HEDERA_OPERATOR_ID;
  const OPERATOR_KEY = process.env.HEDERA_OPERATOR_KEY;
  if (!OPERATOR_ID || !OPERATOR_KEY) {
    throw new Error("Set HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY in env.");
  }

  const client = Client.forTestnet().setOperator(OPERATOR_ID, OPERATOR_KEY);

  // -------- Fetch deployed contracts --------
  const ofdDep = await get("OracleFreeDollar"); // hOFD ERC-20
  const voucherDep = await (async () => {
    const existing = await getOrNull("VoucherModuleHTS");
    if (!existing)
      throw new Error(
        "VoucherModuleHTS is not deployed. Please run your deploy first."
      );
    return existing;
  })();

  const hOFD = ofdDep.address;
  const voucherAddr = voucherDep.address;

  const [deployerSigner] = await ethers.getSigners();
  const deployerAddr = await deployerSigner.getAddress();
  console.log(`Network: ${network.name}`);
  console.log(`Deployer (operator) EVM address: ${deployerAddr}`);
  console.log(`hOFD: ${hOFD}`);
  console.log(`VoucherModuleHTS: ${voucherAddr}`);

  const voucher = await ethers.getContractAt(
    "VoucherModuleHTS",
    voucherAddr,
    deployerSigner
  );

  // -------- Create new Hedera accounts: Sponsor, Merchant, Supplier --------
  const mkAccount = async (label: NewAcct["label"]): Promise<NewAcct> => {
    // ECDSA (secp256k1) for EVM addressability
    const priv = PrivateKey.generateECDSA(); // IMPORTANT: ECDSA (not ED25519)
    const pub = priv.publicKey;
    const tx = await new AccountCreateTransaction()
      .setECDSAKeyWithAlias(pub)
      .setInitialBalance(new Hbar(INIT_HBAR))
      .execute(client);
    const receipt = await tx.getReceipt(client);
    const accountId = receipt.accountId!.toString();

    // Derive EVM address from raw secp256k1 private key via ethers
    const privRawHex = "0x" + priv.toStringRaw(); // raw 32-byte hex
    const evmAddress = ethers.computeAddress(privRawHex);

    console.log(`Created ${label}`);
    console.log(`  AccountId: ${accountId}`);
    console.log(`  EVM addr : ${evmAddress}`);
    console.log(`  PrivKey  : ${privRawHex}`);
    console.log(`  PubKey   : 0x${pub.toStringRaw()}`);

    return {
      label,
      accountId,
      evmAddress,
      privRaw: privRawHex,
      pubHex: "0x" + pub.toStringRaw(),
    };
  };

  const sponsor = await mkAccount("SPONSOR");
  const merchant = await mkAccount("MERCHANT");
  const supplier = await mkAccount("SUPPLIER");

  // Save keys to a local file for you to keep
  const outPath = path.join(process.cwd(), "scripts", "out");
  fs.mkdirSync(outPath, { recursive: true });
  const outFile = path.join(outPath, `hedera-demo-accounts-${Date.now()}.json`);
  fs.writeFileSync(
    outFile,
    JSON.stringify({ sponsor, merchant, supplier }, null, 2)
  );
  console.log(`\nSaved new account credentials to:\n  ${outFile}\n`);

  // EVM wallets for on-chain (EVM) calls
  const sponsorWallet = new ethers.Wallet(sponsor.privRaw, ethers.provider);
  const merchantWallet = new ethers.Wallet(merchant.privRaw, ethers.provider);
  const supplierWallet = new ethers.Wallet(supplier.privRaw, ethers.provider);

  // -------- Create HTS token (vOFD) if not yet created --------
  let vOFDAddr = await voucher.vOFD();
  if (vOFDAddr === ethers.ZeroAddress) {
    console.log("Creating HTS vOFD via createVoucherToken()...");
    // Give a generous gas limit (HTS create is heavy) and send some HBAR for internal fees.
    const tx = await voucher.createVoucherToken({
      gasLimit: 12_000_000n,
      value: ethers.parseEther("10"), // covers precompile fee
    });
    await tx.wait();
    vOFDAddr = await voucher.vOFD();
    console.log("  vOFD created:", vOFDAddr);
  } else {
    console.log("vOFD already created:", vOFDAddr);
  }

  // Convert solidity address -> TokenId for SDK association
  const vOFDTokenId = TokenId.fromEvmAddress(0, 0, vOFDAddr).toString();
  console.log("vOFD TokenId:", vOFDTokenId);

  // -------- Associate Merchant & Supplier to HTS (vOFD) --------
  const associate = async (who: NewAcct) => {
    const assoc = await new TokenAssociateTransaction()
      .setAccountId(who.accountId)
      .setTokenIds([TokenId.fromEvmAddress(0, 0, vOFDAddr)])
      .freezeWith(client);

    // sign with that account's private key
    const acctPriv = PrivateKey.fromStringECDSA(who.privRaw);
    const signed = await assoc.sign(acctPriv);
    const sub = await signed.execute(client);
    const rec = await sub.getReceipt(client);
    if (rec.status.toString() !== "SUCCESS") {
      throw new Error(
        `${who.label} association failed: ${rec.status.toString()}`
      );
    }
    console.log(`Associated vOFD -> ${who.label} (${who.accountId})`);
  };

  await associate(merchant);
  await associate(supplier);

  // -------- Assign roles & KYC + unfreeze (owner-only) --------
  console.log("\nAssigning roles...");
  await (await voucher.setRole(sponsor.evmAddress, "sponsor", true)).wait();
  await (await voucher.setRole(merchant.evmAddress, "merchant", true)).wait();
  await (await voucher.setRole(supplier.evmAddress, "supplier", true)).wait();

  console.log("Granting KYC + unfreeze...");
  await (
    await voucher.grantKycAndUnfreeze(merchant.evmAddress, {
      gasLimit: 1_000_000n,
    })
  ).wait();
  await (
    await voucher.grantKycAndUnfreeze(supplier.evmAddress, {
      gasLimit: 1_000_000n,
    })
  ).wait();

  // -------- Ensure Sponsor has hOFD; transfer from deployer to Sponsor --------
  const ofd = await ethers.getContractAt(
    "OracleFreeDollar",
    hOFD,
    deployerSigner
  );
  const deployerH = await ofd.balanceOf(deployerAddr);
  if (deployerH < ISSUE_HOFD) {
    console.log(
      `\nDeployer hOFD: ${ethers.formatUnits(
        deployerH,
        18
      )} (need ${ethers.formatUnits(ISSUE_HOFD, 18)})`
    );
    throw new Error(
      "Not enough hOFD in deployer to back issuance. Top up and re-run."
    );
  }
  console.log(
    `\nTransferring ${ethers.formatUnits(ISSUE_HOFD, 18)} hOFD -> SPONSOR (${
      sponsor.evmAddress
    })`
  );
  await (await ofd.transfer(sponsor.evmAddress, ISSUE_HOFD)).wait();

  // Sponsor approves the module to pull hOFD
  const ofdSponsor = ofd.connect(sponsorWallet);
  console.log("Sponsor approves module to spend hOFD...");
  await (await ofdSponsor.approve(voucherAddr, ISSUE_HOFD)).wait();

  // -------- ISSUE: Sponsor -> (module mints) -> Merchant --------
  const voucherSponsor = voucher.connect(sponsorWallet);
  console.log(
    `\nISSUE: Sponsor issues ${ethers.formatUnits(
      ISSUE_HOFD,
      18
    )} hOFD worth of vOFD to Merchant`
  );
  await (
    await voucherSponsor.issueVoucher(merchant.evmAddress, ISSUE_HOFD, {
      gasLimit: 3_000_000n,
    })
  ).wait();

  // --------------------------------------------------------------------------
  // 5) Merchant gives Crypto Allowance to VoucherModuleHTS for SPEND amount
  // --------------------------------------------------------------------------
  const vSpend = toVUnitsInt64(SPEND_HOFD); // int64
  // after you have voucherDep.address and the Hedera client:
  const voucherContractId = ContractId.fromEvmAddress(0, 0, voucherDep.address);

  // ask the network for the contract’s underlying accountId (the spender you must use)
  const voucherInfo = await new ContractInfoQuery()
    .setContractId(voucherContractId)
    .execute(client);

  const voucherSpenderAccountId = voucherInfo.accountId!;
  console.log(
    `Voucher contract spender AccountId: ${voucherSpenderAccountId.toString()}`
  );

  await (
    await new AccountAllowanceApproveTransaction()
      .approveTokenAllowance(
        vOFDTokenId,
        merchant.accountId,
        voucherSpenderAccountId,
        Number(vSpend)
      ) // int64 fits in JS number for demo amounts
      .freezeWith(client)
      .sign(PrivateKey.fromStringECDSA(merchant.privRaw))
  )
    .execute(client)
    .then((r) => r.getReceipt(client));
  console.log(
    `Merchant approved Crypto Allowance: ${SPEND_HOFD} hOFD worth (${vSpend} vOFD units) to the VoucherModuleHTS`
  );

  // -------- SPEND: Merchant -> Supplier (HTS transfer) --------
  const voucherMerchant = voucher.connect(merchantWallet);

  console.log(
    `SPEND: Merchant spends ${ethers.formatUnits(
      SPEND_HOFD,
      18
    )} vOFD to Supplier`
  );
  await (
    await voucherMerchant.spendVoucher(supplier.evmAddress, SPEND_HOFD, {
      gasLimit: 2_000_000n,
    })
  ).wait();

  // --------------------------------------------------------------------------
  // 6) Supplier gives Crypto Allowance to VoucherModuleHTS for REDEEM amount
  // --------------------------------------------------------------------------
  const vRedeem = toVUnitsInt64(REDEEM_HOFD);
  await (
    await new AccountAllowanceApproveTransaction()
      .approveTokenAllowance(
        vOFDTokenId,
        supplier.accountId,
        voucherSpenderAccountId,
        Number(vRedeem)
      )
      .freezeWith(client)
      .sign(PrivateKey.fromStringECDSA(supplier.privRaw))
  )
    .execute(client)
    .then((r) => r.getReceipt(client));
  console.log(
    `Supplier approved Crypto Allowance: ${REDEEM_HOFD} hOFD worth (${vRedeem} vOFD units) to the VoucherModuleHTS`
  );

  // -------- REDEEM: Supplier -> net hOFD, fee to treasury --------
  const voucherSupplier = voucher.connect(supplierWallet);
  console.log(
    `REDEEM: Supplier redeems ${ethers.formatUnits(REDEEM_HOFD, 18)} vOFD`
  );
  await (
    await voucherSupplier.redeem(REDEEM_HOFD, { gasLimit: 3_000_000n })
  ).wait();

  // -------- Show balances --------
  const bal = async (addr: string) =>
    ethers.formatUnits(await ofd.balanceOf(addr), 18);
  const sponsorH = await bal(sponsor.evmAddress);
  const merchantH = await bal(merchant.evmAddress);
  const supplierH = await bal(supplier.evmAddress);
  const moduleH = await bal(voucherAddr);
  console.log("\n=== hOFD (ERC-20) balances ===");
  console.log("  Sponsor :", sponsorH);
  console.log("  Merchant:", merchantH);
  console.log("  Supplier:", supplierH);
  console.log("  Module  :", moduleH);

  const vBal = async (who: NewAcct) => {
    const ab = await new AccountBalanceQuery()
      .setAccountId(who.accountId)
      .execute(client);
    const tid = TokenId.fromEvmAddress(0, 0, vOFDAddr);
    const raw = ab.tokens?.get(tid) ?? 0;
    // vOFD has 8 decimals – present human value:
    return Number(raw) / 1e8;
    // NB: SDK balances are int64, appropriate for demo amounts
  };

  console.log("\n=== vOFD (HTS) balances ===");
  console.log("  Sponsor (treasury holds minted until transfer): N/A");
  console.log("  Merchant:", await vBal(merchant));
  console.log("  Supplier:", await vBal(supplier));
  console.log("\nDONE ✅");
}

// hardhat runner
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
