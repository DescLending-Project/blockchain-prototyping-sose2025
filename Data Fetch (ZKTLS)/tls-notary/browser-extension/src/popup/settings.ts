import { getSettings, setSettings } from '../utils/storageUtils';

export function setupSettingsManagement(): void {
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');

  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', saveSettings);
  }
}

async function saveSettings(): Promise<void> {
  try {
    const notaryServerElement = document.getElementById('notaryServer') as HTMLInputElement;

    if (!notaryServerElement) {
      console.log('Settings form elements not found');
      return;
    }

    const notaryServer = notaryServerElement.value;

    await setSettings({
      notaryServer
    });

    console.log('Settings saved successfully!');
  } catch (error) {
    console.error('Error saving settings:', error);
    console.log('Failed to save settings');
  }
}

export async function loadSettings(): Promise<void> {
  try {
    const settings = await getSettings();

    const notaryServerElement = document.getElementById('notaryServer') as HTMLInputElement;

    if (settings.notaryServer && notaryServerElement) {
      notaryServerElement.value = settings.notaryServer;
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}
