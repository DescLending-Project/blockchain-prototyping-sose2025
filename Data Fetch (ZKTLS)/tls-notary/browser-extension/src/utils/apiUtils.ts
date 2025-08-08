import {config, TLSFormData, TLSNotaryService} from 'tls-notary-shared';
import { updateTunnelServiceApiBase } from 'tls-notary-shared';
import { HttpMethod } from 'tls-notary-shared/dist/types/tls';
import { getSettings } from './storageUtils';

export interface PollingStatusCallback {
  (status: string, attempt: number, maxAttempts: number): void;
}

export async function pollForProofRecord(
  requestId: string,
  statusCallback?: PollingStatusCallback
): Promise<any> {
  let proofRecord = null;
  let attempts = 0;
  const maxAttempts = 30;
  let lastError: Error | null = null;
  
  if (statusCallback) {
    statusCallback('Loading...', 0, maxAttempts);
  }
  
  while (attempts < maxAttempts) {
    attempts++;
    
    try {
      proofRecord = await TLSNotaryService.getProof(requestId);
      
      if (proofRecord && proofRecord.tlsCallResponse && proofRecord.tlsCallResponse.responseBody) {
        if (proofRecord.error) {
          const errorMessage = typeof proofRecord.error === 'string' 
            ? proofRecord.error 
            : 'Server returned an error processing the request';
          lastError = new Error(errorMessage);
          
          if (statusCallback) {
            statusCallback('Error: ' + errorMessage, attempts, maxAttempts);
          }
          
          return proofRecord;
        } else {
          if (statusCallback) {
            statusCallback('Done!', attempts, maxAttempts);
          }
          return proofRecord;
        }
      } else if (proofRecord && proofRecord.error) {
        const errorMessage = typeof proofRecord.error === 'string'
          ? proofRecord.error 
          : 'Server returned an error processing the request';
        lastError = new Error(errorMessage);
        
        if (statusCallback) {
          statusCallback('Error: ' + errorMessage, attempts, maxAttempts);
        }
        
        return proofRecord;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error fetching proof record';
      lastError = error instanceof Error ? error : new Error(errorMessage);
      
      if (errorMessage.includes('not found') || errorMessage.includes('invalid') ||
          errorMessage.includes('permission') || errorMessage.includes('unauthorized')) {
        
        if (statusCallback) {
          statusCallback('Error: ' + errorMessage, attempts, maxAttempts);
        }
        throw lastError;
      }
    }
    
    await new Promise(resolve => setTimeout(resolve, 4000));
  }
  
  if (lastError) {
    throw lastError;
  } else {
    throw new Error('No response received from the server after multiple attempts');
  }
}

export function validateResponse(
  proofRecord: any, 
  statusCallback?: PollingStatusCallback
): { responseReceived: boolean } {
  if (!proofRecord || !proofRecord.tlsCallResponse) {
    if (statusCallback) {
      statusCallback('Error: Invalid response received from server', 0, 0);
    }
    throw new Error('Invalid response received from server');
  }

  const responseBody = proofRecord.tlsCallResponse.responseBody;
  if (!responseBody) {
    if (statusCallback) {
      statusCallback('Error: Empty response received from server', 0, 0);
    }
    throw new Error('Empty response received from server');
  }

  // Response was received successfully
  return { responseReceived: true };
}

/**
 * Checks if the API server is accessible
 * @returns Promise that resolves to true if API is accessible, false otherwise
 */
export async function isApiAccessible(): Promise<boolean> {
  try {
    const settings = await getSettings();
    const apiBaseUrl = settings.apiBase || config.apiBase;

    updateTunnelServiceApiBase(apiBaseUrl);

    const response = await fetch(apiBaseUrl, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000)
    });

    return response.ok;
  } catch (error) {
    console.error('Error checking API accessibility:', error);
    return false;
  }
}

export async function sendTLSRequest(
  apiUrl: string,
  method: HttpMethod = HttpMethod.GET,
  headers: string = '{}',
  body: string = '',
  statusCallback?: PollingStatusCallback
): Promise<{ responseReceived: boolean }> {
  const settings = await getSettings();
  const notaryUrl = settings.notaryServer || '';

  if (!notaryUrl) {
    throw new Error('Notary server URL is not configured. Please set it in the Settings tab.');
  }

  const remoteDNS = new URL(apiUrl).hostname;

  if (!config.tlsRemotePort) {
    throw new Error('TLS remote port is not configured');
  }
  const remotePort = config.tlsRemotePort;

  const localPort = settings.tlsLocalPort || config.tlsLocalPort;
  if (!localPort) {
    throw new Error('TLS local port is not configured');
  }

  const formData: TLSFormData = {
    url: apiUrl,
    notaryUrl,
    remoteDNS,
    remotePort,
    localPort,
    headers,
    body,
    method
  };

  const requestId = await TLSNotaryService.sendRequest(formData);

  let proofRecord;
  try {
    proofRecord = await pollForProofRecord(requestId, statusCallback);
  } catch (error) {
    if (statusCallback) {
      statusCallback('Error: Failed to get response', 0, 0);
    }
    throw new Error(`Failed to get response: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  return validateResponse(proofRecord, statusCallback);
}

export function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text)
      .then(() => {
        showTooltip('Copied to clipboard!');
      })
      .catch(err => {
        console.error('Failed to copy text:', err);
      });
}

function showTooltip(message: string) {
  const tooltip = document.createElement('div');
  tooltip.className = 'copy-tooltip';
  tooltip.textContent = message;

  document.body.appendChild(tooltip);

  setTimeout(() => {
    tooltip.classList.add('show');
  }, 10);

  setTimeout(() => {
    tooltip.classList.remove('show');
    setTimeout(() => {
      document.body.removeChild(tooltip);
    }, 300);
  }, 2000);
}
