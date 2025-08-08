import { sendBlockchainRequest } from './blockchainApi';
import { 
  showLoadingIndicator, 
  createStatusUpdateCallback, 
  showErrorMessage, 
  showSuccessMessage, 
  setButtonState, 
  setButtonText 
} from '../utils/uiUtils';

export function setupBlockchainTab(): void {
  const apiEndpointInput = document.getElementById('blockchain-api-endpoint') as HTMLInputElement;
  const apiTokenInput = document.getElementById('blockchain-api-token') as HTMLInputElement;
  const blockNumberInput = document.getElementById('blockchain-block-number') as HTMLInputElement;
  const sendRequestBtn = document.getElementById('blockchain-send-request-btn');
  const responseContainer = document.getElementById('blockchain-response-container');
  const responseContent = document.getElementById('blockchain-response-content');

  if (!apiEndpointInput || !apiTokenInput || !blockNumberInput || 
      !sendRequestBtn || !responseContainer || !responseContent) {
    console.error('Failed to find blockchain tab elements');
    return;
  }

  sendRequestBtn.addEventListener('click', handleSendRequest);

  async function handleSendRequest(): Promise<void> {
    try {
      if (sendRequestBtn) {
        setButtonState(sendRequestBtn, true);
        setButtonText(sendRequestBtn, 'Sending...');
      }

      const apiEndpoint = apiEndpointInput?.value.trim() || '';
      const apiToken = apiTokenInput?.value.trim() || '';
      const blockNumber = blockNumberInput?.value.trim() || '';

      if (!responseContainer || !responseContent) {
        console.error('Response container or content element is null');
        return;
      }

      const loadingElement = showLoadingIndicator(
        responseContainer, 
        responseContent, 
        'Sending blockchain API request. This may take a moment...'
      );

      const updateStatus = createStatusUpdateCallback(
        loadingElement, 
        'Fetching blockchain data. Please wait...'
      );
      
      const result = await sendBlockchainRequest(apiEndpoint, apiToken, blockNumber, updateStatus);

      if (responseContent) {
        responseContent.innerHTML = '';
      }

      if (!result || !result.responseReceived) {
        if (responseContent && responseContainer) {
          showErrorMessage(
            responseContent, 
            responseContainer, 
            'Failed to receive response from blockchain API', 
            'Failed to receive response from blockchain API'
          );
        }
        return;
      }

      if (responseContent) {
        showSuccessMessage(responseContent);
      }
      if (responseContainer) {
        responseContainer.style.display = 'block';
      }
    } catch (error) {
      if (responseContent && responseContainer) {
        showErrorMessage(
          responseContent, 
          responseContainer, 
          error, 
          'Failed to send blockchain request'
        );
      }
    } finally {
      // Re-enable button
      if (sendRequestBtn) {
        setButtonState(sendRequestBtn, false);
        setButtonText(sendRequestBtn, 'Send Request');
      }
    }
  }
}