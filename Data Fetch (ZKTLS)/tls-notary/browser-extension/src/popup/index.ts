import { setupTabs } from './tabs';
import { setupHeaderManagement } from './headers';
import { setupApiTypeSelection } from './apiType';
import { setupRequestCapture } from './capture';
import { loadProofs  } from './proofs';
import { setupSettingsManagement, loadSettings } from './settings';
import { setupModal } from './modal';
import { setupOpenbankingTab } from './openbankingTab';
import { setupBlockchainTab } from './blockchainTab';
import { updateTunnelServiceApiBase } from 'tls-notary-shared';
import { browserTLSNotaryService } from '../services/BrowserTLSNotaryService';
import { tlsNotaryServiceBridge } from '../services/TLSNotaryServiceBridge';
import { isApiAccessible, copyToClipboard } from '../utils/apiUtils';
import {getSettings, initializeStorage, setSettings} from '../utils/storageUtils';

/**
 * Main entry point for the extension popup
 * Initializes the UI and handles API server availability
 * Sets up event listeners for API server configuration and retry functionality
 */
document.addEventListener('DOMContentLoaded', async function() {
  const apiAvailable = await isApiAccessible();

  const apiUnavailableElement = document.getElementById('apiUnavailable');
  const mainContentElement = document.getElementById('mainContent');

  if (!apiAvailable) {
    if (apiUnavailableElement) apiUnavailableElement.style.display = 'block';
    if (mainContentElement) mainContentElement.style.display = 'none';

    const apiBaseInput = document.getElementById('apiBaseUnavailable') as HTMLInputElement;
    if (apiBaseInput) {
      getSettings().then(settings => {
        apiBaseInput.value = settings.apiBase || '';
      });
    }

    const saveApiBaseBtn = document.getElementById('saveApiBaseBtn');
    if (saveApiBaseBtn) {
      saveApiBaseBtn.addEventListener('click', async () => {
        const apiBaseInput = document.getElementById('apiBaseUnavailable') as HTMLInputElement;
        if (!apiBaseInput || !apiBaseInput.value) {
          alert('Please enter a valid API server address.');
          return;
        }

        const settings = await getSettings();
        const newApiBase = apiBaseInput.value;

        updateTunnelServiceApiBase(newApiBase);

        await setSettings({
          ...settings,
          apiBase: newApiBase
        });

        const isAvailable = await isApiAccessible();

        if (isAvailable) {
          if (apiUnavailableElement) apiUnavailableElement.style.display = 'none';
          if (mainContentElement) mainContentElement.style.display = 'block';

          initializeUI();
        } else {
          alert('API server is still unavailable with the new address. Please check the address and try again.');
        }
      });
    }

    const retryButton = document.getElementById('retryConnectionBtn');
    if (retryButton) {
      retryButton.addEventListener('click', async () => {
        const isAvailable = await isApiAccessible();

        if (isAvailable) {
          if (apiUnavailableElement) apiUnavailableElement.style.display = 'none';
          if (mainContentElement) mainContentElement.style.display = 'block';

          initializeUI();
        } else {
          alert('API server is still unavailable. Please try again later.');
        }
      });
    }

    const copyButtons = document.querySelectorAll('.copy-btn');

    copyButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const textToCopy = button.getAttribute('data-clipboard-text'); // Get text from data attribute
        if (!textToCopy) return;
        copyToClipboard(textToCopy);
      });
    });


    return; // Don't initialize the UI if API is not accessible
  }

  // Initialize the UI if API is accessible
  initializeUI();
});

/**
 * Initializes all UI components and services for the extension
 * Sets up tabs, form handlers, API connections, and event listeners
 * Loads saved data, subscribes to service updates, and handles cleanup on window close
 */
function initializeUI() {
  initializeStorage();

  setupTabs();

  setupHeaderManagement();

  setupApiTypeSelection();

  setupRequestCapture();

  setupOpenbankingTab();

  setupBlockchainTab();

  setupSettingsManagement();

  setupModal();

  // Initial load of proofs
  loadProofs().catch(error => {
    console.error('Error loading proofs:', error);
  });

  loadSettings().catch(error => {
    console.error('Error loading settings:', error);
  });

  // Subscribe to BrowserTLSNotaryService for real-time updates
  let unsubscribe: (() => void) | null = null;
  browserTLSNotaryService.subscribe(() => {
    loadProofs().catch(error => {
      console.error('Error reloading proofs after update:', error);
    });
  }).then(unsubscribeFunc => {
    unsubscribe = unsubscribeFunc;
  }).catch(error => {
    console.error('Error subscribing to BrowserTLSNotaryService:', error);
  });

  // Initialize the bridge to sync proofs between shared module and browser extension
  // Just accessing the bridge singleton will initialize it
  if (tlsNotaryServiceBridge) {
    console.log('TLSNotaryServiceBridge initialized successfully');
  }

  // Unsubscribe when the popup is closed
  window.addEventListener('unload', () => {
    if (unsubscribe) {
      unsubscribe();
    }
    // Dispose of the bridge when the popup is closed
    if (tlsNotaryServiceBridge) {
      tlsNotaryServiceBridge.dispose();
    }
  });
}