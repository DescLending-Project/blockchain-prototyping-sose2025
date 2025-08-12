import { PollingStatusCallback, sendTLSRequest } from '../utils/apiUtils';
import { HttpMethod } from 'tls-notary-shared/dist/types/tls';
import { validateApiUrl } from '../utils/authUtils';

/**
 * Sends a blockchain API request to retrieve block information
 * Uses TLS Notary to generate a verifiable proof of the response
 * 
 * @param apiEndpoint - The base URL of the blockchain API (e.g., Alchemy, Infura)
 * @param apiToken - The API token for authentication
 * @param blockNumber - The block number to retrieve (with or without 0x prefix)
 * @param statusCallback - Optional callback to receive status updates during the request
 * @returns Promise resolving to an object indicating if the response was received
 * @throws Error if the API endpoint, token, or block number is invalid
 */
export async function sendBlockchainRequest(
  apiEndpoint: string,
  apiToken: string,
  blockNumber: string,
  statusCallback?: PollingStatusCallback
): Promise<{ responseReceived: boolean }> {
  validateApiUrl(apiEndpoint);

  if (!apiToken) {
    throw new Error('API token is required');
  }

  if (!blockNumber) {
    throw new Error('Block number is required');
  }

  if (!blockNumber.startsWith('0x')) {
    blockNumber = '0x' + blockNumber;
  }

  const fullUrl = `${apiEndpoint}${apiToken}`;

  const requestBody = JSON.stringify({
    jsonrpc: "2.0",
    method: "eth_getBlockByNumber",
    params: [
      blockNumber,
      false
    ],
    id: 1
  });

  const headers = JSON.stringify({
    'Content-Type': 'application/json'
  });

  return sendTLSRequest(fullUrl, HttpMethod.POST, headers, requestBody, statusCallback);
}