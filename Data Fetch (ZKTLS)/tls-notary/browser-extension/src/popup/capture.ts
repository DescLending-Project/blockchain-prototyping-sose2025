import { collectHeaders } from './headers';
import { loadProofs } from './proofs';
import { TLSFormData } from "tls-notary-shared";
import { TLSNotaryService } from "tls-notary-shared";
import { getSettings } from '../utils/storageUtils';
import { config } from "tls-notary-shared";
import { browser } from 'webextension-polyfill-ts';
// @ts-ignore
declare const chrome: any;

/**
 * Processes a URL to extract connection details and validate settings
 * @param url The URL to process
 * @returns Object containing connection details and notary URL
 * @throws Error if URL is invalid or connection settings are not configured
 */
async function processUrl(url: string): Promise<{
  remoteDNS: string;
  remotePort: string;
  localPort: string;
  notaryUrl: string;
}> {
  // Validate URL
  if (!url) {
    throw new Error('URL is required');
  }

  try {
    new URL(url);
  } catch (error) {
    throw new Error('Invalid URL format');
  }

  // Get settings for notary server URL
  const settings = await getSettings();
  const notaryUrl = settings.notaryServer || '';

  if (!notaryUrl) {
    throw new Error('Notary server URL is not configured. Please set it in the Settings tab.');
  }

  // Extract domain information
  const remoteDNS = new URL(url).hostname;

  // Ensure remotePort is defined
  if (!config.tlsRemotePort) {
    throw new Error('TLS remote port is not configured');
  }
  const remotePort = String(config.tlsRemotePort);

  // Use the configured tlsLocalPort value from settings, or fall back to the default
  const localPort = settings.tlsLocalPort ? String(settings.tlsLocalPort) : String(config.tlsLocalPort);
  if (!localPort) {
    throw new Error('TLS local port is not configured');
  }

  console.log('Connection details:', { remoteDNS, remotePort, localPort });

  return {
    remoteDNS,
    remotePort,
    localPort,
    notaryUrl
  };
}


/**
 * Sets up the request capture functionality in the extension
 * Initializes event listeners for the capture button
 * Handles capturing requests from the UI form and refreshing the proof list
 */
export function setupRequestCapture(): void {
  const captureBtn = document.getElementById('captureBtn');
  // const captureCurrentPageBtn = document.getElementById('captureCurrentPageBtn');

  if (captureBtn) {
    captureBtn.addEventListener('click', async () => {
      try {
        await captureRequestFromUI();

        // Refresh proof list
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

  // Capture current page logic, disabled as extension migrated to separate window
  // if (captureCurrentPageBtn) {
  //   captureCurrentPageBtn.addEventListener('click', async () => {
  //     await captureCurrentPage();
  //
  //     // Refresh proof list
  //     loadProofs().catch(error => {
  //       console.error('Error loading proofs:', error);
  //     });
  //   });
  // } else {
  //   console.warn('Capture current page button not found in the DOM');
  // }
}

/**
 * Captures a request from the UI form and sends it to the TLS Notary service
 * Collects form data, validates inputs, and creates a TLS Notary request
 * Handles URL validation, connection settings, and header collection
 * @returns Promise that resolves with the request ID from the TLS Notary service
 * @throws Error if required form elements are missing, URL is invalid, or connection settings are not configured
 */
async function captureRequestFromUI(): Promise<string> {

  const urlElement = document.getElementById('url') as HTMLInputElement;
  const methodElement = document.getElementById('method') as HTMLSelectElement;
  const requestBodyElement = document.getElementById('requestBody') as HTMLTextAreaElement;

  if (!urlElement || !methodElement || !requestBodyElement) {
    throw new Error('Required form elements not found');
  }

  const url = urlElement.value;
  const method = methodElement.value as any;
  const body = method === 'POST' || method === 'PUT' ? requestBodyElement.value : '';

  // Process URL to get connection details
  const { remoteDNS, remotePort, localPort, notaryUrl } = await processUrl(url);

  const headersObj = collectHeaders();
  const headers = JSON.stringify(headersObj);

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

  return await TLSNotaryService.sendRequest(formData);
}

/**
 * Captures the current active tab's page and sends it to the TLS Notary service
 * Gets the active tab's URL, extracts connection details, and attempts to collect headers
 * Creates a TLS Notary request for the current page with GET method
 * @returns Promise that resolves with the request ID from the TLS Notary service
 * @throws Error if no active tab is found, URL is invalid, or connection settings are not configured
 */
async function captureCurrentPage(): Promise<string> {
  // Get the active tab in the current window
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });

  if (tabs.length === 0) {
    throw new Error('No active tab found');
  }

  const activeTab = tabs[0];
  const url = activeTab.url;

  if (!url) {
    throw new Error('Active tab has no URL');
  }

  // Process URL to get connection details
  const { remoteDNS, remotePort, localPort, notaryUrl } = await processUrl(url);

  // Execute a content script to get the page's headers
  let headers = '{}';
  try {
    // Ensure tab ID is defined
    if (!activeTab.id) {
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
}
