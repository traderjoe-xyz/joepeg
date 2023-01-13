const { verify } = require("./utils");

module.exports = async function ({
  getNamedAccounts,
  deployments,
  getChainId,
}) {
  const { deploy, catchUnknownSigner } = deployments;
  const { deployer } = await getNamedAccounts();

  let proxyContract, proxyOwner;

  const chainId = await getChainId();

  if (chainId == 4 || chainId == 43113) {
    proxyOwner = "0xdB40a7b71642FE24CC546bdF4749Aa3c0B042f78";
  } else if (chainId == 97) {
    proxyOwner = "0x597E2587eCA945fB001BAdF1adF878CcB8e368b6";
  } else if (chainId == 43114 || chainId == 31337) {
    // multisig
    proxyOwner = "0x64c4607AD853999EE5042Ba8377BfC4099C273DE";
  }

  const transferManagerERC721 = await deployments.get("TransferManagerERC721");
  const transferManagerERC1155 = await deployments.get(
    "TransferManagerERC1155"
  );

  const args = [transferManagerERC721.address, transferManagerERC1155.address];
  await catchUnknownSigner(async () => {
    proxyContract = await deploy("TransferSelectorNFT", {
      from: deployer,
      proxy: {
        owner: proxyOwner,
        proxyContract: "OpenZeppelinTransparentProxy",
        viaAdminContract: "DefaultProxyAdmin",
        execute: {
          init: {
            methodName: "initialize",
            args: args,
          },
        },
      },
      log: true,
      deterministicDeployment: false,
    });
  });

  await verify(proxyContract.implementation, []);
};

module.exports.tags = ["TransferSelectorNFT"];
module.exports.dependencies = [
  "TransferManagerERC721",
  "TransferManagerERC1155",
];
