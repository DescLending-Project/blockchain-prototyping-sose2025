import {ProofRecord, RequestStatus, TLSNotaryService} from 'tls-notary-shared';
import {getProofs, setProofs} from '../utils/storageUtils';
import {TLSProof} from '../types/types';

/**
 * Convert a ProofRecord to a TLSProof for storage
 */
function proofRecordToTLSProof(record: ProofRecord): TLSProof {
  return {
    url: record.formData.url,
    method: record.formData.method,
    headers: record.tlsCall?.request.headers || {},
    body: record.formData.body || null,
    timestamp: record.timestamp || new Date().toISOString(),
    status: record.status,
    proofData: {
      id: record.id,
      formData: record.formData,
      tunnelReq: record.tunnelReq,
      tunnelRes: record.tunnelRes,
      tlsCall: record.tlsCall,
      tlsCallResponse: record.tlsCallResponse,
      verifyProofResult: record.verifyProofResult,
      error: record.error
    }
  };
}

/**
 * Convert a TLSProof to a ProofRecord for use in the application
 */
function tlsProofToProofRecord(proof: TLSProof): ProofRecord {
  if (!proof.proofData) {
    throw new Error('TLSProof does not contain proofData');
  }

  return {
    id: proof.proofData.id,
    status: proof.status as RequestStatus,
    error: proof.proofData.error,
    timestamp: proof.timestamp,
    formData: proof.proofData.formData,
    tunnelReq: proof.proofData.tunnelReq,
    tunnelRes: proof.proofData.tunnelRes,
    tlsCall: proof.proofData.tlsCall,
    tlsCallResponse: proof.proofData.tlsCallResponse,
    verifyProofResult: proof.proofData.verifyProofResult
  };
}

/**
 * Browser-specific implementation of TLSNotaryService that uses browser storage
 */
class BrowserTLSNotaryService {
  private static instance: BrowserTLSNotaryService;
  private records: ProofRecord[] = [];
  private subscribers: ((records: ProofRecord[]) => void)[] = [];
  private initializationPromise: Promise<void> | null = null;

  private constructor() {
    // Initialize the service
    this.initialize();
  }

  /**
   * Initialize the service by loading proofs from storage
   * This method is called automatically by the constructor
   * @returns Promise that resolves when initialization is complete
   */
  private initialize(): Promise<void> {
    if (!this.initializationPromise) {
      console.log('Initializing BrowserTLSNotaryService');
      this.initializationPromise = this.loadProofsFromStorage().catch(error => {
        console.error('Error initializing BrowserTLSNotaryService:', error);
        // Reset the initialization promise so it can be retried
        this.initializationPromise = null;
        // Re-throw the error to propagate it to callers
        throw error;
      });
    }
    return this.initializationPromise;
  }

  /**
   * Get the singleton instance of BrowserTLSNotaryService
   */
  public static getInstance(): BrowserTLSNotaryService {
    if (!BrowserTLSNotaryService.instance) {
      BrowserTLSNotaryService.instance = new BrowserTLSNotaryService();
    }
    return BrowserTLSNotaryService.instance;
  }

  /**
   * Load proofs from storage
   */
  private async loadProofsFromStorage() {
    try {
      const storedProofs = await getProofs();
      if (storedProofs && storedProofs.length > 0) {
        // Convert TLSProof objects to ProofRecord objects
        this.records = storedProofs.map(tlsProofToProofRecord);
        this.notifySubscribers();
      } else {
      }
    } catch (error) {
      console.error('Error loading proofs from browser storage:', error);
    }
  }

  /**
   * Save proofs to storage
   */
  private async saveProofsToStorage() {
    try {
      // Filter records to only include those that have been received
      const receivedRecords = this.records.filter(record =>
        record.status === RequestStatus.Received ||
        record.status === RequestStatus.Pending ||
        record.status === RequestStatus.Verified
      );


      // Convert ProofRecord objects to TLSProof objects
      const tlsProofs = receivedRecords.map(proofRecordToTLSProof);
      await setProofs(tlsProofs);
    } catch (error) {
      console.error('Error saving proofs to browser storage:', error);
    }
  }

  private notifySubscribers() {
    const snapshot = [...this.records];
    this.subscribers.forEach((cb) => cb(snapshot));

    // Save proofs to storage whenever they change
    this.saveProofsToStorage();
  }

  async subscribe(callback: (records: ProofRecord[]) => void): Promise<() => void> {

    // Ensure the service is initialized before proceeding
    await this.initialize();

    this.subscribers.push(callback);
    callback([...this.records]);
    return () => {
      this.subscribers = this.subscribers.filter((cb) => cb !== callback);
    };
  }

  async getAllProofs(): Promise<ProofRecord[]> {

    // Ensure the service is initialized before proceeding
    await this.initialize();

    return [...this.records];
  }

  // Method to add a proof record (used by the shared module's service)
  async addProofRecord(record: ProofRecord): Promise<void> {

    // Ensure the service is initialized before proceeding
    await this.initialize();

    const existingIndex = this.records.findIndex((r) => r.id === record.id);
    if (existingIndex >= 0) {
      this.records[existingIndex] = record;
    } else {
      this.records.unshift(record);
    }
    this.notifySubscribers();
  }

  /**
   * Delete a proof record by ID
   * @param id The ID of the proof to delete
   * @returns Promise that resolves when the proof is deleted
   */
  async deleteProof(id: string): Promise<void> {

    // Ensure the service is initialized before proceeding
    await this.initialize();

    const existingIndex = this.records.findIndex((r) => r.id === id);
    if (existingIndex >= 0) {
      this.records.splice(existingIndex, 1);
      this.notifySubscribers();

      // Also delete the proof from the shared module's TLSNotaryService
      try {
        await TLSNotaryService.deleteProof(id);
      } catch (error) {
        console.error('Error deleting proof from shared module:', error);
      }
    } else {
      console.log(`Proof with ID ${id} not found`);
    }
  }
}

// Export the singleton instance
export const browserTLSNotaryService = BrowserTLSNotaryService.getInstance();