import { showProofDetails } from './modal';
import { TLSNotaryService } from '../utils/di';

/**
 * Load proofs from TLSNotaryService and display them
 */
export async function loadProofs(): Promise<void> {
  try {
    const proofs = await TLSNotaryService.getAllProofs();
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

      console.log(`Rendering proof ${index} with status: ${proof.status}`);

      proofItem.innerHTML = `
        <div>${proof.formData.url} - ${formattedDate}</div>
        <div class="status-container">Status: <span class="status status-${proof.status.toLowerCase()}">${proof.status}</span></div>
      `;

      proofItem.addEventListener('click', () => {
        // Show proof details in modal
        showProofDetails(proof);
      });

      proofList.appendChild(proofItem);
    });
  } catch (error) {
    console.error('Error loading proofs:', error);
  }
}