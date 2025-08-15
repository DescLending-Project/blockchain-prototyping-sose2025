import { getSettings, setSettings } from '../utils/storageUtils';
import { updateTunnelServiceApiBase } from 'tls-notary-shared';

export function setupSettingsManagement(): void {
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');

  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', saveSettings);
  }
}

async function saveSettings(): Promise<void> {
  try {
    const notaryServerElement = document.getElementById('notaryServer') as HTMLInputElement;
    const apiBaseElement = document.getElementById('apiBase') as HTMLInputElement;
    const tlsLocalPortElement = document.getElementById('tlsLocalPort') as HTMLInputElement;

    if (!notaryServerElement || !apiBaseElement || !tlsLocalPortElement) {
      console.log('Settings form elements not found');
      return;
    }

    const notaryServer = notaryServerElement.value;
    const apiBase = apiBaseElement.value;
    const tlsLocalPort = tlsLocalPortElement.value;

    if (apiBase) {
      updateTunnelServiceApiBase(apiBase);
    }

    await setSettings({
      notaryServer,
      apiBase,
      tlsLocalPort
    });

  } catch (error) {
    console.error('Error saving settings:', error);
  }
}

export async function loadSettings(): Promise<void> {
  try {
    const settings = await getSettings();

    const notaryServerElement = document.getElementById('notaryServer') as HTMLInputElement;
    const apiBaseElement = document.getElementById('apiBase') as HTMLInputElement;
    const tlsLocalPortElement = document.getElementById('tlsLocalPort') as HTMLInputElement;

    if (settings.notaryServer && notaryServerElement) {
      notaryServerElement.value = settings.notaryServer;
    }

    if (settings.apiBase && apiBaseElement) {
      apiBaseElement.value = settings.apiBase;
    }

    if (settings.tlsLocalPort && tlsLocalPortElement) {
      tlsLocalPortElement.value = settings.tlsLocalPort;
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}