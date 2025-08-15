import { loadProofs } from './proofs';
import { ProofRecord, RequestStatus, TLSNotaryService } from 'tls-notary-shared';

/**
 * Download data as a JSON file
 * @param data The data to download
 * @param filename The filename to use
 */
function downloadJson(data: any, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Sets up the modal dialog functionality
 * Initializes event listeners for closing the modal dialog
 * Handles both close button clicks and clicks outside the modal
 */
export function setupModal(): void {
  const closeModal = document.getElementById('closeModal');
  const modal = document.getElementById('proofModal');

  if (closeModal && modal) {
    closeModal.addEventListener('click', () => {
      modal.style.display = 'none';
      modal.style.alignItems = '';
      modal.style.justifyContent = '';
    });
  }

  // Close modal when clicking outside
  if (modal) {
    window.addEventListener('click', event => {
      if (event.target === modal) {
        modal.style.display = 'none';
        modal.style.alignItems = '';
        modal.style.justifyContent = '';
      }
    });
  }
}


/**
 * Displays the details of a proof in the modal dialog
 * Formats and renders proof information, headers, response data, and verification results
 * Sets up download buttons and verification functionality
 * @param proof - The proof record to display
 */
export function showProofDetails(proof: ProofRecord): void {
  const modal = document.getElementById('proofModal');
  const proofDetails = document.getElementById('proofDetails');

  if (!modal || !proofDetails) {
    console.error('Modal or proof details element not found');
    return;
  }

  // Format headers
  let headersHtml = '';
  try {
    const headers = proof.tlsCall?.request.headers || {};
    for (const [name, value] of Object.entries(headers)) {
      headersHtml += `<div><strong>${name}:</strong> ${value}</div>`;
    }
  } catch (error) {
    headersHtml = '<div>Error displaying headers</div>';
  }

  // Format date
  const date = new Date(proof.timestamp || new Date().toISOString());
  const formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;

  proofDetails.innerHTML = `
    <div><strong>ID:</strong> ${proof.id}</div>
    <div><strong>URL:</strong> ${proof.formData.url}</div>
    <div><strong>Method:</strong> ${proof.formData.method}</div>
    <div><strong>Timestamp:</strong> ${formattedDate}</div>
    <div style="margin: 10px 0; padding: 5px; border: 1px solid #ccc; background-color: #f9f9f9;">
      <strong>Status:</strong> <span class="status status-${proof.status.toLowerCase()}" style="display: inline-block; margin-left: 5px;">${proof.status}</span>
    </div>
    <h3>Headers:</h3>
    ${headersHtml || '<div>No headers</div>'}
    ${proof.formData.body ? `<h3>Body:</h3><pre style="white-space: pre-wrap; word-break: break-word;">${proof.formData.body}</pre>` : ''}
    ${proof.error ? `<h3>Error:</h3><pre style="white-space: pre-wrap; word-break: break-word;">${JSON.stringify(proof.error, null, 2)}</pre>` : ''}
    ${proof.tlsCallResponse?.responseBody ? `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <h3>Response:</h3>
        <button class="download-btn" id="downloadResponseBtn">Download Response</button>
      </div>
      <div class="scrollable-container">
        <pre style="white-space: pre-wrap; word-break: break-word;">${JSON.stringify(proof.tlsCallResponse.responseBody, null, 2)}</pre>
      </div>` : ''}
    ${proof.verifyProofResult ? `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <h3>Verification Result:</h3>
        <button class="download-btn" id="downloadVerificationBtn">Download Verification</button>
      </div>
      <div class="scrollable-container">
        <pre style="white-space: pre-wrap; word-break: break-word;">${JSON.stringify(proof.verifyProofResult, null, 2)}</pre>
      </div>` : ''}
    ${proof.tlsCallResponse?.presentationJSON ? `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <h3>Proof Data:</h3>
        <button class="download-btn" id="downloadProofDataBtn">Download Proof Data</button>
      </div>
      <div class="scrollable-container">
        <pre style="white-space: pre-wrap; word-break: break-word;">${JSON.stringify(proof.tlsCallResponse.presentationJSON, null, 2)}</pre>
      </div>` : ''}
    <div style="margin-top: 20px;">
      <button id="modalVerifyBtn" data-id="${proof.id}" ${proof.status !== RequestStatus.Received ? 'disabled' : ''} title="${proof.status !== RequestStatus.Received ? 'Proof must be in Received state to be verified' : 'Verify this proof'}">Verify Proof</button>
    </div>
  `;

  modal.style.display = 'flex';
  modal.style.alignItems = 'center';
  modal.style.justifyContent = 'center';

  // Add event listener for the verify button
  const modalVerifyBtn = document.getElementById('modalVerifyBtn');
  if (modalVerifyBtn) {
    modalVerifyBtn.addEventListener('click', async () => {
      // Disable the button to prevent multiple clicks
      modalVerifyBtn.setAttribute('disabled', 'true');
      modalVerifyBtn.textContent = 'Verifying...';

      await verifyModalProof(proof);
    });
  }

  // Add event listeners for download buttons
  const downloadResponseBtn = document.getElementById('downloadResponseBtn');
  if (downloadResponseBtn && proof.tlsCallResponse?.responseBody) {
    downloadResponseBtn.addEventListener('click', () => {
      const filename = `response-${proof.formData.url.replace(/[^a-z0-9]/gi, '-')}-${new Date(proof.timestamp || new Date().toISOString()).toISOString().replace(/[^0-9]/g, '')}.json`;
      downloadJson(proof.tlsCallResponse!.responseBody, filename);
    });
  }

  const downloadVerificationBtn = document.getElementById('downloadVerificationBtn');
  if (downloadVerificationBtn && proof.verifyProofResult) {
    downloadVerificationBtn.addEventListener('click', () => {
      const filename = `verification-${proof.formData.url.replace(/[^a-z0-9]/gi, '-')}-${new Date(proof.timestamp || new Date().toISOString()).toISOString().replace(/[^0-9]/g, '')}.json`;
      downloadJson(proof.verifyProofResult, filename);
    });
  }

  const downloadProofDataBtn = document.getElementById('downloadProofDataBtn');
  if (downloadProofDataBtn && proof.tlsCallResponse?.presentationJSON) {
    downloadProofDataBtn.addEventListener('click', () => {
      const filename = `proof-data-${proof.formData.url.replace(/[^a-z0-9]/gi, '-')}-${new Date(proof.timestamp || new Date().toISOString()).toISOString().replace(/[^0-9]/g, '')}.json`;
      downloadJson(proof.tlsCallResponse!.presentationJSON, filename);
    });
  }
}

/**
 * Verifies a proof from the modal dialog
 * Sends the proof to the TLS Notary service for verification
 * Updates the UI with the verification result and refreshes the proof list
 * @param proof - The proof record to verify
 * @returns Promise that resolves when verification is complete
 */
async function verifyModalProof(proof: ProofRecord): Promise<void> {
  try {
    if (!proof) {
      return;
    }

    if (proof.status !== RequestStatus.Received) {
      return;
    }

    try {
      await TLSNotaryService.verifyProof(proof);
    } catch (error) {
      console.error('Error during verification:', error);
    }

    // Refresh proof list
    await loadProofs();

    // Refresh the modal with updated proof data
    const updatedProof = await TLSNotaryService.getProof(proof.id);
    if (updatedProof) {
      showProofDetails(updatedProof);
    }
  } catch (error) {
    console.error('Error verifying proof:', error);
  }
}
