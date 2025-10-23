import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { deployContract, sleep } from "../deployUtils";
import { floatToDec18 } from "../../math";
import { StablecoinBridge } from "../../../typechain";
import { Interface } from "ethers";

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { get, log },
    ethers,
    network,
  } = hre;

  // Treat Hedera testnet like a mock env so we mint OFD for you.
  const isMockEnv = ["hardhat", "localhost", "bnbtestnet", "hederaTestnet"].includes(network.name);

  // ----- 1) Resolve addresses (your hardcoded values kept) -----
  // XOFD (mock external token)
  const xofdAddress = "0xe9cb34F4B1a879B0A36EB52f8042EbA7565CfA69";
  // OFD (already deployed by your core scripts)
  const ofdAddress = "0xa79bD079986b7D8C9D98021817dCf7085741D991";

  if (!xofdAddress) throw new Error("XOFD address not set");
  if (!ofdAddress) throw new Error("OFD address not set");

  log(`Using XOFD at ${xofdAddress}`);
  log(`Using OFD  at ${ofdAddress}`);

  const ofd = await ethers.getContractAt("OracleFreeDollar", ofdAddress);

  // ----- 2) Deploy StablecoinBridge (or reuse) -----
  const limit = 10_000_000; // OFD cap via the bridge
  const dLimit = floatToDec18(limit);
  log(`\nDeploying StablecoinBridge with limit = ${limit} OFD`);
  await deployContract(hre, "StablecoinBridge", [xofdAddress, ofdAddress, dLimit]);

  const bridgeDeployment = await get("StablecoinBridge");
  const bridgeAddr = bridgeDeployment.address;
  log(`StablecoinBridge at ${bridgeAddr}`);

  // ----- 3) Ensure bridge is an OFD minter (suggestMinter OR initialize) -----
  const iface = ofd.interface as unknown as Interface;
  const hasSuggestMinter = (() => { try { iface.getFunction("suggestMinter"); return true; } catch { return false; } })();
  const hasInitialize    = (() => { try { iface.getFunction("initialize");    return true; } catch { return false; } })();
  const hasIsMinter      = (() => { try { iface.getFunction("isMinter");      return true; } catch { return false; } })();

  async function pollIsMinter(): Promise<boolean> {
    if (!hasIsMinter) return false;
    for (let i = 0; i < 5; i++) {
      const ok: boolean = await (ofd as any).isMinter(bridgeAddr);
      log(`isMinter? ${ok}`);
      if (ok) return true;
      log("Waiting 10s...");
      await sleep(10_000);
    }
    return false;
  }

  let alreadyMinter = false;
  if (hasIsMinter) {
    try { alreadyMinter = await (ofd as any).isMinter(bridgeAddr); } catch {}
  }

  if (!alreadyMinter) {
    if (hasSuggestMinter) {
      log("Applying minter via ofd.suggestMinter(bridge)...");
      const tx = await (ofd as any).suggestMinter(bridgeAddr);
      log("tx:", tx.hash);
      await tx.wait();
    } else if (hasInitialize) {
      // initialize can be (address) or (address,string), detect arity
      let initInputs: Number | null = 0;
      try { initInputs = (iface.getFunction("initialize")?.inputs ?? []).length; } catch {}
      log("Applying minter via ofd.initialize(...)");
      const tx = initInputs === 2
        ? await (ofd as any).initialize(bridgeAddr, "XOFD Bridge")
        : await (ofd as any).initialize(bridgeAddr);
      log("tx:", tx.hash);
      await tx.wait();
    } else {
      throw new Error("Neither suggestMinter nor initialize found on OFD; check your build.");
    }
    await pollIsMinter();
  } else {
    log("Bridge is already a minter.");
  }

  // ----- 4) In mock envs, mint OFD to your EOA so you can pay OPENING_FEE -----
  if (isMockEnv) {
    const signer = (await ethers.getSigners())[0];
    const signerAddr = await signer.getAddress();

    // Use generic ERC-20 ABI for XOFD regardless of its contract name
    const erc20 = await ethers.getContractAt(
      [
        "function decimals() view returns (uint8)",
        "function approve(address,uint256) returns (bool)",
        "function balanceOf(address) view returns (uint256)"
      ],
      xofdAddress
    );
    const xdec = await erc20.decimals();
    const amount = ethers.parseUnits("2000", xdec); // mint ~2,000 OFD

    log(`Approving XOFD amount ${amount.toString()} to bridge...`);
    await (await erc20.approve(bridgeAddr, amount)).wait();

    const bridge = (await ethers.getContractAt("StablecoinBridge", bridgeAddr)) as unknown as StablecoinBridge;
    log("Calling bridge.mint(amount)...");
    await (await bridge.mint(amount)).wait();

    const bal = await ofd.balanceOf(signerAddr);
    log(`OFD balance after bridge mint: ${bal.toString()}`);
  }

  log("Bridge setup complete.");
};

export default deploy;
// Use a dedicated tag so you don't run it with 'main' by accident
deploy.tags = ["XOFDBridgeHedera"];
