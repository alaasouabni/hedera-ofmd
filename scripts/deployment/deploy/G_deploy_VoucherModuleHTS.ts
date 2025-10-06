import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const deployVoucher: DeployFunction = async (
  hre: HardhatRuntimeEnvironment
) => {
  const {
    deployments: { deploy, get, log },
    ethers,
    getNamedAccounts,
  } = hre;

  const { deployer } = await getNamedAccounts();

  // 1) Use your already deployed OFD on Hedera EVM
  const ofd = await get("OracleFreeDollar");
  const hOFD = ofd.address;

  const treasury = deployer; // fee sink for demo
  const initialSponsors = [deployer]; // deployer is a sponsor

  log(
    `Deploying VoucherModuleHTS with hOFD=${hOFD}, treasury=${treasury}, sponsor=${deployer}`
  );

  // 2) Deploy the module
  const { address } = await deploy("VoucherModuleHTS", {
    from: deployer,
    args: [hOFD, treasury, initialSponsors],
    log: true,
    skipIfAlreadyDeployed: false,
  });

  log(`VoucherModuleHTS at ${address}`);

  // 3) Call createVoucherToken() as the owner, sending some HBAR for the HTS fee
//   const signer = await ethers.getSigner(deployer);
//   const voucher = await ethers.getContractAt(
//     "VoucherModuleHTS",
//     address,
//     signer
//   );

//   const vOFD0: string = await voucher.vOFD();
//   if (vOFD0 === ethers.ZeroAddress) {
//     log("Calling createVoucherToken()...");
//     const value = ethers.parseEther("15"); // try 5–20 HBAR on testnet; bump if rc=9 persists
//     const gasLimit = 3_000_000n; // roomy EVM gas for the precompile call

//     const tx = await voucher.createVoucherToken({ value, gasLimit });
//     const rcpt = await tx.wait();
//     log(`createVoucherToken tx: ${rcpt?.hash}`);

//     const vOFD = await voucher.vOFD();
//     log(`HTS vOFD created: ${vOFD}`);
//   } else {
//     log(`HTS already created at: ${vOFD0}`);
//   }
};

export default deployVoucher;
deployVoucher.tags = ["VoucherModuleHTS"];
