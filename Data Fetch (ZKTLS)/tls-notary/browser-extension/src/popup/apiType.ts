import { config } from "tls-notary-shared";

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
