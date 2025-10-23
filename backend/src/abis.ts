export const mintingHubAbi = [
  "event PositionOpened(address indexed owner, address indexed position, address original, address collateral)",
  "event ChallengeStarted(address indexed challenger, address indexed position, uint256 size, uint256 number)",
  "event ChallengeAverted(address indexed position, uint256 number, uint256 size)",
  "event ChallengeSucceeded(address indexed position, uint256 number, uint256 bid, uint256 acquiredCollateral, uint256 challengeSize)",
  "event PostPonedReturn(address collateral, address indexed beneficiary, uint256 amount)",
  "event ForcedSale(address pos, uint256 amount, uint256 priceE36MinusDecimals)",

  // reads
  "function price(uint32 challengeNumber) view returns (uint256)",
  "function challenges(uint256) view returns (address challenger, uint40 start, address position, uint256 size)",
  "function pendingReturns(address collateral, address beneficiary) view returns (uint256)",
  "function expiredPurchasePrice(address pos) view returns (uint256)",
];

export const positionAbi = [
  // views
  "function owner() view returns (address)",
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
  "function challengeData() view returns (uint256 liqPrice, uint40 phase)",
];

export const erc20Abi = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
];

// voucherModuleAbi.ts
export const voucherModuleAbi = [
  // events (match contract)
  "event HTSCreated(address token)",
  "event RoleSet(address indexed who, string role, bool on)",
  "event Issue(address indexed sponsor, address indexed merchant, uint256 amount)",
  "event Spend(address indexed merchant, address indexed supplier, uint256 amount)",
  "event Redeem(address indexed supplier, uint256 gross, uint256 fee, uint256 net)",
  "event MDRSet(uint16 bps)",
  "event HBARReceived(address indexed from, uint256 amount)",
  "event HBARFallback(address sender, uint256 amount, bytes data)",
  "event HBARWithdrawn(address indexed to, uint256 amount)",
];
