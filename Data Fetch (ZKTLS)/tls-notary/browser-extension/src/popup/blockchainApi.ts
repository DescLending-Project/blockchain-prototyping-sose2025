import { PollingStatusCallback, sendTLSRequest } from '../utils/apiUtils';
import { HttpMethod } from 'tls-notary-shared/dist/types/tls';

export async function sendBlockchainRequest(
  apiEndpoint: string,
  apiToken: string,
  blockNumber: string,
  statusCallback?: PollingStatusCallback
): Promise<{ responseReceived: boolean }> {
  if (!apiEndpoint) {
    throw new Error('API endpoint is required');
  }

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
