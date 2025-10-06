import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const deployPos = async (params: any, hre: HardhatRuntimeEnvironment) => {
  const {
    deployments: { get },
    ethers,
  } = hre;

  const mintingHubDeployment = await get("MintingHub");
  const ofdDeployment = await get("OracleFreeDollar");

  console.log(" before getContractAt MintingHub");
  const mintingHub = await ethers.getContractAt("MintingHub", mintingHubDeployment.address);

  const collateralAddr: string = params.collateralTknAddr;
  console.log(" before getContractAt ", params.name, collateralAddr);
  const Collateral = await ethers.getContractAt(params.name, collateralAddr);

  console.log("after variables");
  console.log("OFD address ", ofdDeployment.address);
  console.log("coll address ", collateralAddr);

  const [deployer] = await ethers.getSigners();

  // --------- DECIMALS HELPERS ---------
  const collDecimals: bigint = await Collateral.decimals();
  const toColl = (v: number | string | bigint) => ethers.parseUnits(v.toString(), collDecimals);
  const toOFD  = (v: number | string | bigint) => ethers.parseUnits(v.toString(), 18);

  // --------- BUILD ARGS IN THE RIGHT UNITS ---------
  // Collateral fields -> collateral decimals
  const minCollateral       = toColl(params.minCollateral);        // e.g., 5
  const initialCollateral   = toColl(params.initialCollateral);    // e.g., 25

  // OFD fields -> 18 decimals
  let   mintingMaximum      = toOFD(params.initialLimitOFD);       // e.g., 20000 OFD
  const liqPrice            = toOFD(params.liqPriceOFD);           // OFD per 1 collateral, 18d

  // Time & ppm
  let initPeriodSeconds   = BigInt(params.minApplicationPeriodSeconds); // must be >= 5 days
  let expirationSeconds   = BigInt(params.durationDays) * 86_400n;      // duration (tenor)
  let challengeSeconds    = BigInt(params.challengePeriodSeconds);
  let riskPremiumPPM      = BigInt(Math.round(params.feesPercent * 1e4));      // 2% -> 20000 ppm
  let reservePPM          = BigInt(Math.round(params.reservePercent * 1e4));   // 10% -> 100000 ppm

  // Enforce the constructor requirement: init period >= 5 days
  const MIN_INIT = 5n * 24n * 3600n; // 432000
  if (initPeriodSeconds < MIN_INIT) {
    console.log(`initPeriodSeconds too small (${initPeriodSeconds}), bumping to 5 days`);
    initPeriodSeconds = MIN_INIT;
  }
  // Ensure init ≤ challenge
  if (initPeriodSeconds > challengeSeconds) {
    console.log(`challengeSeconds too small (${challengeSeconds}), bumping to ${initPeriodSeconds}`);
    challengeSeconds = initPeriodSeconds;
  }

  // --------- OPTIONAL: CAP mintingMaximum BY COLLATERAL VALUE * (1 - reserve) ---------
  const ONE_PPM = 1_000_000n;
  const collScale = 10n ** BigInt(collDecimals);
  // initialCollateral (collDecimals) * liqPrice (18d) / 10^collDecimals -> OFD 18d
  const collateralValueAtLiq = (initialCollateral * liqPrice) / collScale;
  const capWithReserve       = (collateralValueAtLiq * (ONE_PPM - reservePPM)) / ONE_PPM;

  console.log(
    "computed caps:",
    "\n  collateralValueAtLiq:", collateralValueAtLiq.toString(),
    "\n  capWithReserve:", capWithReserve.toString(),
    "\n  requested mintingMaximum:", mintingMaximum.toString()
  );

  if (mintingMaximum > capWithReserve) {
    console.warn(`mintingMaximum too high; lowering to ${capWithReserve.toString()}`);
    mintingMaximum = capWithReserve;
  }

  // --------- BALANCES & APPROVALS ---------
  const collBal = await Collateral.balanceOf(deployer.address);
  console.log("Collateral balance:", collBal.toString());
  if (collBal < initialCollateral) throw new Error("Not enough collateral tokens");

  // Approve collateral to the hub
  const tx1 = await Collateral.approve(mintingHubDeployment.address, initialCollateral, { gasLimit: 1_000_000 });
  console.log("collateral approve tx:", tx1.hash);
  await tx1.wait();

  // Opening fee in OFD
  const OFD = await ethers.getContractAt("OracleFreeDollar", ofdDeployment.address);
  let OPENING_FEE: bigint = toOFD(1000); // default 1000 OFD
  try {
    if (typeof (mintingHub as any).OPENING_FEE === "function") {
      OPENING_FEE = await (mintingHub as any).OPENING_FEE();
    } else if (typeof (mintingHub as any).applicationFee === "function") {
      OPENING_FEE = await (mintingHub as any).applicationFee();
    }
  } catch { /* keep default */ }

  const ofdBal = await OFD.balanceOf(deployer.address);
  console.log("OPENING_FEE:", OPENING_FEE.toString(), "OFD bal:", ofdBal.toString());
  if (ofdBal < OPENING_FEE) throw new Error("Insufficient OFD for opening fee");

  await (await OFD.approve(mintingHubDeployment.address, OPENING_FEE)).wait();
  console.log("Approved OFD opening fee to MintingHub.");
  const allowance = await OFD.allowance(deployer.address, mintingHubDeployment.address);
  console.log("OFD allowance to MintingHub:", allowance.toString());

  // --------- PRINT FINAL ARGS ---------
  console.log("ARGS:",
    "\n  collateralAddr      =", collateralAddr,
    "\n  minCollateral       =", minCollateral.toString(),
    "\n  initialCollateral   =", initialCollateral.toString(),
    "\n  mintingMaximum      =", mintingMaximum.toString(),
    "\n  initPeriodSeconds   =", initPeriodSeconds.toString(),   // >= 432000
    "\n  expirationSeconds   =", expirationSeconds.toString(),  // duration (tenor)
    "\n  challengeSeconds    =", challengeSeconds.toString(),
    "\n  riskPremium (ppm)   =", riskPremiumPPM.toString(),
    "\n  liqPrice (18d)      =", liqPrice.toString(),
    "\n  reservePPM          =", reservePPM.toString()
  );

  // --------- SIMULATE (ethers v6) ---------
  await mintingHub.openPosition.staticCall(
    collateralAddr,
    minCollateral,
    initialCollateral,
    mintingMaximum,
    initPeriodSeconds,
    expirationSeconds,
    challengeSeconds,
    riskPremiumPPM,
    liqPrice,
    reservePPM
  );

  // --------- SEND TX ---------
  const tx = await mintingHub.openPosition(
    collateralAddr,
    minCollateral,
    initialCollateral,
    mintingMaximum,
    initPeriodSeconds,
    expirationSeconds,
    challengeSeconds,
    riskPremiumPPM,
    liqPrice,
    reservePPM
  );
  console.log("openPosition tx:", tx.hash);
  await tx.wait();

  return tx.hash;
};

const deploy: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const paramFile = "paramsPositions.json";
  const chainId = hre.network.config["chainId"];
  const paramsArr = require(__dirname + `/../parameters/${paramFile}`);

  for (const params of paramsArr) {
    if (chainId == params.chainId) {
      const txh = await deployPos(params, hre);
      console.log("Deployed position, tx hash =", txh);
    }
  }
};
export default deploy;
deploy.tags = ["positions"];
