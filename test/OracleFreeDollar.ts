import { expect } from "chai";
import { floatToDec18, dec18ToFloat } from "../scripts/math";
import { ethers } from "hardhat";
import { OracleFreeDollar, StablecoinBridge, TestToken } from "../typechain";
import { evm_increaseTime } from "./helper";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

const limit = floatToDec18(100_000);
describe("OracleFreeDollar", () => {
  let owner: HardhatEthersSigner;
  let alice: HardhatEthersSigner;

  let zofd: OracleFreeDollar;
  let mockXOFD: TestToken;
  let bridge: StablecoinBridge;

  before(async () => {
    [owner, alice] = await ethers.getSigners();
    // create contracts
    // 10 day application period
    const oracleFreeDollarFactory = await ethers.getContractFactory("OracleFreeDollar");
    zofd = await oracleFreeDollarFactory.deploy(10 * 86400);
  });

  describe("Basic initialization", () => {
    it("symbol should be OFD", async () => {
      let symbol = await zofd.symbol();
      expect(symbol).to.be.equal("OFD");
      let name = await zofd.name();
      expect(name).to.be.equal("OracleFreeDollar");
    });
    it("create mock token", async () => {
      const xofdFactory = await ethers.getContractFactory("TestToken");
      mockXOFD = await xofdFactory.deploy("CryptoDollar", "XOFD", 18);
      let symbol = await mockXOFD.symbol();
      expect(symbol).to.be.equal("XOFD");
    });
  });

  describe("Initializing Minters", () => {
    before(async () => {
      const xofdFactory = await ethers.getContractFactory("TestToken");
      mockXOFD = await xofdFactory.deploy("CryptoDollar", "XOFD", 18);
      const bridgeFactory = await ethers.getContractFactory("StablecoinBridge");
      bridge = await bridgeFactory.deploy(
        await mockXOFD.getAddress(),
        await zofd.getAddress(),
        limit
      );
    });
    it("bootstrap suggestMinter", async () => {
      let msg = "XOFD Bridge";
      await zofd.initialize(await bridge.getAddress(), msg);
      let isMinter = await zofd.isMinter(await bridge.getAddress());
      expect(isMinter).to.be.true;
    });
    it("should revert initialization when there is supply", async () => {
      let amount = floatToDec18(10000);
      await mockXOFD.approve(await bridge.getAddress(), amount);
      await bridge.mint(amount);
      await expect(
        zofd.initialize(await bridge.getAddress(), "Bridge")
      ).to.be.revertedWithoutReason();
    });
    it("should revert minter suggestion when application period is too short", async () => {
      await expect(
        zofd.suggestMinter(owner.address, 9 * 86400, floatToDec18(1000), "")
      ).to.be.revertedWithCustomError(zofd, "PeriodTooShort");
    });
    it("should revert minter suggestion when application fee is too low", async () => {
      await expect(
        zofd.suggestMinter(owner.address, 10 * 86400, floatToDec18(900), "")
      ).to.be.revertedWithCustomError(zofd, "FeeTooLow");
    });
    it("should revert when minter is already registered", async () => {
      await expect(
        zofd.suggestMinter(
          await bridge.getAddress(),
          10 * 86400,
          floatToDec18(1000),
          ""
        )
      ).to.be.revertedWithCustomError(zofd, "AlreadyRegistered");
    });
    it("should revert registering position when not from minters", async () => {
      expect(await zofd.isMinter(owner.address)).to.be.false;
      await expect(
        zofd.registerPosition(owner.address)
      ).to.be.revertedWithCustomError(zofd, "NotMinter");
    });
    it("should revert denying minters when exceed application period", async () => {
      await expect(
        zofd.suggestMinter(owner.address, 10 * 86400, floatToDec18(1000), "")
      ).to.emit(zofd, "MinterApplied");
      await evm_increaseTime(86400 * 11);
      await expect(
        zofd.denyMinter(owner.address, [], "")
      ).to.be.revertedWithCustomError(zofd, "TooLate");
    });
  });

  describe("Minting & Burning", () => {
    before(async () => {
      const oracleFreeDollarFactory = await ethers.getContractFactory("OracleFreeDollar");
      zofd = await oracleFreeDollarFactory.deploy(10 * 86400);
      const xofdFactory = await ethers.getContractFactory("TestToken");
      mockXOFD = await xofdFactory.deploy("CryptoDollar", "XOFD", 18);
      const bridgeFactory = await ethers.getContractFactory("StablecoinBridge");
      bridge = await bridgeFactory.deploy(
        await mockXOFD.getAddress(),
        await zofd.getAddress(),
        limit
      );
    });
    it("should revert minting if minter is not whitelisted", async () => {
      let amount = floatToDec18(10000);
      await mockXOFD.mint(owner.address, amount);
      await mockXOFD.approve(await bridge.getAddress(), amount);
      await expect(bridge.mint(amount)).to.be.revertedWithCustomError(
        zofd,
        "NotMinter"
      );
      await zofd.initialize(await bridge.getAddress(), "Bridge");
      expect(await zofd.isMinter(await bridge.getAddress())).to.be.true;
    });
    it("minter of XOFD-bridge should receive ZOFD", async () => {
      let amount = floatToDec18(5000);
      let balanceBefore = await zofd.balanceOf(owner.address);
      // set allowance
      await mockXOFD.approve(await bridge.getAddress(), amount);
      await bridge.mint(amount);

      let balanceXOFDOfBridge = await mockXOFD.balanceOf(
        await bridge.getAddress()
      );
      let balanceAfter = await zofd.balanceOf(owner.address);
      let ZOFDReceived = dec18ToFloat(balanceAfter - balanceBefore);
      let isBridgeBalanceCorrect = dec18ToFloat(balanceXOFDOfBridge) == 5000n;
      let isSenderBalanceCorrect = ZOFDReceived == 5000n;
      if (!isBridgeBalanceCorrect || !isSenderBalanceCorrect) {
        console.log(
          "Bridge received XOFD tokens ",
          dec18ToFloat(balanceXOFDOfBridge)
        );
        console.log("Sender received OFD tokens ", ZOFDReceived);
        expect(isBridgeBalanceCorrect).to.be.true;
        expect(isSenderBalanceCorrect).to.be.true;
      }
    });
    it("burner of XOFD-bridge should receive XOFD", async () => {
      let amount = floatToDec18(50);
      let balanceBefore = await zofd.balanceOf(owner.address);
      let balanceXOFDBefore = await mockXOFD.balanceOf(owner.address);
      await zofd.approve(await bridge.getAddress(), amount);
      let allowance1 = await zofd.allowance(
        owner.address,
        await bridge.getAddress()
      );
      expect(allowance1).to.be.eq(amount);
      let allowance2 = await zofd.allowance(owner.address, alice.address);
      expect(allowance2).to.be.eq(floatToDec18(0));
      await zofd.burn(amount);
      await bridge.burn(amount);
      await bridge.burnAndSend(owner.address, amount);

      let balanceXOFDOfBridge = await mockXOFD.balanceOf(
        await bridge.getAddress()
      );
      let balanceXOFDAfter = await mockXOFD.balanceOf(owner.address);
      let balanceAfter = await zofd.balanceOf(owner.address);
      let ZOFDReceived = dec18ToFloat(balanceAfter - balanceBefore);
      let XOFDReceived = dec18ToFloat(balanceXOFDAfter - balanceXOFDBefore);
      let isBridgeBalanceCorrect = dec18ToFloat(balanceXOFDOfBridge) == 4900n;
      let isSenderBalanceCorrect = ZOFDReceived == -150n;
      let isXOFDBalanceCorrect = XOFDReceived == 100n;
      if (
        !isBridgeBalanceCorrect ||
        !isSenderBalanceCorrect ||
        !isXOFDBalanceCorrect
      ) {
        console.log(
          "Bridge balance XOFD tokens ",
          dec18ToFloat(balanceXOFDOfBridge)
        );
        console.log("Sender burned OFD tokens ", -ZOFDReceived);
        console.log("Sender received XOFD tokens ", XOFDReceived);
        expect(isBridgeBalanceCorrect).to.be.true;
        expect(isSenderBalanceCorrect).to.be.true;
        expect(isXOFDBalanceCorrect).to.be.true;
      }
    });
    it("should revert minting when exceed limit", async () => {
      let amount = limit + 100n;
      await mockXOFD.approve(await bridge.getAddress(), amount);
      await expect(bridge.mint(amount)).to.be.revertedWithCustomError(
        bridge,
        "Limit"
      );
    });
    it("should revert minting when bridge is expired", async () => {
      let amount = floatToDec18(1);
      await evm_increaseTime(60 * 60 * 24 * 7 * 53); // pass 53 weeks
      await mockXOFD.approve(await bridge.getAddress(), amount);
      await expect(bridge.mint(amount)).to.be.revertedWithCustomError(
        bridge,
        "Expired"
      );
    });
    it("should revert minting with reserve from non minters", async () => {
      await expect(
        zofd.mintWithReserve(owner.address, 1000, 0, 0)
      ).to.be.revertedWithCustomError(zofd, "NotMinter");
    });
    it("should revert burning from non minters", async () => {
      await expect(
        zofd.burnFrom(owner.address, 1000)
      ).to.be.revertedWithCustomError(zofd, "NotMinter");
    });
    it("should revert burning without reserve from non minters", async () => {
      await expect(
        zofd.burnWithoutReserve(owner.address, 1000)
      ).to.be.revertedWithCustomError(zofd, "NotMinter");
    });
    it("should revert burning with reserve from non minters", async () => {
      await expect(
        zofd.burnWithReserve(owner.address, 1000)
      ).to.be.revertedWithCustomError(zofd, "NotMinter");
    });
    it("should revert burning from with reserve from non minters", async () => {
      await expect(
        zofd.burnFromWithReserve(owner.address, 0, 0)
      ).to.be.revertedWithCustomError(zofd, "NotMinter");
    });
    it("should revert covering loss from non minters", async () => {
      await expect(zofd.coverLoss(owner.address, 0)).to.be.revertedWithCustomError(
        zofd,
        "NotMinter"
      );
    });
    it("should revert collecting profits from non minters", async () => {
      await expect(zofd.collectProfits(owner.address, 7)).to.be.revertedWithCustomError(
        zofd,
        "NotMinter"
      );
    });
  });

  describe("view func", () => {
    before(async () => {
      const oracleFreeDollarFactory = await ethers.getContractFactory("OracleFreeDollar");
      zofd = await oracleFreeDollarFactory.deploy(10 * 86400);

      const xofdFactory = await ethers.getContractFactory("TestToken");
      mockXOFD = await xofdFactory.deploy("CryptoFranc", "XOFD", 18);

      const bridgeFactory = await ethers.getContractFactory("StablecoinBridge");
      bridge = await bridgeFactory.deploy(
        await mockXOFD.getAddress(),
        await zofd.getAddress(),
        limit
      );
    });
    it("calculateAssignedReserve", async () => {});
  });
});
