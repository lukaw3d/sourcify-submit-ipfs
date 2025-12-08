import { FileHash, base64ToHex } from "./util";
import {
  AuxdataStyle,
  decode as bytecodeDecode,
} from "@ethereum-sourcify/bytecode-utils";
import PendingContract from "./PendingContract";
import DecentralizedStorageFetcher from './DecentralizedStorageFetcher';

function isEmpty(obj: object): boolean {
  return !Object.keys(obj).length && obj.constructor === Object;
}

interface LogEntry {
  type: 'info' | 'error' | 'success' | 'warn';
  message: string;
  timestamp: string;
}

class UILogger {
  private logs: LogEntry[] = [];
  private logsContainer: HTMLElement | null = null;

  setContainer(container: HTMLElement) {
    this.logsContainer = container;
  }

  addLog(type: LogEntry['type'], message: string) {
    const entry: LogEntry = {
      type,
      message,
      timestamp: new Date().toLocaleTimeString(),
    };
    this.logs.push(entry);
    this.render();
  }

  clear() {
    this.logs = [];
    this.render();
  }

  private render() {
    if (!this.logsContainer) return;

    // Clear existing content
    this.logsContainer.textContent = '';

    // Create DOM elements safely
    this.logs.forEach(log => {
      const logDiv = document.createElement('div');
      logDiv.className = `log-entry ${log.type}`;

      const timestampStrong = document.createElement('strong');
      timestampStrong.textContent = `[${log.timestamp}] `;

      const messageText = document.createTextNode(log.message);

      logDiv.appendChild(timestampStrong);
      logDiv.appendChild(messageText);
      this.logsContainer!.appendChild(logDiv);
    });

    // Auto-scroll to bottom
    this.logsContainer.scrollTop = this.logsContainer.scrollHeight;
  }
}

const uiLogger = new UILogger();

async function startForChain(chainId: number, address: string, chainName: string) {
  uiLogger.addLog('info', `\n=== Starting verification for ${chainName} (Chain ID: ${chainId}) ===`);

  try {
    // Determine Nexus API endpoint based on chain ID
    const nexusBaseUrl = chainId === 23295
      ? "https://testnet.nexus.oasis.io/v1/sapphire/accounts/"
      : "https://nexus.oasis.io/v1/sapphire/accounts/";

    uiLogger.addLog('info', `Fetching contract data from Nexus API (${chainName})...`);
    const nexusResponse = await (await fetch(nexusBaseUrl + address)).json();

    const creatorTxHash = nexusResponse.evm_contract.eth_creation_tx ? '0x' + nexusResponse.evm_contract.eth_creation_tx : undefined;

    if (!nexusResponse.evm_contract.runtime_bytecode) {
      throw new Error('No bytecode found');
    }

    // Convert base64 to hex (browser-compatible)
    const bytecode: string = '0x' + base64ToHex(nexusResponse.evm_contract.runtime_bytecode);
    uiLogger.addLog('info', `Bytecode retrieved (${bytecode.length} chars)`);

    let metadataHash: FileHash;
    try {
      /**
       * We decode the bytecode using `AuxdataStyle.SOLIDITY` since Solidity is currently
       * the only smart contract language that includes metadata information in its bytecode.
       * This metadata contains an IPFS CID that points to a JSON file with the contract's
       * source code and compiler settings.
       */
      uiLogger.addLog('info', 'Decoding bytecode to extract metadata hash...');
      const cborData = bytecodeDecode(bytecode, AuxdataStyle.SOLIDITY);
      metadataHash = FileHash.fromCborData(cborData);
      uiLogger.addLog('success', `Metadata hash extracted: ${metadataHash.origin}-${metadataHash.hash}`);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      uiLogger.addLog('error', `Error extracting cborAuxdata or metadata hash: ${errorMsg}`);
      throw err;
    }

    uiLogger.addLog('info', 'Creating PendingContract instance...');
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
            timeout: 10000,
            interval: 5000,
            retries: 1,
          }
        )
      },
    );

    uiLogger.addLog('info', `New pending contract created: ${address}`);

    try {
      uiLogger.addLog('info', 'Assembling contract (fetching metadata and sources)...');
      await pendingContract.assemble();
      uiLogger.addLog('success', 'Contract assembled successfully');
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      uiLogger.addLog('error', `Couldn't assemble contract: ${errorMsg}`);
      throw err;
    }

    if (!isEmpty(pendingContract.pendingSources)) {
      uiLogger.addLog('warn', `PendingSources not empty: ${JSON.stringify(Object.keys(pendingContract.pendingSources))}`);
      return null;
    }

    uiLogger.addLog('info', 'Sending contract to Sourcify server...');
    const result = await pendingContract.sendToSourcifyServer(creatorTxHash);
    uiLogger.addLog('success', `Contract successfully submitted to Sourcify for ${chainName}!`);
    uiLogger.addLog('info', `Response: ${JSON.stringify(result, null, 2)}`);

    return result;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    uiLogger.addLog('error', `Error for ${chainName}: ${errorMsg}`);
    throw err;
  }
}

async function start(address: string) {
  uiLogger.addLog('info', `Starting verification for contract ${address}`);
  uiLogger.addLog('info', 'Will attempt submission to both Sapphire mainnet and testnet in parallel');

  // Run both network submissions in parallel
  const [testnetResult, mainnetResult] = await Promise.allSettled([
    startForChain(23295, address, 'Sapphire Testnet'),
    startForChain(23294, address, 'Sapphire Mainnet'),
  ]);

  const results: { chainId: number; chainName: string; success: boolean; result?: unknown; error?: string }[] = [];

  // Process testnet result
  if (testnetResult.status === 'fulfilled') {
    results.push({ chainId: 23295, chainName: 'Sapphire Testnet', success: true, result: testnetResult.value });
  } else {
    const errorMsg = testnetResult.reason instanceof Error ? testnetResult.reason.message : String(testnetResult.reason);
    results.push({ chainId: 23295, chainName: 'Sapphire Testnet', success: false, error: errorMsg });
  }

  // Process mainnet result
  if (mainnetResult.status === 'fulfilled') {
    results.push({ chainId: 23294, chainName: 'Sapphire Mainnet', success: true, result: mainnetResult.value });
  } else {
    const errorMsg = mainnetResult.reason instanceof Error ? mainnetResult.reason.message : String(mainnetResult.reason);
    results.push({ chainId: 23294, chainName: 'Sapphire Mainnet', success: false, error: errorMsg });
  }

  // Summary
  uiLogger.addLog('info', '\n=== Summary ===');
  results.forEach(r => {
    if (r.success) {
      uiLogger.addLog('success', `✓ ${r.chainName} (${r.chainId}): Successfully submitted`);
    } else {
      uiLogger.addLog('error', `✗ ${r.chainName} (${r.chainId}): ${r.error}`);
    }
  });

  const successCount = results.filter(r => r.success).length;
  return { results, successCount, totalAttempts: results.length };
}

// UI Setup
const form = document.getElementById('contractForm') as HTMLFormElement;
const submitBtn = document.getElementById('submitBtn') as HTMLButtonElement;
const statusDiv = document.getElementById('status') as HTMLElement;
const logsDiv = document.getElementById('logs') as HTMLElement;
const addressInput = document.getElementById('address') as HTMLInputElement;

uiLogger.setContainer(logsDiv);

// Get address from URL query parameter
const urlParams = new URLSearchParams(window.location.search);
const addressFromUrl = urlParams.get('address');
if (addressFromUrl) {
  addressInput.value = addressFromUrl.trim();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const formData = new FormData(form);
  const address = (formData.get('address') as string || '').trim();

  if (!address) {
    alert('Please enter a contract address');
    return;
  }

  // Reset UI
  submitBtn.disabled = true;
  submitBtn.textContent = 'Processing...';
  statusDiv.style.display = 'block';
  statusDiv.className = 'status loading';
  statusDiv.textContent = 'Processing contract verification for both networks...';
  logsDiv.style.display = 'block';
  uiLogger.clear();

  try {
    const { successCount, totalAttempts } = await start(address);

    if (successCount > 0) {
      statusDiv.className = 'status success';
      statusDiv.textContent = `✓ Successfully submitted to ${successCount} out of ${totalAttempts} network(s)!`;
    } else {
      statusDiv.className = 'status error';
      statusDiv.textContent = `✗ Failed to submit to all networks. Check logs for details.`;
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    statusDiv.className = 'status error';
    statusDiv.textContent = `✗ Error: ${errorMsg}`;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit to Sourcify (Mainnet & Testnet)';
  }
});
