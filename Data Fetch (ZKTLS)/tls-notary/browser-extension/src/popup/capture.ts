import { collectHeaders } from './headers';
import { loadProofs } from './proofs';
import { TLSFormData } from "tls-notary-shared";
import { TLSNotaryService } from "tls-notary-shared";
import { getSettings } from '../utils/storageUtils';
import { config } from "tls-notary-shared";
import { browser } from 'webextension-polyfill-ts';
// @ts-ignore
declare const chrome: any;


export function setupRequestCapture(): void {
  console.log('Setting up request capture functionality');
  const captureBtn = document.getElementById('captureBtn');
  const captureCurrentPageBtn = document.getElementById('captureCurrentPageBtn');

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

  if (captureCurrentPageBtn) {
    console.log('Capture current page button found, adding event listener');
    captureCurrentPageBtn.addEventListener('click', async () => {
      console.log('Capture current page button clicked');
      try {
        console.log('Initiating current page capture');
        const requestId = await captureCurrentPage();
        console.log('Current page captured successfully with ID:', requestId);

        // Refresh proof list
        console.log('Refreshing proof list');
        loadProofs().catch(error => {
          console.error('Error loading proofs:', error);
        });
      } catch (error) {
        console.error('Error capturing current page:', error);
      }
    });
  } else {
    console.warn('Capture current page button not found in the DOM');
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

  // Ensure remotePort is defined
  if (!config.tlsRemotePort) {
    console.error('TLS remote port is not configured');
    throw new Error('TLS remote port is not configured');
  }
  const remotePort = config.tlsRemotePort;

  // Use the configured tlsLocalPort value from settings, or fall back to the default
  const localPort = settings.tlsLocalPort || config.tlsLocalPort;
  if (!localPort) {
    console.error('TLS local port is not configured');
    throw new Error('TLS local port is not configured');
  }

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

async function captureCurrentPage(): Promise<string> {
  console.log('Starting captureCurrentPage function');

  try {
    // Get the active tab in the current window
    console.log('Getting active tab');
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });

    if (tabs.length === 0) {
      console.error('No active tab found');
      throw new Error('No active tab found');
    }

    const activeTab = tabs[0];
    const url = activeTab.url;

    if (!url) {
      console.error('Active tab has no URL');
      throw new Error('Active tab has no URL');
    }

    console.log('Active tab URL:', url);

    // Validate URL
    try {
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

    // Extract domain information
    console.log('Extracting remote DNS from URL');
    const remoteDNS = new URL(url).hostname;

    // Ensure remotePort is defined
    if (!config.tlsRemotePort) {
      console.error('TLS remote port is not configured');
      throw new Error('TLS remote port is not configured');
    }
    const remotePort = config.tlsRemotePort;

    // Use the configured tlsLocalPort value from settings, or fall back to the default
    const localPort = settings.tlsLocalPort || config.tlsLocalPort;
    if (!localPort) {
      console.error('TLS local port is not configured');
      throw new Error('TLS local port is not configured');
    }

    console.log('Connection details:', { remoteDNS, remotePort, localPort });

    // Execute a content script to get the page's headers
    console.log('Executing content script to get headers');
    let headers = '{}';
    try {
      // Ensure tab ID is defined
      if (!activeTab.id) {
        console.error('Tab ID is not defined');
        throw new Error('Tab ID is not defined');
      }

      // Try to execute a content script to get headers from the page using chrome.scripting API
      const result = await chrome.scripting.executeScript({
        target: { tabId: activeTab.id as number },
        func: () => {
          // Get all headers from the current page
          const headers: Record<string, string> = {};
          // Add any headers you can access from the page
          // Note: Due to browser security restrictions, this might be limited
          if (document.cookie) {
            headers['Cookie'] = document.cookie;
          }
          return JSON.stringify(headers);
        }
      });

      if (!result) {
        console.warn('Script execution returned no result');
      } else if (!Array.isArray(result) || result.length === 0) {
        console.warn('Script execution returned empty result array');
      } else if (!result[0]) {
        console.warn('Script execution result[0] is undefined');
      } else if (result[0].result === undefined || result[0].result === null) {
        console.warn('Script execution result[0].result is undefined or null');
      } else {
        headers = result[0].result as string;
        console.log('Headers collected from page:', headers);
      }
    } catch (error) {
      console.warn('Could not execute content script to get headers:', error);
      console.log('Using empty headers object');
    }

    // Use GET method for capturing the current page
    const method = 'GET';
    const body = '';

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
  } catch (error) {
    console.error('Error capturing current page:', error);
    throw error;
  }
}
