export function setupApiTypeSelection(): void {
  const apiTypeElement = document.getElementById('apiType') as HTMLSelectElement;
  const urlElement = document.getElementById('url') as HTMLInputElement;

  if (apiTypeElement && urlElement) {
    apiTypeElement.addEventListener('change', () => {
      const apiType = apiTypeElement.value;

      // Pre-fill URL based on selected API type
      switch (apiType) {
        case 'openbanking':
          urlElement.value = 'https://openbanking-api-826260723607.europe-west3.run.app/users/aaa/credit-score';
          break;
        default:
          urlElement.value = '';
          break;
      }
    });
  }
}
