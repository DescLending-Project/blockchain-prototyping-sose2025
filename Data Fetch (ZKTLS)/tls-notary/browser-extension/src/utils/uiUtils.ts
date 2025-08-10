export function showLoadingIndicator(
  container: HTMLElement,
  contentElement: HTMLElement,
  message: string
): HTMLElement {
  container.style.display = 'block';
  contentElement.innerHTML = '';
  const loadingElement = document.createElement('div');
  loadingElement.className = 'transaction-item';
  loadingElement.innerHTML = `
    <div>${message}</div>
  `;
  contentElement.appendChild(loadingElement);
  return loadingElement;
}

export function createStatusUpdateCallback(
  loadingElement: HTMLElement,
  loadingMessage: string
): (status: string, attempt: number, maxAttempts: number) => void {
  return (status: string, attempt: number, maxAttempts: number) => {
    if (status.startsWith('Error:')) {
      loadingElement.innerHTML = `
        <div class="error-message">${status.substring(7)}</div>
      `;
    } else if (status === 'Loading...') {
      loadingElement.innerHTML = `
        <div>${loadingMessage}</div>
      `;
    } else {
      loadingElement.innerHTML = `
        <div>${status}</div>
      `;
    }
  };
}

export function showErrorMessage(
  contentElement: HTMLElement,
  container: HTMLElement,
  error: unknown,
  defaultMessage: string
): void {

  contentElement.innerHTML = '';
  const errorElement = document.createElement('div');
  errorElement.className = 'transaction-item';

  if (error instanceof Error) {
    errorElement.innerHTML = `
      <div class="error-message">${error.message}</div>
    `;
  } else if (typeof error === 'string') {
    errorElement.innerHTML = `
      <div class="error-message">${error}</div>
    `;
  } else {
    errorElement.innerHTML = `
      <div class="error-message">${defaultMessage}</div>
    `;
  }

  contentElement.appendChild(errorElement);
  container.style.display = 'block';
}

export function showSuccessMessage(contentElement: HTMLElement): void {
  const successElement = document.createElement('div');
  successElement.className = 'transaction-item';

  const messageElement = document.createElement('div');
  messageElement.style.fontSize = '16px';
  messageElement.style.textAlign = 'center';
  messageElement.style.padding = '10px';
  messageElement.style.color = '#188038'; // Green color for success
  messageElement.style.fontWeight = 'bold';
  messageElement.textContent = 'Response received successfully!';

  successElement.appendChild(messageElement);
  contentElement.appendChild(successElement);
}

export function setButtonState(button: HTMLElement, isDisabled: boolean): void {
  if (isDisabled) {
    button.setAttribute('disabled', 'true');
  } else {
    button.removeAttribute('disabled');
  }
}

export function setButtonText(button: HTMLElement, text: string): void {
  button.textContent = text;
}

export function setButtonsState(buttons: HTMLElement[], isDisabled: boolean): void {
  buttons.forEach(button => setButtonState(button, isDisabled));
}