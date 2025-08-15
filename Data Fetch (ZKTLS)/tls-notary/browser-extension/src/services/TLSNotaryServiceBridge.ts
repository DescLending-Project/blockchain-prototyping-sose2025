import { ProofRecord, TLSNotaryService } from 'tls-notary-shared';
import { browserTLSNotaryService } from './BrowserTLSNotaryService';

/**
 * Bridge between the shared module's TLSNotaryService and the browser-extension's BrowserTLSNotaryService
 * This ensures that proofs created by the shared module are also saved in the browser-extension's storage
 */
export class TLSNotaryServiceBridge {
  private static instance: TLSNotaryServiceBridge;
  private unsubscribe: (() => void) | null = null;

  private constructor() {
    // Call initialize without awaiting it
    // This is necessary because constructors can't be async
    this.initialize().catch(error => {
      console.error('Error initializing TLSNotaryServiceBridge:', error);
    });
  }

  /**
   * Get the singleton instance of TLSNotaryServiceBridge
   */
  public static getInstance(): TLSNotaryServiceBridge {
    if (!TLSNotaryServiceBridge.instance) {
      TLSNotaryServiceBridge.instance = new TLSNotaryServiceBridge();
    }
    return TLSNotaryServiceBridge.instance;
  }

  /**
   * Initialize the bridge by subscribing to the shared module's TLSNotaryService
   */
  private async initialize(): Promise<void> {

    // Get all proofs from the browser-extension's BrowserTLSNotaryService
    const proofs = await browserTLSNotaryService.getAllProofs();

    // Initialize the shared module's TLSNotaryService with these proofs
    if (proofs.length > 0) {
      // Cast TLSNotaryService to any to access the initializeProofs method
      // which is not part of the ITLSNotaryService interface
      (TLSNotaryService as any).initializeProofs(proofs);
    }

    this.unsubscribe = TLSNotaryService.subscribe((records: ProofRecord[]) => {
      records.forEach(async (record) => {
        await browserTLSNotaryService.addProofRecord(record);
      });
    });
  }

  /**
   * Clean up the bridge by unsubscribing from the shared module's TLSNotaryService
   */
  public dispose(): void {
    console.log('Disposing TLSNotaryServiceBridge');
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }
}

// Export the singleton instance
export const tlsNotaryServiceBridge = TLSNotaryServiceBridge.getInstance();