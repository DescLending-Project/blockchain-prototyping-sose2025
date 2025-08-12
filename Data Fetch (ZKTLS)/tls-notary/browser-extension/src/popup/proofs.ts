import { showProofDetails } from './modal';
import { browserTLSNotaryService } from '../services/BrowserTLSNotaryService';

/**
 * Load proofs from BrowserTLSNotaryService and display them
 */
export async function loadProofs(): Promise<void> {
  try {
    const proofs = await browserTLSNotaryService.getAllProofs();
    const proofList = document.getElementById('proofList');

    if (!proofList) {
      console.error('Proof list element not found');
      return;
    }

    // Clear existing items
    proofList.innerHTML = '';

    if (proofs.length === 0) {
      proofList.innerHTML = '<div class="proof-item">No proofs available</div>';
      return;
    }

    // Add proof items
    proofs.forEach((proof, index) => {
      const proofItem = document.createElement('div');
      proofItem.className = 'proof-item';
      proofItem.dataset.index = index.toString();
      proofItem.dataset.id = proof.id;

      const date = new Date(proof.timestamp || new Date().toISOString());
      const formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;

      proofItem.innerHTML = `
        <div>${proof.formData.url} - ${formattedDate}</div>
        <div class="proof-actions-container">
          <span class="status status-${proof.status.toLowerCase()}">${proof.status}</span>
          <button class="delete-proof-btn" data-id="${proof.id}" title="Delete proof">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      `;

      proofItem.addEventListener('click', () => {
        // Show proof details in modal
        showProofDetails(proof);
      });

      // Add event listener for delete button
      const deleteButton = proofItem.querySelector('.delete-proof-btn');
      if (deleteButton) {
        deleteButton.addEventListener('click', async (event) => {
          // Prevent the click event from propagating to the parent (which would show proof details)
          event.stopPropagation();

          // Confirm deletion
          if (confirm('Are you sure you want to delete this proof?')) {
            const proofId = deleteButton.getAttribute('data-id');
            if (proofId) {
              await browserTLSNotaryService.deleteProof(proofId);
              // Reload proofs to update the UI
              await loadProofs();
            }
          }
        });
      }

      proofList.appendChild(proofItem);
    });
  } catch (error) {
    console.error('Error loading proofs:', error);
  }
}