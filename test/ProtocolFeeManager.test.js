// @ts-nocheck
const { ethers, network, upgrades } = require("hardhat");
const { expect } = require("chai");
const { describe } = require("mocha");

describe("ProtocolFeeManager", function () {
  before(async function () {
    this.ERC721TokenCF = await ethers.getContractFactory("ERC721Token");
    this.ProtocolFeeManagerCF = await ethers.getContractFactory(
      "ProtocolFeeManager"
    );

    this.signers = await ethers.getSigners();
    this.dev = this.signers[0];
    this.alice = this.signers[1];
    this.bob = this.signers[2];
    this.carol = this.signers[3];
  });

  beforeEach(async function () {
    this.erc721Token = await this.ERC721TokenCF.deploy();
    this.protocolFeePct = 100; // 100 -> 1%
    this.protocolFeeManager = await this.ProtocolFeeManagerCF.deploy(
      this.protocolFeePct
    );
  });

  describe("setDefaultProtocolFee", function () {
    it("should not allow non-owner to setDefaultProtocolFee", async function () {
      await expect(
        this.protocolFeeManager.connect(this.alice).setDefaultProtocolFee(200)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("should not allow setting invalid protocol fee amount", async function () {
      await expect(
        this.protocolFeeManager.setDefaultProtocolFee(10001)
      ).to.be.revertedWith("ProtocolFeeManager__InvalidProtocolFee()");
    });

    it("should allow setting valid protocol fee amount", async function () {
      const newProtocolFeePct = this.protocolFeePct * 2;
      await this.protocolFeeManager.setDefaultProtocolFee(newProtocolFeePct);

      expect(await this.protocolFeeManager.defaultProtocolFee()).to.be.equal(
        newProtocolFeePct
      );
    });
  });

  describe("setProtocolFeeForCollection", function () {
    it("should not allow non-owner to setProtocolFeeForCollection", async function () {
      await expect(
        this.protocolFeeManager
          .connect(this.alice)
          .setProtocolFeeForCollection(this.erc721Token.address, 200)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("should not allow setting invalid protocol fee amount", async function () {
      await expect(
        this.protocolFeeManager.setProtocolFeeForCollection(
          this.erc721Token.address,
          10001
        )
      ).to.be.revertedWith("ProtocolFeeManager__InvalidProtocolFee()");
    });

    it("should allow setting valid protocol fee amount", async function () {
      const newProtocolFeePct = this.protocolFeePct * 2;
      await this.protocolFeeManager.setProtocolFeeForCollection(
        this.erc721Token.address,
        newProtocolFeePct
      );

      expect(
        await this.protocolFeeManager.protocolFeeForCollection(
          this.erc721Token.address
        )
      ).to.be.equal(newProtocolFeePct);
    });
  });

  after(async function () {
    await network.provider.request({
      method: "hardhat_reset",
      params: [],
    });
  });
});

const increase = (seconds) => {
  ethers.provider.send("evm_increaseTime", [seconds]);
  ethers.provider.send("evm_mine", []);
};
