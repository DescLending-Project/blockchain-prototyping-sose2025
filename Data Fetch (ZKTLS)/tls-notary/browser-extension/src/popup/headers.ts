/**
 * Sets up the header management functionality in the extension
 * Initializes event listeners for adding and removing custom HTTP headers
 * Allows users to dynamically add and remove headers for API requests
 */
export function setupHeaderManagement(): void {
  const addHeaderBtn = document.getElementById('addHeader');
  const headerItems = document.getElementById('headerItems');

  if (addHeaderBtn && headerItems) {
    addHeaderBtn.addEventListener('click', () => {
      const headerItem = document.createElement('div');
      headerItem.className = 'header-item';
      headerItem.innerHTML = `
        <input type="text" placeholder="Name" class="header-name">
        <input type="text" placeholder="Value" class="header-value">
        <button class="remove-header">X</button>
      `;
      headerItems.appendChild(headerItem);

      const removeBtn = headerItem.querySelector('.remove-header');
      if (removeBtn) {
        removeBtn.addEventListener('click', () => {
          headerItems.removeChild(headerItem);
        });
      }
    });
  }

  document.querySelectorAll('.remove-header').forEach(btn => {
    btn.addEventListener('click', () => {
      const headerItem = btn.parentElement;
      if (headerItem && headerItem.parentElement) {
        headerItem.parentElement.removeChild(headerItem);
      }
    });
  });
}

/**
 * Collect headers from the form
 * @returns Record of header names and values
 */
export function collectHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  document.querySelectorAll('.header-item').forEach(item => {
    const nameElement = item.querySelector('.header-name') as HTMLInputElement;
    const valueElement = item.querySelector('.header-value') as HTMLInputElement;

    if (nameElement && valueElement) {
      const name = nameElement.value;
      const value = valueElement.value;
      if (name && value) {
        headers[name] = value;
      }
    }
  });
  return headers;
}