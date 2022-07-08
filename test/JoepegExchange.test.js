const { config, ethers, network } = require("hardhat");
const { expect } = require("chai");

const WAVAX = "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7";

describe("JoepegExchange", function () {
  before(async function () {
    this.ERC721TokenCF = await ethers.getContractFactory("ERC721Token");
    this.ERC1155TokenCF = await ethers.getContractFactory("ERC1155Token");
    this.CurrencyManagerCF = await ethers.getContractFactory("CurrencyManager");
    this.ExecutionManagerCF = await ethers.getContractFactory(
      "ExecutionManager"
    );
    this.ProtocolFeeManagerCF = await ethers.getContractFactory(
      "ProtocolFeeManager"
    );
    this.RoyaltyFeeRegistryCF = await ethers.getContractFactory(
      "RoyaltyFeeRegistry"
    );
    this.RoyaltyFeeSetterCF = await ethers.getContractFactory(
      "RoyaltyFeeSetter"
    );
    this.RoyaltyFeeManagerCF = await ethers.getContractFactory(
      "RoyaltyFeeManager"
    );
    this.StrategyStandardSaleForFixedPriceCF = await ethers.getContractFactory(
      "StrategyStandardSaleForFixedPrice"
    );
    this.StrategyAnyItemFromCollectionForFixedPriceCF =
      await ethers.getContractFactory(
        "StrategyAnyItemFromCollectionForFixedPrice"
      );
    this.ExchangeCF = await ethers.getContractFactory("JoepegExchange");
    this.TransferManagerERC721CF = await ethers.getContractFactory(
      "TransferManagerERC721"
    );
    this.TransferManagerERC1155CF = await ethers.getContractFactory(
      "TransferManagerERC1155"
    );
    this.TransferSelectorNFTCF = await ethers.getContractFactory(
      "TransferSelectorNFT"
    );

    this.signers = await ethers.getSigners();
    this.dev = this.signers[0];
    this.royaltyFeeRecipient = this.signers[1].address;
    this.alice = this.signers[2];
    this.bob = this.signers[3];
    this.carol = this.signers[4];

    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: config.networks.avalanche.url,
          },
          live: false,
          saveDeployments: true,
          tags: ["test", "local"],
        },
      ],
    });
  });

  beforeEach(async function () {
    this.wavax = await ethers.getContractAt("IWAVAX", WAVAX);
    this.erc721Token = await this.ERC721TokenCF.deploy();
    this.erc1155Token = await this.ERC1155TokenCF.deploy();

    this.currencyManager = await this.CurrencyManagerCF.deploy();
    await this.currencyManager.initialize();

    this.executionManager = await this.ExecutionManagerCF.deploy();
    await this.executionManager.initialize();

    this.protocolFeePct = 100; // 100 = 1%
    this.protocolFeeManager = await this.ProtocolFeeManagerCF.deploy();
    await this.protocolFeeManager.initialize(this.protocolFeePct);

    this.royaltyFeeLimit = 1000; // 1000 = 10%
    this.royaltyFeeRegistry = await this.RoyaltyFeeRegistryCF.deploy();
    await this.royaltyFeeRegistry.initialize(this.royaltyFeeLimit);

    this.royaltyFeeSetter = await this.RoyaltyFeeSetterCF.deploy();
    await this.royaltyFeeSetter.initialize(this.royaltyFeeRegistry.address);

    this.royaltyFeeManager = await this.RoyaltyFeeManagerCF.deploy();
    await this.royaltyFeeManager.initialize(this.royaltyFeeRegistry.address);

    this.protocolFeeRecipient = this.dev.address;
    this.strategyStandardSaleForFixedPrice =
      await this.StrategyStandardSaleForFixedPriceCF.deploy();
    this.strategyAnyItemFromCollectionForFixedPrice =
      await this.StrategyAnyItemFromCollectionForFixedPriceCF.deploy();

    this.exchange = await this.ExchangeCF.deploy();
    await this.exchange.initialize(
      this.currencyManager.address,
      this.executionManager.address,
      this.protocolFeeManager.address,
      this.royaltyFeeManager.address,
      WAVAX,
      this.protocolFeeRecipient
    );

    this.transferManagerERC721 = await this.TransferManagerERC721CF.deploy();
    await this.transferManagerERC721.initialize(this.exchange.address);

    this.transferManagerERC1155 = await this.TransferManagerERC1155CF.deploy();
    await this.transferManagerERC1155.initialize(this.exchange.address);

    this.transferSelectorNFT = await this.TransferSelectorNFTCF.deploy();
    await this.transferSelectorNFT.initialize(
      this.transferManagerERC721.address,
      this.transferManagerERC1155.address
    );

    // Mint ERC721
    await this.erc721Token.mint(this.alice.address);
    await this.erc721Token.mint(this.alice.address);

    // Mint ERC1155
    await this.erc1155Token.mint(this.alice.address, 1, 5);
    await this.erc1155Token.mint(this.alice.address, 2, 2);

    // Initialization
    await this.currencyManager.addCurrency(WAVAX);
    await this.executionManager.addStrategy(
      this.strategyStandardSaleForFixedPrice.address
    );
    await this.executionManager.addStrategy(
      this.strategyAnyItemFromCollectionForFixedPrice.address
    );
    await this.exchange.updateTransferSelectorNFT(
      this.transferSelectorNFT.address
    );
    await this.erc721Token.transferOwnership(this.royaltyFeeRecipient);

    const { chainId } = await ethers.provider.getNetwork();
    this.DOMAIN = {
      name: "JoepegExchange",
      version: "1",
      chainId,
      verifyingContract: this.exchange.address,
    };
    this.MAKER_ORDER_TYPE = [
      { name: "isOrderAsk", type: "bool" },
      { name: "signer", type: "address" },
      { name: "collection", type: "address" },
      { name: "price", type: "uint256" },
      { name: "tokenId", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "strategy", type: "address" },
      { name: "currency", type: "address" },
      { name: "nonce", type: "uint256" },
      { name: "startTime", type: "uint256" },
      { name: "endTime", type: "uint256" },
      { name: "minPercentageToAsk", type: "uint256" },
      { name: "params", type: "bytes" },
    ];
    this.TYPES = {
      MakerOrder: this.MAKER_ORDER_TYPE,
    };
  });

  describe("can execute sales", function () {
    const startTime = parseInt(Date.now() / 1000) - 1000;
    const endTime = startTime + 100000;
    const minPercentageToAsk = 9000;

    it("can sign EIP-712 message", async function () {
      // Following https://dev.to/zemse/ethersjs-signing-eip712-typed-structs-2ph8
      const price = 100;
      const tokenId = 1;
      const makerAskOrder = {
        isOrderAsk: true,
        signer: this.alice.address,
        collection: this.erc721Token.address,
        price,
        tokenId,
        amount: 1,
        strategy: this.strategyStandardSaleForFixedPrice.address,
        currency: WAVAX,
        nonce: 1,
        startTime,
        endTime,
        minPercentageToAsk,
        params: ethers.utils.formatBytes32String(""),
      };
      const signedMessage = await this.alice._signTypedData(
        this.DOMAIN,
        this.TYPES,
        makerAskOrder
      );

      const expectedSignerAddress = this.alice.address;
      const recoveredAddress = ethers.utils.verifyTypedData(
        this.DOMAIN,
        this.TYPES,
        makerAskOrder,
        signedMessage
      );
      expect(expectedSignerAddress).to.be.equal(recoveredAddress);
    });

    it("can perform fixed price sale with maker ask and taker bid", async function () {
      // Check that alice indeed owns the NFT
      const tokenId = 1;
      expect(await this.erc721Token.ownerOf(tokenId)).to.be.equal(
        this.alice.address
      );

      // Approve transferManagerERC721 to transfer NFT
      await this.erc721Token
        .connect(this.alice)
        .approve(this.transferManagerERC721.address, tokenId);

      // Create maker ask order
      // Following https://dev.to/zemse/ethersjs-signing-eip712-typed-structs-2ph8
      const price = ethers.utils.parseEther("1");
      const makerAskOrder = {
        isOrderAsk: true,
        signer: this.alice.address,
        collection: this.erc721Token.address,
        price,
        tokenId,
        amount: 1,
        strategy: this.strategyStandardSaleForFixedPrice.address,
        currency: WAVAX,
        nonce: 1,
        startTime,
        endTime,
        minPercentageToAsk,
        params: ethers.utils.formatBytes32String(""),
      };

      // Sign maker ask order
      const signedMessage = await this.alice._signTypedData(
        this.DOMAIN,
        this.TYPES,
        makerAskOrder
      );
      const { r, s, v } = ethers.utils.splitSignature(signedMessage);
      makerAskOrder.r = r;
      makerAskOrder.s = s;
      makerAskOrder.v = v;

      // Create taker bid order
      const takerBidOrder = {
        isOrderAsk: false,
        taker: this.bob.address,
        price,
        tokenId,
        minPercentageToAsk,
        params: ethers.utils.formatBytes32String(""),
      };

      // Approve exchange to transfer WAVAX
      await this.wavax
        .connect(this.bob)
        .deposit({ value: ethers.utils.parseEther("1") });
      await this.wavax.connect(this.bob).approve(this.exchange.address, price);

      const aliceWavaxBalanceBefore = await this.wavax.balanceOf(
        this.alice.address
      );
      const bobWavaxBalanceBefore = await this.wavax.balanceOf(
        this.bob.address
      );
      const protocolRecipientWavaxBalanceBefore = await this.wavax.balanceOf(
        this.protocolFeeRecipient
      );
      const royaltyFeeRecipientWavaxBalanceBefore = await this.wavax.balanceOf(
        this.royaltyFeeRecipient
      );

      // Match taker bid order with maker ask order
      await this.exchange
        .connect(this.bob)
        .matchAskWithTakerBid(takerBidOrder, makerAskOrder);

      // Check that bob paid `price` and now owns the NFT!
      expect(await this.wavax.balanceOf(this.bob.address)).to.be.equal(
        bobWavaxBalanceBefore.sub(price)
      );
      expect(await this.erc721Token.ownerOf(tokenId)).to.be.equal(
        this.bob.address
      );

      // Check that protocol received protocol fees
      const protocolRecipientWavaxBalanceAfter = await this.wavax.balanceOf(
        this.protocolFeeRecipient
      );
      const protocolFee = price.mul(this.protocolFeePct).div(10000);
      expect(protocolRecipientWavaxBalanceAfter).to.be.equal(
        protocolRecipientWavaxBalanceBefore.add(protocolFee)
      );

      // Check that royalty recipient received royalty fees
      const [_, royaltyFee] = await this.erc721Token.royaltyInfo(
        tokenId,
        price
      );
      const royaltyFeeRecipientWavaxBalanceAfter = await this.wavax.balanceOf(
        this.royaltyFeeRecipient
      );
      expect(royaltyFeeRecipientWavaxBalanceAfter).to.be.equal(
        royaltyFeeRecipientWavaxBalanceBefore.add(royaltyFee)
      );

      // Check that seller received `price - protocolFee - royaltyFee`
      const aliceWavaxBalanceAfter = await this.wavax.balanceOf(
        this.alice.address
      );
      expect(aliceWavaxBalanceAfter).to.be.equal(
        aliceWavaxBalanceBefore.add(price.sub(protocolFee).sub(royaltyFee))
      );
    });

    it("can perform fixed price sale with maker bid and taker ask", async function () {
      // Check that alice indeed owns the NFT
      const tokenId = 1;
      expect(await this.erc721Token.ownerOf(tokenId)).to.be.equal(
        this.alice.address
      );

      // Approve transferManagerERC721 to transfer NFT
      await this.erc721Token
        .connect(this.alice)
        .approve(this.transferManagerERC721.address, tokenId);

      // Create maker bid order
      // Following https://dev.to/zemse/ethersjs-signing-eip712-typed-structs-2ph8
      const price = ethers.utils.parseEther("1");
      const makerBidOrder = {
        isOrderAsk: false,
        signer: this.bob.address,
        collection: this.erc721Token.address,
        price,
        tokenId,
        amount: 1,
        strategy: this.strategyStandardSaleForFixedPrice.address,
        currency: WAVAX,
        nonce: 1,
        startTime,
        endTime,
        minPercentageToAsk,
        params: ethers.utils.formatBytes32String(""),
      };

      // Sign maker bid order
      const signedMessage = await this.bob._signTypedData(
        this.DOMAIN,
        this.TYPES,
        makerBidOrder
      );
      const { r, s, v } = ethers.utils.splitSignature(signedMessage);
      makerBidOrder.r = r;
      makerBidOrder.s = s;
      makerBidOrder.v = v;

      // Create taker ask order
      const takerAskOrder = {
        isOrderAsk: true,
        taker: this.alice.address,
        price,
        tokenId,
        minPercentageToAsk,
        params: ethers.utils.formatBytes32String(""),
      };

      // Approve exchange to transfer WAVAX
      await this.wavax
        .connect(this.bob)
        .deposit({ value: ethers.utils.parseEther("1") });
      await this.wavax.connect(this.bob).approve(this.exchange.address, price);

      const aliceWavaxBalanceBefore = await this.wavax.balanceOf(
        this.alice.address
      );
      const bobWavaxBalanceBefore = await this.wavax.balanceOf(
        this.bob.address
      );
      const protocolRecipientWavaxBalanceBefore = await this.wavax.balanceOf(
        this.protocolFeeRecipient
      );
      const royaltyFeeRecipientWavaxBalanceBefore = await this.wavax.balanceOf(
        this.royaltyFeeRecipient
      );

      // Match taker ask order with maker bid order
      await this.exchange
        .connect(this.alice)
        .matchBidWithTakerAsk(takerAskOrder, makerBidOrder);

      // Check that bob paid `price` and now owns the NFT!
      expect(await this.wavax.balanceOf(this.bob.address)).to.be.equal(
        bobWavaxBalanceBefore.sub(price)
      );
      expect(await this.erc721Token.ownerOf(tokenId)).to.be.equal(
        this.bob.address
      );

      // Check that protocol received protocol fees
      const protocolRecipientWavaxBalanceAfter = await this.wavax.balanceOf(
        this.protocolFeeRecipient
      );
      const protocolFee = price.mul(this.protocolFeePct).div(10000);
      expect(protocolRecipientWavaxBalanceAfter).to.be.equal(
        protocolRecipientWavaxBalanceBefore.add(protocolFee)
      );

      // Check that royalty recipient received royalty fees
      const [_, royaltyFee] = await this.erc721Token.royaltyInfo(
        tokenId,
        price
      );
      const royaltyFeeRecipientWavaxBalanceAfter = await this.wavax.balanceOf(
        this.royaltyFeeRecipient
      );
      expect(royaltyFeeRecipientWavaxBalanceAfter).to.be.equal(
        royaltyFeeRecipientWavaxBalanceBefore.add(royaltyFee)
      );

      // Check that seller received `price - protocolFee - royaltyFee`
      const aliceWavaxBalanceAfter = await this.wavax.balanceOf(
        this.alice.address
      );
      expect(aliceWavaxBalanceAfter).to.be.equal(
        aliceWavaxBalanceBefore.add(price.sub(protocolFee).sub(royaltyFee))
      );
    });

    it("can perform collection offer sale with collection maker bid and taker ask", async function () {
      // Check that alice indeed owns the NFT
      const tokenId = 1;
      expect(await this.erc721Token.ownerOf(tokenId)).to.be.equal(
        this.alice.address
      );

      // Approve transferManagerERC721 to transfer NFT
      await this.erc721Token
        .connect(this.alice)
        .approve(this.transferManagerERC721.address, tokenId);

      // Create collection maker bid order, using `this.strategyAnyItemFromCollectionForFixedPrice`
      // as the strategy
      // Following https://dev.to/zemse/ethersjs-signing-eip712-typed-structs-2ph8
      const price = ethers.utils.parseEther("1");
      const collectionMakerBidOrder = {
        isOrderAsk: false,
        signer: this.bob.address,
        collection: this.erc721Token.address,
        price,
        tokenId: 0,
        amount: 1,
        strategy: this.strategyAnyItemFromCollectionForFixedPrice.address,
        currency: WAVAX,
        nonce: 1,
        startTime,
        endTime,
        minPercentageToAsk,
        params: ethers.utils.formatBytes32String(""),
      };

      // Sign collection maker bid order
      const signedMessage = await this.bob._signTypedData(
        this.DOMAIN,
        this.TYPES,
        collectionMakerBidOrder
      );
      const { r, s, v } = ethers.utils.splitSignature(signedMessage);
      collectionMakerBidOrder.r = r;
      collectionMakerBidOrder.s = s;
      collectionMakerBidOrder.v = v;

      // Create taker ask order
      const takerAskOrder = {
        isOrderAsk: true,
        taker: this.alice.address,
        price,
        tokenId,
        minPercentageToAsk,
        params: ethers.utils.formatBytes32String(""),
      };

      // Approve exchange to transfer WAVAX
      await this.wavax
        .connect(this.bob)
        .deposit({ value: ethers.utils.parseEther("1") });
      await this.wavax.connect(this.bob).approve(this.exchange.address, price);

      const aliceWavaxBalanceBefore = await this.wavax.balanceOf(
        this.alice.address
      );
      const bobWavaxBalanceBefore = await this.wavax.balanceOf(
        this.bob.address
      );
      const protocolRecipientWavaxBalanceBefore = await this.wavax.balanceOf(
        this.protocolFeeRecipient
      );
      const royaltyFeeRecipientWavaxBalanceBefore = await this.wavax.balanceOf(
        this.royaltyFeeRecipient
      );

      // Match taker ask order with collection maker bid order
      await this.exchange
        .connect(this.alice)
        .matchBidWithTakerAsk(takerAskOrder, collectionMakerBidOrder);

      // Check that bob paid `price` and now owns the NFT!
      expect(await this.wavax.balanceOf(this.bob.address)).to.be.equal(
        bobWavaxBalanceBefore.sub(price)
      );
      expect(await this.erc721Token.ownerOf(tokenId)).to.be.equal(
        this.bob.address
      );

      // Check that protocol received protocol fees
      const protocolRecipientWavaxBalanceAfter = await this.wavax.balanceOf(
        this.protocolFeeRecipient
      );
      const protocolFee = price.mul(this.protocolFeePct).div(10000);
      expect(protocolRecipientWavaxBalanceAfter).to.be.equal(
        protocolRecipientWavaxBalanceBefore.add(protocolFee)
      );

      // Check that royalty recipient received royalty fees
      const [_, royaltyFee] = await this.erc721Token.royaltyInfo(
        tokenId,
        price
      );
      const royaltyFeeRecipientWavaxBalanceAfter = await this.wavax.balanceOf(
        this.royaltyFeeRecipient
      );
      expect(royaltyFeeRecipientWavaxBalanceAfter).to.be.equal(
        royaltyFeeRecipientWavaxBalanceBefore.add(royaltyFee)
      );

      // Check that seller received `price - protocolFee - royaltyFee`
      const aliceWavaxBalanceAfter = await this.wavax.balanceOf(
        this.alice.address
      );
      expect(aliceWavaxBalanceAfter).to.be.equal(
        aliceWavaxBalanceBefore.add(price.sub(protocolFee).sub(royaltyFee))
      );
    });

    it("protocol fee recipient receives correct custom protocol fee amount", async function () {
      // Set custom protocol fee for this.erc721Token
      const customProtocolFeePct = this.protocolFeePct * 2;
      await this.protocolFeeManager.setProtocolFeeForCollection(
        this.erc721Token.address,
        customProtocolFeePct
      );

      // Approve transferManagerERC721 to transfer NFT
      const tokenId = 1;
      await this.erc721Token
        .connect(this.alice)
        .approve(this.transferManagerERC721.address, tokenId);

      // Create maker ask order
      // Following https://dev.to/zemse/ethersjs-signing-eip712-typed-structs-2ph8
      const price = ethers.utils.parseEther("1");
      const makerAskOrder = {
        isOrderAsk: true,
        signer: this.alice.address,
        collection: this.erc721Token.address,
        price,
        tokenId,
        amount: 1,
        strategy: this.strategyStandardSaleForFixedPrice.address,
        currency: WAVAX,
        nonce: 1,
        startTime,
        endTime,
        minPercentageToAsk,
        params: ethers.utils.formatBytes32String(""),
      };

      // Sign maker ask order
      const signedMessage = await this.alice._signTypedData(
        this.DOMAIN,
        this.TYPES,
        makerAskOrder
      );
      const { r, s, v } = ethers.utils.splitSignature(signedMessage);
      makerAskOrder.r = r;
      makerAskOrder.s = s;
      makerAskOrder.v = v;

      // Create taker bid order
      const takerBidOrder = {
        isOrderAsk: false,
        taker: this.bob.address,
        price,
        tokenId,
        minPercentageToAsk,
        params: ethers.utils.formatBytes32String(""),
      };

      // Approve exchange to transfer WAVAX
      await this.wavax
        .connect(this.bob)
        .deposit({ value: ethers.utils.parseEther("1") });
      await this.wavax.connect(this.bob).approve(this.exchange.address, price);

      const protocolRecipientWavaxBalanceBefore = await this.wavax.balanceOf(
        this.protocolFeeRecipient
      );

      // Match taker bid order with maker ask order
      await this.exchange
        .connect(this.bob)
        .matchAskWithTakerBid(takerBidOrder, makerAskOrder);

      // Check that protocol received correct amount of protocol fees
      const protocolRecipientWavaxBalanceAfter = await this.wavax.balanceOf(
        this.protocolFeeRecipient
      );
      const customProtocolFee = price.mul(customProtocolFeePct).div(10000);
      expect(protocolRecipientWavaxBalanceAfter).to.be.equal(
        protocolRecipientWavaxBalanceBefore.add(customProtocolFee)
      );
    });
  });

  describe("can batch transfer non fungible tokens", function () {
    it("can transfer multiple ERC721 and ERC1155 tokens", async function () {
      // Check that Alice owns the ERC721 tokens
      expect(await this.erc721Token.ownerOf(1)).to.be.equal(this.alice.address);
      expect(await this.erc721Token.ownerOf(2)).to.be.equal(this.alice.address);

      // Check that Alice owns the ERC1155 tokens
      expect(
        await this.erc1155Token.balanceOf(this.alice.address, 1)
      ).to.be.equal(5);
      expect(
        await this.erc1155Token.balanceOf(this.alice.address, 2)
      ).to.be.equal(2);

      // Approve batchTransferer to transfer ERC721 collection
      await this.erc721Token
        .connect(this.alice)
        .setApprovalForAll(this.transferManagerERC721.address, true);

      // Approve batchTransferer to transfer ERC1155 collection
      await this.erc1155Token
        .connect(this.alice)
        .setApprovalForAll(this.transferManagerERC1155.address, true);

      // Batch transfer tokens
      const tokens = [
        { collection: this.erc721Token.address, tokenId: 1, amount: 1 },
        { collection: this.erc721Token.address, tokenId: 2, amount: 1 },
        { collection: this.erc1155Token.address, tokenId: 1, amount: 4 },
        { collection: this.erc1155Token.address, tokenId: 2, amount: 2 },
      ];
      await this.exchange
        .connect(this.alice)
        .batchTransferNonFungibleTokens(
          this.alice.address,
          this.bob.address,
          tokens
        );

      // Check that Bob received the ERC721 tokens
      expect(await this.erc721Token.ownerOf(1)).to.be.equal(this.bob.address);
      expect(await this.erc721Token.ownerOf(2)).to.be.equal(this.bob.address);

      // Check that Bob received the ERC1155 tokens
      expect(
        await this.erc1155Token.balanceOf(this.bob.address, 1)
      ).to.be.equal(4);
      expect(
        await this.erc1155Token.balanceOf(this.bob.address, 2)
      ).to.be.equal(2);

      // Check that Alice still has the remaining ERC1155 tokens
      expect(
        await this.erc1155Token.balanceOf(this.alice.address, 1)
      ).to.be.equal(1);
      expect(
        await this.erc1155Token.balanceOf(this.alice.address, 2)
      ).to.be.equal(0);
    });

    it("reverts when the msg sender is not the tokens owner", async function () {
      const tokens = [
        { collection: this.erc721Token.address, tokenId: 1, amount: 1 },
      ];
      await expect(
        this.exchange
          .connect(this.bob)
          .batchTransferNonFungibleTokens(
            this.alice.address,
            this.bob.address,
            tokens
          )
      ).to.be.revertedWith(
        "BatchTransferer: Only assets owner can batch transfer"
      );
    });
  });

  after(async function () {
    await network.provider.request({
      method: "hardhat_reset",
      params: [],
    });
  });
});
