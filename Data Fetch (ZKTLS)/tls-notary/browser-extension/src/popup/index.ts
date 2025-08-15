import { setupTabs } from './tabs';
import { setupHeaderManagement } from './headers';
import { setupApiTypeSelection } from './apiType';
import { setupRequestCapture } from './capture';
import { loadProofs  } from './proofs';
import { setupSettingsManagement, loadSettings } from './settings';
import { setupModal } from './modal';
import { setupOpenbankingTab } from './openbankingTab';
import { updateTunnelServiceApiBase } from 'tls-notary-shared';
import { browserTLSNotaryService } from '../services/BrowserTLSNotaryService';
import { tlsNotaryServiceBridge } from '../services/TLSNotaryServiceBridge';
import { isApiAccessible, copyToClipboard } from '../utils/apiUtils';
import {getSettings, initializeStorage, setSettings} from '../utils/storageUtils';

document.addEventListener('DOMContentLoaded', async function() {
  // Check if API is accessible
  const apiAvailable = await isApiAccessible();

  const apiUnavailableElement = document.getElementById('apiUnavailable');
  const mainContentElement = document.getElementById('mainContent');

  if (!apiAvailable) {
    // Show API unavailable message and hide main content
    if (apiUnavailableElement) apiUnavailableElement.style.display = 'block';
    if (mainContentElement) mainContentElement.style.display = 'none';

    // Load current API base URL into the input field
    const apiBaseInput = document.getElementById('apiBaseUnavailable') as HTMLInputElement;
    if (apiBaseInput) {
      getSettings().then(settings => {
        apiBaseInput.value = settings.apiBase || '';
      });
    }

    // Setup save and retry button
    const saveApiBaseBtn = document.getElementById('saveApiBaseBtn');
    if (saveApiBaseBtn) {
      saveApiBaseBtn.addEventListener('click', async () => {
        const apiBaseInput = document.getElementById('apiBaseUnavailable') as HTMLInputElement;
        if (!apiBaseInput || !apiBaseInput.value) {
          alert('Please enter a valid API server address.');
          return;
        }

        // Save the new API base URL to settings
        const settings = await getSettings();
        const newApiBase = apiBaseInput.value;

        // Update the TunnelService with the new API base address
        updateTunnelServiceApiBase(newApiBase);

        await setSettings({
          ...settings,
          apiBase: newApiBase
        });

        // Check if API is accessible with the new address
        const isAvailable = await isApiAccessible();

        if (isAvailable) {
          // Hide API unavailable message and show main content
          if (apiUnavailableElement) apiUnavailableElement.style.display = 'none';
          if (mainContentElement) mainContentElement.style.display = 'block';

          // Initialize the UI
          initializeUI();
        } else {
          alert('API server is still unavailable with the new address. Please check the address and try again.');
        }
      });
    }

    // Setup retry button
    const retryButton = document.getElementById('retryConnectionBtn');
    if (retryButton) {
      retryButton.addEventListener('click', async () => {
        // Check again if API is accessible
        const isAvailable = await isApiAccessible();

        if (isAvailable) {
          // Hide API unavailable message and show main content
          if (apiUnavailableElement) apiUnavailableElement.style.display = 'none';
          if (mainContentElement) mainContentElement.style.display = 'block';

          // Initialize the UI
          initializeUI();
        } else {
          alert('API server is still unavailable. Please try again later.');
        }
      });
    }

    // Setup copy buttons
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
 * Initialize the UI components
 */
function initializeUI() {
  initializeStorage();

  setupTabs();

  setupHeaderManagement();

  setupApiTypeSelection();

  setupRequestCapture();

  setupOpenbankingTab();

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
  console.log('TLSNotaryServiceBridge initialized:', tlsNotaryServiceBridge);

  // Unsubscribe when the popup is closed
  window.addEventListener('unload', () => {
    if (unsubscribe) {
      unsubscribe();
    }
  });

  console.log('TLS Notary popup script loaded');
}
