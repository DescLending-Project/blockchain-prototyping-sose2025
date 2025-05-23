import { setupTabs } from './tabs';
import { setupHeaderManagement } from './headers';
import { setupApiTypeSelection } from './apiType';
import { setupRequestCapture } from './capture';
import { loadProofs  } from './proofs';
import { setupSettingsManagement, loadSettings } from './settings';
import { setupModal } from './modal';
import { TLSNotaryService } from '../utils/di';

document.addEventListener('DOMContentLoaded', function() {
  setupTabs();

  setupHeaderManagement();

  setupApiTypeSelection();

  setupRequestCapture();

  setupSettingsManagement();

  setupModal();

  // Initial load of proofs
  loadProofs().catch(error => {
    console.error('Error loading proofs:', error);
  });

  loadSettings().catch(error => {
    console.error('Error loading settings:', error);
  });

  // Subscribe to TLSNotaryService for real-time updates
  const unsubscribe = TLSNotaryService.subscribe(() => {
    loadProofs().catch(error => {
      console.error('Error reloading proofs after update:', error);
    });
  });

  // Unsubscribe when the popup is closed
  window.addEventListener('unload', () => {
    if (unsubscribe) {
      unsubscribe();
    }
  });

  console.log('TLS Notary popup script loaded');
});
