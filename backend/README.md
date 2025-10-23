# OFD Indexer + API (Starter)

Indexes `PositionOpened` and `ChallengeStarted` from a MintingHub,
fetches position details, and exposes a REST API for your frontend.

## Quick start
1) Copy `.env.example` to `.env` and fill in values.
2) `docker compose up -d` (starts Postgres 16 on localhost:5432).
3) `npm i` (or `pnpm i`) in `backend/`.
4) `npm run prisma:migrate` to create tables.
5) `npm run dev` to run API + indexer.

API runs on `http://localhost:4000` by default.

## Key endpoints
- `GET /health`
- `GET /state` — last scanned block
- `GET /positions?owner=0x...&limit=100`
- `GET /positions/:id`
- `GET /positions/:id/challenges`
- `GET /wallets/:addr/pending-returns/:collateral`
- `GET /positions/:id/expired-price`
