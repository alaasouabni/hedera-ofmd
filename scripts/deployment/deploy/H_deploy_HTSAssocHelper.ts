import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const deployHelper: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments: { deploy, log }, getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();

  log("Deploying HTSAssociationHelper...");
  await deploy("HTSAssociationHelper", {
    from: deployer,
    args: [],
    log: true,
    skipIfAlreadyDeployed: false, // keep true if you want "reusing ..." behavior
  });
  log("HTSAssociationHelper deployed.");
};
export default deployHelper;
deployHelper.tags = ["HTSAssocHelper"];
