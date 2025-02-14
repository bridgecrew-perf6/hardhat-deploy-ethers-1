import type { ethers } from "ethers";
import { NomicLabsHardhatPluginError } from "hardhat/plugins";
import {
  Artifact,
  HardhatRuntimeEnvironment,
  NetworkConfig,
} from "hardhat/types";

import type { SignerWithAddress } from "../signers";
import type { FactoryOptions, Libraries } from "../types";

interface Link {
  sourceName: string;
  libraryName: string;
  address: string;
}

const pluginName = "hardhat-deploy-ethers";

async function _getSigner(
  hre: HardhatRuntimeEnvironment,
  account: string
): Promise<SignerWithAddress> {
  const { SignerWithAddress: SignerWithAddressImpl } = await import(
    "../signers"
  );
  const ethersSigner = await SignerWithAddressImpl.create(hre.ethers.provider.getSigner(account));
  return ethersSigner;
}

async function _getSignerFromAccountList(
  hre: HardhatRuntimeEnvironment,
  account: string
): Promise<SignerWithAddress | null> {
  const accounts = await hre.ethers.provider.listAccounts();
  const found = accounts.find((v) => v.toLowerCase() === account);
  if (found) {
    const { SignerWithAddress: SignerWithAddressImpl } = await import(
      "../signers"
    );
    const ethersSigner = await SignerWithAddressImpl.create(hre.ethers.provider.getSigner(account));
    return ethersSigner;
  }
  return null;
}

async function _getArtifact(
  hre: HardhatRuntimeEnvironment,
  name: string
): Promise<Artifact> {
  const deployments = (hre as any).deployments;
  if (deployments !== undefined) {
    return deployments.getArtifact(name);
  }
  return hre.artifacts.readArtifact(name);
}

export async function getSignerOrNull(
  hre: HardhatRuntimeEnvironment,
  address: string
): Promise<SignerWithAddress | null> {
  if (!address) {
    throw new Error("need to specify address");
  }
  const signer = await _getSigner(hre, address);
  if (signer === undefined) {
    return null;
  } else {
    return signer;
  }
}


export async function getSigner(
  hre: HardhatRuntimeEnvironment,
  address: string
): Promise<SignerWithAddress> {
  const signer = await getSignerOrNull(hre, address);
  if (!signer) {
    throw new Error(`no signer for ${address}`);
  }
  return signer;
}

export async function getSigners(
  hre: HardhatRuntimeEnvironment
): Promise<SignerWithAddress[]> {
  const accounts = await hre.ethers.provider.listAccounts();

  const signersWithAddress = await Promise.all(
    accounts.map((account) => _getSigner(hre, account))
  );

  return signersWithAddress;
}

export async function getNamedSigners(hre: HardhatRuntimeEnvironment): Promise<Record<string, SignerWithAddress>> {
  const getNamedAccounts = (hre as any).getNamedAccounts;
  if (getNamedAccounts !== undefined) {
    const namedAccounts = (await getNamedAccounts()) as any;
    const namedSigners: Record<string, SignerWithAddress> = {};
    for (const name of Object.keys(namedAccounts)) {
      try {
        const address = namedAccounts[name];
        if (address) {
          const signer = await _getSigner(hre, address); // TODO cache ?
          if (signer) {
            namedSigners[name] = signer;
          }
        }
      } catch(e) {}
    }
    return namedSigners;
  }
  throw new Error(
    `No Deployment Plugin Installed, try 'import "hardhat-deploy"'`
  ); 
}

export async function getUnnamedSigners(hre: HardhatRuntimeEnvironment): Promise<SignerWithAddress[]> {
  const getUnnamedAccounts = (hre as any).getUnnamedAccounts;
  if (getUnnamedAccounts !== undefined) {
    const unnamedAccounts = (await getUnnamedAccounts()) as string[];
    const unnamedSigners: SignerWithAddress[] = [];
    for (const address of unnamedAccounts) {
      if (address) {
        try {
          const signer = await _getSigner(hre, address);
          if (signer) {
            unnamedSigners.push(signer); // TODO cache ?
          }
        } catch(e) {}
      }
    }
    return unnamedSigners;
  }
  throw new Error(
    `No Deployment Plugin Installed, try 'import "hardhat-deploy"'`
  );
}


export async function getNamedSignerOrNull(hre: HardhatRuntimeEnvironment, name: string): Promise<SignerWithAddress| null> {
  const getNamedAccounts = (hre as any).getNamedAccounts;
  if (getNamedAccounts !== undefined) {
    const namedAccounts = (await getNamedAccounts()) as any;
    const address = namedAccounts[name];
    if (!address) {
      throw new Error(`no account named ${name}`);
    }
    const signer = await _getSigner(hre, address);
    if (signer) {
      return signer;
    }
    return null;
  }
  throw new Error(
    `No Deployment Plugin Installed, try 'import "hardhat-deploy"'`
  );
}

export async function getNamedSigner(hre: HardhatRuntimeEnvironment, name: string): Promise<SignerWithAddress> {
  const signer = await getNamedSignerOrNull(hre, name);
  if (!signer) {
    throw new Error(`no signer for ${name}`)
  }
  return signer;
}

export function getContractFactory<T extends ethers.ContractFactory>(
  hre: HardhatRuntimeEnvironment,
  name: string,
  signerOrOptions?: ethers.Signer | string | FactoryOptions
): Promise<T>;

export function getContractFactory<T extends ethers.ContractFactory>(
  hre: HardhatRuntimeEnvironment,
  abi: any[],
  bytecode: ethers.utils.BytesLike,
  signer?: ethers.Signer | string
): Promise<T>;

export async function getContractFactory<T extends ethers.ContractFactory>(
  hre: HardhatRuntimeEnvironment,
  nameOrAbi: string | any[],
  bytecodeOrFactoryOptions?:
    | (ethers.Signer | string | FactoryOptions)
    | ethers.utils.BytesLike,
  signer?: ethers.Signer | string
): Promise<T> {
  if (typeof nameOrAbi === "string") {
    return getContractFactoryByName<T>(
      hre,
      nameOrAbi,
      bytecodeOrFactoryOptions as ethers.Signer | string | FactoryOptions | undefined
    );
  }

  // will fallback on signers[0]
  // if (!signer) {
  //   throw new Error("need to specify signer or address");
  // }

  return getContractFactoryByAbiAndBytecode<T>(
    hre,
    nameOrAbi,
    bytecodeOrFactoryOptions as ethers.utils.BytesLike,
    signer
  );
}

function isFactoryOptions(
  signerOrOptions?: ethers.Signer | string | FactoryOptions
): signerOrOptions is FactoryOptions {
  const { Signer } = require("ethers") as typeof ethers;
  if (signerOrOptions === undefined || signerOrOptions instanceof Signer) {
    return false;
  }

  return true;
}

async function getContractFactoryByName<T extends ethers.ContractFactory>(
  hre: HardhatRuntimeEnvironment,
  contractName: string,
  signerOrOptions?: ethers.Signer | string | FactoryOptions
): Promise<T> {
  const artifact = await _getArtifact(hre, contractName);

  let libraries: Libraries = {};
  let signer: ethers.Signer | string | undefined;
  if (isFactoryOptions(signerOrOptions)) {
    signer = signerOrOptions.signer;
    libraries = signerOrOptions.libraries ?? {};
  } else {
    signer = signerOrOptions;
  }

  if (artifact.bytecode === "0x") {
    throw new NomicLabsHardhatPluginError(
      pluginName,
      `You are trying to create a contract factory for the contract ${contractName}, which is abstract and can't be deployed.
If you want to call a contract using ${contractName} as its interface use the "getContractAt" function instead.`
    );
  }

  const linkedBytecode = await collectLibrariesAndLink(artifact, libraries);

  return getContractFactoryByAbiAndBytecode(
    hre,
    artifact.abi,
    linkedBytecode,
    signer
  );
}

async function collectLibrariesAndLink(
  artifact: Artifact,
  libraries: Libraries
) {
  const { utils } = require("ethers") as typeof ethers;

  const neededLibraries: Array<{
    sourceName: string;
    libName: string;
  }> = [];
  if (artifact.linkReferences) {
    for (const [sourceName, sourceLibraries] of Object.entries(
      artifact.linkReferences
    )) {
      for (const libName of Object.keys(sourceLibraries)) {
        neededLibraries.push({ sourceName, libName });
      }
    }
  }
  

  const linksToApply: Map<string, Link> = new Map();
  for (const [linkedLibraryName, linkedLibraryAddress] of Object.entries(
    libraries
  )) {
    if (!utils.isAddress(linkedLibraryAddress)) {
      throw new NomicLabsHardhatPluginError(
        pluginName,
        `You tried to link the contract ${artifact.contractName} with the library ${linkedLibraryName}, but provided this invalid address: ${linkedLibraryAddress}`
      );
    }

    const matchingNeededLibraries = neededLibraries.filter((lib) => {
      return (
        lib.libName === linkedLibraryName ||
        `${lib.sourceName}:${lib.libName}` === linkedLibraryName
      );
    });

    if (matchingNeededLibraries.length === 0) {
      let detailedMessage: string;
      if (neededLibraries.length > 0) {
        const libraryFQNames = neededLibraries
          .map((lib) => `${lib.sourceName}:${lib.libName}`)
          .map((x) => `* ${x}`)
          .join("\n");
        detailedMessage = `The libraries needed are:
${libraryFQNames}`;
      } else {
        detailedMessage = "This contract doesn't need linking any libraries.";
      }
      throw new NomicLabsHardhatPluginError(
        pluginName,
        `You tried to link the contract ${artifact.contractName} with ${linkedLibraryName}, which is not one of its libraries.
${detailedMessage}`
      );
    }

    if (matchingNeededLibraries.length > 1) {
      const matchingNeededLibrariesFQNs = matchingNeededLibraries
        .map(({ sourceName, libName }) => `${sourceName}:${libName}`)
        .map((x) => `* ${x}`)
        .join("\n");
      throw new NomicLabsHardhatPluginError(
        pluginName,
        `The library name ${linkedLibraryName} is ambiguous for the contract ${artifact.contractName}.
It may resolve to one of the following libraries:
${matchingNeededLibrariesFQNs}

To fix this, choose one of these fully qualified library names and replace where appropriate.`
      );
    }

    const [neededLibrary] = matchingNeededLibraries;

    const neededLibraryFQN = `${neededLibrary.sourceName}:${neededLibrary.libName}`;

    // The only way for this library to be already mapped is
    // for it to be given twice in the libraries user input:
    // once as a library name and another as a fully qualified library name.
    if (linksToApply.has(neededLibraryFQN)) {
      throw new NomicLabsHardhatPluginError(
        pluginName,
        `The library names ${neededLibrary.libName} and ${neededLibraryFQN} refer to the same library and were given as two separate library links.
Remove one of them and review your library links before proceeding.`
      );
    }

    linksToApply.set(neededLibraryFQN, {
      sourceName: neededLibrary.sourceName,
      libraryName: neededLibrary.libName,
      address: linkedLibraryAddress,
    });
  }

  if (linksToApply.size < neededLibraries.length) {
    const missingLibraries = neededLibraries
      .map((lib) => `${lib.sourceName}:${lib.libName}`)
      .filter((libFQName) => !linksToApply.has(libFQName))
      .map((x) => `* ${x}`)
      .join("\n");

    throw new NomicLabsHardhatPluginError(
      pluginName,
      `The contract ${artifact.contractName} is missing links for the following libraries:
${missingLibraries}

Learn more about linking contracts at https://hardhat.org/plugins/nomiclabs-hardhat-ethers.html#library-linking
`
    );
  }

  return linkBytecode(artifact, [...linksToApply.values()]);
}

async function getContractFactoryByAbiAndBytecode<T extends ethers.ContractFactory>(
  hre: HardhatRuntimeEnvironment,
  abi: any[],
  bytecode: ethers.utils.BytesLike,
  signer?: ethers.Signer | string
): Promise<T> {
  const { ContractFactory } = require("ethers") as typeof ethers;

  if (signer === undefined) {
    const signers = await hre.ethers.getSigners();
    signer = signers[0];
  } else if (typeof signer === "string") {
    signer = await _getSigner(hre, signer);
  }

  const abiWithAddedGas = addGasToAbiMethodsIfNecessary(
    hre.network.config,
    abi
  );

  return new ContractFactory(abiWithAddedGas, bytecode, signer) as T;
}

export async function getContractAt<T extends ethers.Contract>(
  hre: HardhatRuntimeEnvironment,
  nameOrAbi: string | any[],
  address: string,
  signer?: ethers.Signer | string
): Promise<T> {
  const { Contract } = require("ethers") as typeof ethers;

  if (typeof nameOrAbi === "string") {
    const artifact = await _getArtifact(hre, nameOrAbi);
    const factory = await getContractFactoryByAbiAndBytecode(
      hre,
      artifact.abi,
      "0x",
      signer
    );
    // return factory.attach(address) as T;
    let contract = factory.attach(address);
    // If there's no signer, we connect the contract instance to the provider for the selected network.
    if (contract.provider === null) {
      contract = contract.connect(hre.ethers.provider);
    }
    return contract as T;
  }

  if (signer === undefined) {
    const signers = await hre.ethers.getSigners();
    signer = signers[0];
  } else if (typeof signer === "string") {
    signer = await _getSigner(hre, signer);
  }

  // If there's no signer, we want to put the provider for the selected network here.
  // This allows read only operations on the contract interface.
  const signerOrProvider: ethers.Signer | ethers.providers.Provider =
    signer !== undefined ? signer : hre.ethers.provider;

  const abiWithAddedGas = addGasToAbiMethodsIfNecessary(
    hre.network.config,
    nameOrAbi
  );

  return new Contract(address, abiWithAddedGas, signerOrProvider) as T;
}

export async function getContract<T extends ethers.Contract>(
  env: HardhatRuntimeEnvironment,
  contractName: string,
  signer?: ethers.Signer | string
): Promise<T> {
  const contract = await getContractOrNull<T>(env, contractName, signer);
  if (contract === null) {
    throw new Error(`No Contract deployed with name ${contractName}`);
  }
  return contract;
}

export async function getContractOrNull<T extends ethers.Contract>(
  env: HardhatRuntimeEnvironment,
  contractName: string,
  signer?: ethers.Signer | string
): Promise<T | null> {
  const deployments = (env as any).deployments;
  if (deployments !== undefined) {
    const get = deployments.getOrNull;
    const contract = (await get(contractName)) as any;
    if (contract === undefined) {
      return null;
    }
    return getContractAt<T>(
      env,
      contract.abi,
      contract.address,
      signer
    );
  }
  throw new Error(
    `No Deployment Plugin Installed, try 'import "hardhat-deploy"'`
  );
}

// This helper adds a `gas` field to the ABI function elements if the network
// is set up to use a fixed amount of gas.
// This is done so that ethers doesn't automatically estimate gas limits on
// every call.
function addGasToAbiMethodsIfNecessary(
  networkConfig: NetworkConfig,
  abi: any[]
): any[] {
  const { BigNumber } = require("ethers") as typeof ethers;

  if (networkConfig.gas === "auto" || networkConfig.gas === undefined) {
    return abi;
  }

  // ethers adds 21000 to whatever the abi `gas` field has. This may lead to
  // OOG errors, as people may set the default gas to the same value as the
  // block gas limit, especially on Hardhat Network.
  // To avoid this, we substract 21000.
  // HOTFIX: We substract 1M for now. See: https://github.com/ethers-io/ethers.js/issues/1058#issuecomment-703175279
  const gasLimit = BigNumber.from(networkConfig.gas).sub(1000000).toHexString();

  const modifiedAbi: any[] = [];

  for (const abiElement of abi) {
    if (abiElement.type !== "function") {
      modifiedAbi.push(abiElement);
      continue;
    }

    modifiedAbi.push({
      ...abiElement,
      gas: gasLimit,
    });
  }

  return modifiedAbi;
}

function linkBytecode(artifact: Artifact, libraries: Link[]): string {
  let bytecode = artifact.bytecode;

  // TODO: measure performance impact
  for (const { sourceName, libraryName, address } of libraries) {
    const linkReferences = artifact.linkReferences[sourceName][libraryName];
    for (const { start, length } of linkReferences) {
      bytecode =
        bytecode.substr(0, 2 + start * 2) +
        address.substr(2) +
        bytecode.substr(2 + (start + length) * 2);
    }
  }

  return bytecode;
}
