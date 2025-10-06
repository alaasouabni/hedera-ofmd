import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { deployContract } from "../deployUtils";

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { get },
    ethers,
  } = hre;

  const ofdAddress: string = '0xa79bD079986b7D8C9D98021817dCf7085741D991'
  const positionFactoryAddress: string = '0x7F1Cbf264E60D844f60BdFb22314389cDD50F292';
  const positionRollerAddress: string = '0x253fa424a35ab579bE20F878cBcf9ecbeAe23B65';
  const savingsAddress: string = '0xd5183DD54aBE2dc040213516d19c5532405762D6';

  if(ofdAddress.length === 0 || positionFactoryAddress.length === 0 || positionRollerAddress.length === 0 || savingsAddress.length === 0) {
    throw new Error("OFD or Position Factory address is not set, please set it in the script");
  }

  let ofdContract = await ethers.getContractAt("OracleFreeDollar", ofdAddress);

  let mintingHubContract = await deployContract(hre, "MintingHub", [
    ofdAddress,
    savingsAddress,
    positionRollerAddress,
    positionFactoryAddress,
  ]);

  const mintingHubAddress= await mintingHubContract.getAddress();

  //let mintingHubContract = await get("MintingHub");

  console.log(`Verify mintingHubContract: npx hardhat verify --network hederaTestnet ${mintingHubAddress} ${ofdAddress} ${savingsAddress} ${positionRollerAddress} ${positionFactoryAddress} \n`);

  // create a minting hub too while we have no OFD supply
  try {
    let txSavings = await ofdContract.initialize(savingsAddress, "Savings");
    await txSavings.wait();

    let txPositionFactory = await ofdContract.initialize(positionFactoryAddress, "Position Factory");
    await txPositionFactory.wait();

    let txPositionRoller = await ofdContract.initialize(positionRollerAddress, "Position Roller");
    await txPositionRoller.wait();

    let txMintingHub = await ofdContract.initialize(mintingHubAddress, "Minting Hub V2");
    await txMintingHub.wait();
  } catch (err) {
    console.log("Suggest minter failed, probably already registered:");
    console.error(err);
  }
};
export default deploy;
deploy.tags = ["main", "MintingHub"];
