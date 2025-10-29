# Oracle‑Free Merchant Dollar (OFMD) on Hedera
<p align="center">
  <img src="https://github.com/user-attachments/assets/883b7fe1-fcd0-4d85-b6c5-75d2a724cb1a" width="520" height="520" alt="ofmd_logo" />
</p>

**OFMD** adapts the **Oracle‑Free Dollar (OFD)** model to Hedera with two rails:

- **hOFD** — an oracle‑free, USD‑denominated stablecoin minted against collateral via EVM contracts.
- **vOFD** — a spend‑restricted **Hedera Token Service (HTS)** voucher used in a closed merchant–supplier loop and redeemed 1:1 for hOFD.

> **MVP Status**
>
> - ✅ hOFD smart contracts on **Hedera Testnet** (mint/borrow + challenge/auction logic)
> - ✅ **vOFD** voucher module (HTS) for **direct issuance to a specific merchant** by a Sponsor
> - ✅ UI for positions (open/borrow/challenge) and full vOFD flow (issue → spend → redeem)
> - ✅ Backend indexer (Hedera events → PostgreSQL) with REST API
> - ✳ OFDPS (governance) contract **deployed** but **not yet integrated** into the UI/backend

[Pitch Deck](https://www.canva.com/design/DAG2iN6LR9c/fa2n7LV_gaMaxS3PMav03g/view?utm_content=DAG2iN6LR9c&utm_campaign=designshare&utm_medium=link2&utm_source=uniquelinks&utlId=hfd428d48e5)
<p></p>

[Hedera Course Certificate](https://drive.google.com/file/d/1a9MHgjBEtruHSXc8avbS1lNoyR4vzgz1/view?usp=sharing)

---

## Table of Contents

- [1. Executive Summary](#1-executive-summary)
- [2. Problem & Idea (Business)](#2-problem--idea-business)
- [3. Key Features (MVP)](#3-key-features-mvp)
- [4. Why Oracle‑Free & Why Hedera](#4-why-oracle-free--why-hedera)
- [5. How It Works (End‑to‑End)](#5-how-it-works-end-to-end)
- [6. Architecture](#6-architecture)
- [7. Repository Structure](#7-repository-structure)
- [8. Smart Contracts & Addresses (Testnet)](#8-smart-contracts--addresses-testnet)
- [9. Quickstart (Dev)](#9-quickstart-dev)
  - [9.1 Prerequisites](#91-prerequisites)
  - [9.2 Install](#92-install)
  - [9.3 Environment](#93-environment)
  - [9.4 Contracts](#94-contracts)
  - [9.5 Backend (Indexer + API)](#95-backend-indexer--api)
  - [9.6 Frontend](#96-frontend)
- [10. Using the MVP (Demo Guide)](#10-using-the-mvp-demo-guide)
- [11. Business Model](#11-business-model)
- [12. Risk & Controls](#12-risk--controls)
- [13. Regulatory Position (MiCA) — Non‑Legal Summary](#13-regulatory-position-mica--non-legal-summary)
- [14. Go‑to‑Market (Africa‑First)](#14-go-to-market-africa-first)
- [15. Roadmap](#15-roadmap)
- [16. Known Limitations](#16-known-limitations)
- [17. Troubleshooting](#17-troubleshooting)
- [18. Contributing, Security, License](#18-contributing-security-license)
- [19. References](#19-references)

---

## 1. Executive Summary

**OFMD** enables programmatic, purpose‑bound working‑capital credit on Hedera. Sponsors mint **hOFD** against collateral and **issue vOFD directly to specific merchants**. Merchants pay allow‑listed suppliers in vOFD; suppliers redeem instantly for **hOFD**. The base layer is **oracle‑free**, inspired by OFD/Frankencoin challenge/auction design, while the HTS voucher layer enforces a closed‑loop spend scope suitable for business flows and MiCA limited‑network positioning.

---

## 2. Problem & Idea (Business)

SME working capital across emerging markets is costly, manual, and slow. Distributors extend informal credit; merchants delay payments; suppliers face cash gaps. **OFMD** provides:

- **Programmable credit:** vOFD vouchers are spend‑restricted and redeemable 1:1 for hOFD.
- **Instant settlement:** Suppliers receive hOFD immediately on redemption.
- **Auditability:** An indexer captures all on‑chain events for analytics and reconciliation.
- **Resilience:** Oracle‑free stability removes a common centralization failure point.

---

## 3. Key Features (MVP)

- **hOFD EVM contracts:** Borrow/mint vs. collateral + challenge/auction liquidations (oracle‑free).
- **vOFD voucher module (HTS):** **Direct issuance to a chosen merchant**, spend to allow‑listed suppliers, instant redemption to hOFD, MDR capture.
- **Frontend:** Positions dashboard (open/borrow/challenge) + full vOFD lifecycle (issue → spend → redeem).
- **Backend indexer:** Streams Hedera events → stores in **PostgreSQL** → REST API for fast/consistent reads.

---
<a id="4-why-oracle-free--why-hedera"></a>
## 4. Why Oracle‑Free & Why Hedera

- **Oracle‑free stability:** Prices are discovered via **challenge/auction** on under‑safe positions — **no external price feeds** — mitigating a key centralization risk.
- **Hedera’s HTS + EVM:** **HTS precompiles** are callable from EVM contracts to perform native token lifecycle ops (create/mint/burn/grantKyc/freeze/unfreeze/transfer). Finality and predictable low fees suit high‑velocity, merchant‑grade payments.

---
<a id="5-how-it-works-end-to-end"></a>
## 5. How It Works (End‑to‑End)

1. **Borrow & Mint (hOFD).** A **Sponsor** locks collateral in EVM contracts and mints **hOFD** (oracle‑free).
2. **Disburse Credit (vOFD).** The Sponsor **converts hOFD to vOFD and issues it directly to a specific merchant** through the HTS voucher module (roles/KYC/allow‑lists enforced at HTS level).
3. **Spend & Redeem.** The merchant **spends vOFD** at allow‑listed suppliers; suppliers **redeem vOFD → receive hOFD** instantly. A **merchant discount rate (MDR)** is captured on redemption.
4. **Indexing & Audit.** The backend indexer streams Hedera events, persists them to **PostgreSQL**, and exposes a REST API for analytics and dashboards.
5. **Challenge/Auction.** Any under‑safe position can be **challenged**; auctions liquidate collateral at market‑clearing prices, keeping the system **oracle‑free**.

---

## 6. Architecture


<img width="1350" height="1177" alt="OFMD" src="https://github.com/user-attachments/assets/47041fb4-db39-401f-9c02-4bde6f535b3e" />


**Components**

- **EVM contracts:** `MintingHub`, `Position`, `Auction`, `hOFD`, `OFDPS` (governance; deployed, not yet wired to UI).
- **HTS Wrapper:** `VoucherModuleHTS` **issues vOFD directly to a merchant**, enforces scope via HTS KYC/freeze/allow‑lists, and captures MDR on redemption.
- **Backend Indexer:** Listens to Hedera events → normalizes to **PostgreSQL** → serves REST API.
- **Frontend:** Positions dashboard (borrow/challenge) + full **vOFD** lifecycle (issue → spend → redeem).

**Tech Stacks**

- *Contracts:* Solidity, Hardhat, TypeScript, OpenZeppelin, Hedera SDK
- *Backend:* Node.js, TypeScript, Fastify, Prisma, PostgreSQL, ethers.js
- *Frontend:* React, TypeScript, Vite, TailwindCSS, Hedera Wallet Connect, ethers.js

---

## 7. Repository Structure

```
├── backend/              # Indexer + REST API
├── frontend/
│   └── ofd-vouchers-ui/  # React UI for positions & vOFD
└── hedera-contracts/     # Solidity contracts (hOFD, positions/auctions, voucher module, etc.)
```

---

## 8. Smart Contracts & Addresses (Testnet)

> **Network:** Hedera **Testnet** (for demo). Addresses may rotate;

- **MintingHub** — position creation, collateral mgmt, hOFD minting, challenge/auction triggers  
  [`0xDb322914648dc65d06f7b6A14691e41f0A4414eB`  /  `0.0.6964608`](https://hashscan.io/testnet/contract/0.0.6964608)

- **VoucherModuleHTS (vOFD)** — **direct merchant issuance**, spend, redemption, MDR capture, KYC/freeze/allow‑lists  
  [`0xDA2aE91e74cefA856F9b2Cea3ff068BcFa10da7C`  /  `0.0.6968436`](https://hashscan.io/testnet/contract/0.0.6968436)

_Other contracts (`Position`, `Auction`, `hOFD`, `OFDPS`) are deployed on testnet and referenced in the repo._

---

## 9. Quickstart (Dev)

### 9.1 Prerequisites

- Node.js ≥ 22, Docker & Docker Compose, Git, npm or yarn  
- Hedera **testnet** account & keys (for deployments)

### 9.2 Install

```bash
git clone https://github.com/alaasouabni/hedera-ofmd.git
cd hedera-ofmd

# Contracts
cd hedera-contracts && yarn

# Backend
cd ../backend && yarn

# Frontend
cd ../frontend/ofd-vouchers-ui && yarn
```

### 9.3 Environment

**Contracts**

```bash
cd hedera-contracts
cp .env.example .env
# Fill: PRIVATE_KEY, RPC_URL (Hedera testnet), etc.
```

**Backend**

```bash
cd backend
cp .env.example .env
# DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ofd_indexer?schema=public"
# HEDERA_RPC_URL=...
# START_BLOCK=... (optional)
```

**Frontend**

```bash
cd frontend/ofd-vouchers-ui
cp .env.example .env
# VITE_RPC_URL=...
# VITE_BACKEND_URL=http://localhost:3000
# VITE_MINTING_HUB=0x...
# VITE_VOUCHER_MODULE=0x...
```

### 9.4 Contracts

```bash
cd hedera-contracts
yarn test
yarn run deploy:network hederaTestnet
```

### 9.5 Backend (Indexer + API)

```bash
cd backend
docker-compose up -d
yarn run prisma:generate
yarn run prisma:migrate
yarn run dev          # http://localhost:3000
# optional: yarn run prisma:studio
```

### 9.6 Frontend

```bash
cd frontend/ofd-vouchers-ui
yarn run dev          # http://localhost:5173
```

---

## 10. Using the MVP (Demo Guide)

**Positions (hOFD)**

1. Connect wallet → **open position** with collateral (WHBAR, a mock token, or paste any ERC‑20‑like testnet address).  
2. **Borrow hOFD** and view position health.  
3. **Challenge** an under‑safe position (triggers auction).

**Vouchers (vOFD, HTS)**
> - Admin (address set in the env file) assigns roles, grants KYC, Freezes/Unfreezes Tokens. It is necessary to assign role + grant KYC & Unfreeze for an actor (sponsor, merchant, supplier) to interact with vOFD.
> - If the merchant/ supplier accounts are not set to auto-associate with tokens at wallet account creation, make sure to click the button associate vOFD in order to accept vOFD transfers.
1. **Issue vOFD directly to a merchant** (Sponsor role required).  
2. Merchant **spends** vOFD at allow‑listed suppliers (HTS KYC/freeze may apply).  
3. Supplier **redeems** vOFD → receives **hOFD** (MDR fee captured).  
4. Backend indexer shows live events/history in the UI.

---

## 11. Business Model

- **Protocol:** Minting fee on **hOFD** issuance; redemption/liquidation fees accrue to governance (**OFDPS**).
- **Sponsors:** **MDR 0.35–0.75%** on supplier redemptions; **1–2%** working‑capital fee per 30‑day credit cycle.
- **Merchants/Suppliers:** Instant settlement; lower cost vs. card rails or informal credit; transparent audit via indexer.

---

## 12. Risk & Controls

- **Spend scope:** vOFD transferable only within **allow‑listed** suppliers/merchants (HTS KYC & freeze/unfreeze keys).
- **1:1 backing:** Redeem burns vOFD and releases hOFD (no rehypothecation of vouchers).
- **Oracle‑free liquidations:** Challenge/auction design mitigates oracle manipulation risk.
- **Short tenors:** 14–30 day cycles keep exposure self‑liquidating.

---
<a id="13-regulatory-position-mica--non-legal-summary"></a>
## 13. Regulatory Position (MiCA) — Non‑Legal Summary

> Informational product positioning only — **not** legal advice. Obtain independent counsel for EU deployments.

- **hOFD (base layer):** Designed as a **fully decentralized**, oracle‑free stablecoin mechanism. MiCA Recital 22 notes services provided **in a fully decentralised manner without intermediary** may fall outside its scope (case‑by‑case assessment).
- **vOFD (voucher layer):** A **closed‑loop/limited‑network** token used to obtain goods/services from merchants under contract with the offeror. MiCA **Article 4(3)(d)** provides a whitepaper exemption for tokens **usable only within a limited network of merchants** (local NCA notifications may apply).

See **References** for the official text and guidance.

---
<a id="14-go-to-market-africa-first"></a>
## 14. Go‑to‑Market (Africa‑First)

- **Phase 1: Distributor cohorts** — FMCG/pharma suppliers onboard their own merchants.
- **Phase 2: POS & Mobile Money** — Repayment automation; consumer cashback in hOFD/vouchers.
- **Phase 3: Verticals** — Agri‑finance, NGO aid disbursements, public procurement pilots.

**KPIs:** GMV velocity, repayment < 0.5%, merchant retention, LTV/CAC > 3.

---

## 15. Roadmap

- **Phase 1 (✅):** hOFD + vOFD MVP on testnet; indexer backend; UI integration.
- **Phase 2:** Integrate **OFDPS** governance; sponsor dashboard & QR wallet; deploy an **RPC relayer** to eliminate rate‑limit bottlenecks.
- **Phase 3:** Mainnet pilot cohorts; live governance tracking.
- **Phase 4:** Scale to production; expand use‑cases; OFDPS DAO portal.

---

## 16. Known Limitations

- **OFDPS:** Contract deployed but **not** yet integrated in UI/backend.
- **DEX:** No liquidity pairs are set up.
- **Rate limits:** Public Hedera API throttles heavy indexing (you might encounter IP Rate Limit errors); production should use a **dedicated RPC relayer** or paid infra.
- **Compliance:** MiCA stance here is **informational** only.

---

## 17. Troubleshooting

- **Rate‑limited by public Hedera API** → Backoff/retry in indexer; prefer a dedicated RPC relayer in production.
- **HTS permissions (KYC/freeze)** → Ensure the correct admin/kyc/freeze keys are configured on the voucher token.
- **Contract addresses mismatch** → Verify `VITE_MINTING_HUB` and `VITE_VOUCHER_MODULE` in the frontend `.env` match your latest deployments.

---

## 18. Contributing, Security, License

**Contributing:** PRs welcome — open an issue first to discuss scope.  
**Security:** If you discover a vulnerability, please contact us privately.  
**License:** ISC

---

## 19. References

- **OFD (Oracle‑Free Dollar) — GitBook (overview):** https://oracle-free-dollar.gitbook.io/ofd
- **Frankencoin — Challenges & Auctions (oracle‑free price discovery):** https://docs.frankencoin.com/positions/auctions
- **Hedera Token Service (system smart contracts / precompile @ `0x167`):** https://docs.hedera.com/hedera/core-concepts/smart-contracts/system-smart-contracts
  - HIP‑206 (HTS precompile): https://hips.hedera.com/HIP/hip-206.html
  - HIP‑514 / HIP‑358 (precompile extensions): https://hips.hedera.com/HIP/hip-514.html , https://hips.hedera.com/HIP/hip-358.html
- **MiCA (Regulation (EU) 2023/1114) — official text:**
  - PDF: https://eur-lex.europa.eu/TodayOJ
  - Limited‑network guidance (e.g., MFSA Rulebook): https://www.mfsa.mt/wp-content/uploads/2025/03/MiCA-Rulebook.pdf

---

### Appendix A — Scripts (Quick Reference)

**Contracts**

```bash
# Deploy base / positions
yarn run deploynotesttoken:network hederaTestnet
yarn run deployPositions:network hederaTestnet
yarn test
```

**Backend**

```bash
docker-compose up -d
yarn run prisma:generate && yarn run prisma:migrate
yarn run dev   # http://localhost:3000
```

**Frontend**

```bash
yarn run dev   # http://localhost:5173
yarn run build && yarn run preview
```

---

### Team
- **Project owner** — **Alaa Souabni** (contracts, indexer, frontend)
