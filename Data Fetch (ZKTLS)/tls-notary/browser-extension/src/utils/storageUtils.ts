import { TLSProof, Settings } from '../types/types';

/**
 * Get proofs from storage
 * @returns Promise that resolves with the proofs
 */
export function getProofs(): Promise<TLSProof[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get('proofs', (data) => {
      resolve(data.proofs || []);
    });
  });
}

/**
 * Set proofs in storage
 * @param proofs The proofs to set
 * @returns Promise that resolves when the proofs are set
 */
export function setProofs(proofs: TLSProof[]): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ proofs }, resolve);
  });
}

/**
 * Get settings from storage
 * @returns Promise that resolves with the settings
 */
export function getSettings(): Promise<Settings> {
  return new Promise((resolve) => {
    chrome.storage.local.get('settings', (data) => {
      resolve(data.settings || { 
        notaryServer: 'https://notary.pse.dev/v0.1.0-alpha.10',
        apiBase: 'http://localhost:8090/tunnels',
        tlsLocalPort: '8091'
      });
    });
  });
}

/**
 * Set settings in storage
 * @param settings The settings to set
 * @returns Promise that resolves when the settings are set
 */
export function setSettings(settings: Settings): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ settings }, resolve);
  });
}

export function initializeStorage(): void {
  chrome.runtime.onInstalled.addListener(async () => {
    const proofs = await getProofs();
    const settings = await getSettings();

    if (proofs.length === 0) {
      await setProofs([]);
    }

    if (!settings.notaryServer || !settings.apiBase || !settings.tlsLocalPort) {
      await setSettings({
        notaryServer: settings.notaryServer || 'https://notary.pse.dev/v0.1.0-alpha.10',
        apiBase: settings.apiBase || 'http://localhost:8090/tunnels',
        tlsLocalPort: settings.tlsLocalPort || '8091'
      });
    }
  });
}
