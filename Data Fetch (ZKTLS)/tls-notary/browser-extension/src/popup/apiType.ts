import { config } from "tls-notary-shared";

/**
 * Sets up the API type selection dropdown
 * Handles the change event to pre-fill the URL field based on the selected API type
 * This simplifies the process of capturing requests for specific API types
 */
export function setupApiTypeSelection(): void {
  const apiTypeElement = document.getElementById('apiType') as HTMLSelectElement;
  const urlElement = document.getElementById('url') as HTMLInputElement;

  if (apiTypeElement && urlElement) {
    apiTypeElement.addEventListener('change', () => {
      const apiType = apiTypeElement.value;

      // Pre-fill URL based on selected API type
      switch (apiType) {
        case 'openbanking':
          urlElement.value = config.openbankingApi;
          break;
        default:
          urlElement.value = '';
          break;
      }
    });
  }
}
