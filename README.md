# Oracle Free Dollar (OFD) Project

This repository contains the implementation of the Oracle Free Dollar system, a decentralized financial platform built on the Hedera network. The project consists of three main components: smart contracts, backend indexer, and frontend interface.

## Project Structure

```
├── backend/           # Backend indexer and API server
├── frontend/          # Frontend web application
└── hedera-contracts/ # Smart contract implementation
```

## Components

### Smart Contracts (hedera-contracts/)

The smart contract implementation includes various components for managing the Oracle Free Dollar system:

- Position management
- Minting functionality
- Equity handling
- Savings features
- Voucher system
- Stablecoin bridge

**Tech Stack:**

- Solidity
- Hardhat
- TypeScript
- OpenZeppelin Contracts
- Hedera SDK

### Backend (backend/)

The backend serves as an indexer and API server for the OFD system:

- Event indexing from the Hedera network
- REST API endpoints
- Authentication system
- Profile management
- Voucher event tracking

**Tech Stack:**

- Node.js
- TypeScript
- Fastify
- Prisma
- ethers.js
- PostgreSQL

### Frontend (frontend/ofd-vouchers-ui/)

The frontend provides a user interface for interacting with the OFD system:

- Wallet integration
- Position management interface
- Voucher system interaction
- Real-time updates

**Tech Stack:**

- React
- TypeScript
- Vite
- TailwindCSS
- Hedera Wallet Connect
- ethers.js

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- Docker and Docker Compose
- Git
- npm or yarn

### Installation

1. Clone the repository:

```bash
git clone https://github.com/alaasouabni/hedera-ofmd.git
cd hedera-ofmd
```

2. Install dependencies for each component:

Using npm:

```bash
# Smart Contracts
cd hedera-contracts
npm install

# Backend
cd ../backend
npm install

# Frontend
cd ../frontend/ofd-vouchers-ui
npm install
```

Or using yarn:

```bash
# Smart Contracts
cd hedera-contracts
yarn install

# Backend
cd ../backend
yarn install

# Frontend
cd ../frontend/ofd-vouchers-ui
yarn install
```

### Development Setup

#### Smart Contracts

1. Set up environment variables:

```bash
cd hedera-contracts
cp .env.example .env
# Edit .env with your configuration
```

2. Run tests:

```bash
npm test
```

#### Backend

1. Start the PostgreSQL database using Docker:

```bash
cd backend
docker-compose up -d
```

2. Set up environment variables:

```bash
cp .env.example .env
# Edit .env with your configuration
# Make sure DATABASE_URL matches your Docker PostgreSQL configuration:
# DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ofd_indexer?schema=public"
```

3. Set up the database and generate Prisma client:

Using npm:

```bash
npm run prisma:generate
npm run prisma:migrate
```

Or using yarn:

```bash
yarn prisma:generate
yarn prisma:migrate
```

4. Start the development server:

Using npm:

```bash
npm run dev
```

Or using yarn:

```bash
yarn dev
```

5. (Optional) To view and manage your database using Prisma Studio:

Using npm:

```bash
npm run prisma:studio
```

Or using yarn:

```bash
yarn prisma:studio
```

The backend server will be available at `http://localhost:3000` by default.

#### Frontend

1. Set up environment variables:

```bash
cd frontend/ofd-vouchers-ui
cp .env.example .env
# Edit .env with your configuration, including:
# - Hedera network settings
# - Backend API URL
# - Contract addresses
```

2. Start the development server:

Using npm:

```bash
npm run dev
```

Or using yarn:

```bash
yarn dev
```

The frontend development server will be available at `http://localhost:5173` by default.

3. Building for production:

Using npm:

```bash
npm run build
npm run preview # to preview the production build
```

Or using yarn:

```bash
yarn build
yarn preview # to preview the production build
```

## Available Scripts

### Smart Contracts

- Deploy contracts:
  ```bash
  npm run deploy:network <network-name>
  # or
  yarn deploy:network <network-name>
  ```
- Run tests:
  ```bash
  npm test
  # or
  yarn test
  ```
- Deploy specific components:

  ```bash
  # Deploy base contracts
  npm run deploynotesttoken:network <network-name>
  # or
  yarn deploynotesttoken:network <network-name>

  # Deploy positions
  npm run deployPositions:network <network-name>
  # or
  yarn deployPositions:network <network-name>
  ```

### Backend

- Database Commands:

  ```bash
  # Start PostgreSQL container
  docker-compose up -d
  # Stop PostgreSQL container
  docker-compose down
  # View logs
  docker-compose logs -f

  # Generate Prisma client
  npm run prisma:generate
  # or
  yarn prisma:generate

  # Run migrations
  npm run prisma:migrate
  # or
  yarn prisma:migrate

  # Open Prisma Studio
  npm run prisma:studio
  # or
  yarn prisma:studio
  ```

- Development:

  ```bash
  # Start development server with hot reload
  npm run dev
  # or
  yarn dev

  # Build for production
  npm run build
  # or
  yarn build

  # Start production server
  npm start
  # or
  yarn start
  ```

### Frontend

- Development:

  ```bash
  # Start development server
  npm run dev
  # or
  yarn dev
  ```

- Production:

  ```bash
  # Build for production
  npm run build
  # or
  yarn build

  # Preview production build
  npm run preview
  # or
  yarn preview
  ```

- Linting:
  ```bash
  # Run ESLint
  npm run lint
  # or
  yarn lint
  ```

## License

ISC

## Contributing

Please read our contributing guidelines before submitting pull requests.

## Security

If you discover a security vulnerability, please contact us directly.
