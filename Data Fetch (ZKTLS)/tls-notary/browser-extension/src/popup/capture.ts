import { collectHeaders } from './headers';
import { loadProofs } from './proofs';
import { TLSFormData } from "tls-notary-shared";
import { TLSNotaryService } from "tls-notary-shared";
import { getSettings } from '../utils/storageUtils';
import { config } from "tls-notary-shared";


export function setupRequestCapture(): void {
  console.log('Setting up request capture functionality');
  const captureBtn = document.getElementById('captureBtn');

  if (captureBtn) {
    console.log('Capture button found, adding event listener');
    captureBtn.addEventListener('click', async () => {
      console.log('Capture button clicked');
      try {
        console.log('Initiating request capture from UI');
        const requestId = await captureRequestFromUI();
        console.log('Request captured successfully with ID:', requestId);

        // Refresh proof list
        console.log('Refreshing proof list');
        loadProofs().catch(error => {
          console.error('Error loading proofs:', error);
        });
      } catch (error) {
        console.error('Error capturing request:', error);
      }
    });
  } else {
    console.warn('Capture button not found in the DOM');
  }
}

async function captureRequestFromUI(): Promise<string> {
  console.log('Starting captureRequestFromUI function');

  console.log('Getting form elements from DOM');
  const urlElement = document.getElementById('url') as HTMLInputElement;
  const methodElement = document.getElementById('method') as HTMLSelectElement;
  const requestBodyElement = document.getElementById('requestBody') as HTMLTextAreaElement;

  if (!urlElement || !methodElement || !requestBodyElement) {
    console.error('Required form elements not found');
    throw new Error('Required form elements not found');
  }

  console.log('Extracting values from form elements');
  const url = urlElement.value;
  const method = methodElement.value as any; // Cast to HttpMethod
  const body = method === 'POST' || method === 'PUT' ? requestBodyElement.value : '';
  console.log('Form values:', { url, method, hasBody: !!body });

  // Validate URL
  if (!url) {
    console.error('URL validation failed: URL is empty');
    throw new Error('URL is required');
  }

  try {
    // Test if URL is valid
    console.log('Validating URL format');
    new URL(url);
    console.log('URL format is valid');
  } catch (error) {
    console.error('URL validation failed: Invalid format', error);
    throw new Error('Invalid URL format');
  }

  // Get settings for notary server URL
  console.log('Getting settings for notary server URL');
  const settings = await getSettings();
  const notaryUrl = settings.notaryServer || '';
  console.log('Notary server URL from settings:', notaryUrl);

  if (!notaryUrl) {
    console.error('Notary server URL is not configured');
    throw new Error('Notary server URL is not configured. Please set it in the Settings tab.');
  }

  // For now, use default values for these fields
  // In a real implementation, these might come from settings or additional form fields
  console.log('Extracting remote DNS from URL');
  const remoteDNS = new URL(url).hostname;
  const remotePort = config.tlsRemotePort;
  // Use the configured tlsLocalPort value from settings, or fall back to the default
  const localPort = settings.tlsLocalPort || config.tlsLocalPort;
  console.log('Connection details:', { remoteDNS, remotePort, localPort });

  // Collect headers from the UI
  console.log('Collecting headers from UI');
  const headersObj = collectHeaders();
  const headers = JSON.stringify(headersObj);
  console.log('Headers collected, count:', Object.keys(headersObj).length);

  console.log('Creating form data object');
  const formData: TLSFormData = {
    url,
    notaryUrl,
    remoteDNS,
    remotePort,
    localPort,
    headers,
    body,
    method
  };

  // Use the TLSNotaryService to send the request
  console.log('Sending request to TLSNotaryService');
  const requestId = await TLSNotaryService.sendRequest(formData);
  console.log('Request sent to TLSNotaryService, received ID:', requestId);

  return requestId;
}
