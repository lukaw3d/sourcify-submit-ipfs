import { FileHash } from "./util";
import {
  AuxdataStyle,
  decode as bytecodeDecode,
} from "@ethereum-sourcify/bytecode-utils";
import PendingContract from "./PendingContract";
import DecentralizedStorageFetcher from './DecentralizedStorageFetcher';

function isEmpty(obj: object): boolean {
  return !Object.keys(obj).length && obj.constructor === Object;
}

async function start() {
  // testnet 23295
  // mainnet 23294
  const chainId = 23294;
  const address = '0x7AC168c81F4F3820Fa3F22603ce5864D6aB3C547'
  const nexusResponse = (await (await fetch("https://nexus.oasis.io/v1/sapphire/accounts/"+address)).json())
  const creatorTxHash = nexusResponse.evm_contract.eth_creation_tx ? '0x' + nexusResponse.evm_contract.eth_creation_tx : undefined;
  const bytecode: string = '0x' + Buffer.from(nexusResponse.evm_contract.runtime_bytecode, 'base64').toString('hex');
  if (!nexusResponse.evm_contract.runtime_bytecode) throw 'no bytecode'

  let metadataHash: FileHash;
  try {
    /**
     * We decode the bytecode using `AuxdataStyle.SOLIDITY` since Solidity is currently
     * the only smart contract language that includes metadata information in its bytecode.
     * This metadata contains an IPFS CID that points to a JSON file with the contract's
     * source code and compiler settings.
     */
    const cborData = bytecodeDecode(bytecode, AuxdataStyle.SOLIDITY);
    metadataHash = FileHash.fromCborData(cborData);
  } catch (err: any) {
    console.log("Error extracting cborAuxdata or metadata hash", {
      address,
      err,
    });
    return;
  }

  const pendingContract = new PendingContract(
    metadataHash,
    address,
    chainId,
    {
      ipfs: new DecentralizedStorageFetcher(
        "ipfs",
        {
          enabled: true,
          gateways: ["https://ipfs.io/ipfs/"],
          timeout: 30000,
          interval: 5000,
          retries: 5,
        }
      )
    },
  );
  console.log("New pending contract", { address, metadataHash });
  try {
    await pendingContract.assemble();
  } catch (err: any) {
    console.log("Couldn't assemble contract", { address, err });
    return;
  }
  if (!isEmpty(pendingContract.pendingSources)) {
    console.warn("PendingSources not empty", {
      address: pendingContract.address,
      pendingSources: pendingContract.pendingSources,
    });
    return;
  }

  console.log("Contract assembled", { address, metadataHash, pendingContract });
  await pendingContract.sendToSourcifyServer(creatorTxHash);
}

start().catch(e => console.error(e))
