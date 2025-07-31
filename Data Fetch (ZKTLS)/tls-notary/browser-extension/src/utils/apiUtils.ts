import { config } from 'tls-notary-shared';
import { updateTunnelServiceApiBase } from 'tls-notary-shared';
import { getSettings } from './storageUtils';

/**
 * Checks if the API base URL is accessible
 * @returns Promise<boolean> - true if the API is accessible, false otherwise
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
