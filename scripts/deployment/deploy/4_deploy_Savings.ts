import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { deployContract } from "../deployUtils";

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { get },
  } = hre;
  const ofdAddress: string = '0xa79bD079986b7D8C9D98021817dCf7085741D991'
  const initialRatePPM: number = 50000

  if(ofdAddress.length === 0 || Number.isNaN(initialRatePPM)) {
    throw new Error("OFD address is not set, please set it in the script");
  }

  await deployContract(hre, "Savings", [ofdAddress, initialRatePPM]);

  const savingsDeployment = await get("Savings");
  console.log(
    `Verify Savings:\nnpx hardhat verify --network hederaTestnet ${savingsDeployment.address} ${ofdAddress} ${initialRatePPM} \n`
  );
};
export default deploy;
deploy.tags = ["main", "Savings"];
