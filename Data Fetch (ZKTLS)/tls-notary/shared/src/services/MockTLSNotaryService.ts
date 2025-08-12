import type {ITLSNotaryService} from "./ITLSNotaryService";
import type {ProofRecord, TLSFormData} from "../types/tls";
import {RequestStatus, VerifyProofResult} from "../types/tls";
import {TunnelService} from "./TunnelService";
import {nanoid} from "nanoid";

import {generateProof, verifyProof} from "../script/generateProofs";

// Create a local instance of TunnelService to avoid circular dependency
let tunnelService = new TunnelService();

/**
 * Updates the API base URL for the TunnelService
 * @param apiBase - The new API base URL
 */
export function updateTunnelServiceApiBase(apiBase: string): void {
  if (apiBase && apiBase !== tunnelService.getApiBase()) {
    tunnelService.setApiBase(apiBase);
  }
}

/**
 * Implementation of the TLS Notary Service that provides mock functionality for testing and development
 */
export class MockTLSNotaryService implements ITLSNotaryService {
  private records: ProofRecord[] = [];
  private subscribers: ((records: ProofRecord[]) => void)[] = [];

  /**
   * Cleans up any existing tunnels with matching parameters
   * @param tunnelReq - The tunnel request parameters to match
   * @returns A promise that resolves when cleanup is complete
   * @private
   */
  private async cleanupExistingTunnel(tunnelReq: { localPort: number, remoteHost: string, remotePort: number }): Promise<void> {

    try {
      // Get all tunnels from the server
      const tunnels = await tunnelService.getAll();

      // Find tunnels with matching parameters
      const matchingTunnels = tunnels.filter(tunnel => 
        tunnel.localPort === tunnelReq.localPort &&
        tunnel.remoteHost === tunnelReq.remoteHost &&
        tunnel.remotePort === tunnelReq.remotePort
      );

      if (matchingTunnels.length > 0) {
        // Delete each matching tunnel
        for (const tunnel of matchingTunnels) {
          await tunnelService.delete(tunnel.id);
        }
      }
    } catch (error) {
      console.error('Error cleaning up existing tunnels:', error);
    }
  }

  /**
   * Initialize proofs from an external source
   * @param proofs Array of ProofRecord objects to initialize with
   */
  public initializeProofs(proofs: ProofRecord[]): void {
    // Only add proofs that don't already exist in the records
    const newProofs = proofs.filter(proof => !this.records.some(record => record.id === proof.id));
    if (newProofs.length > 0) {
      this.records = [...newProofs, ...this.records];
      this.notifySubscribers();
    }
  }

  /**
   * Notifies all subscribers with the current state of records
   * @private
   */
  private notifySubscribers() {
    const snapshot = [...this.records];
    this.subscribers.forEach((cb) => cb(snapshot));
  }

  /**
   * Subscribes to changes in the proof records
   * @param callback - Function to be called when proof records change
   * @returns A function that can be called to unsubscribe
   */
  subscribe(callback: (records: ProofRecord[]) => void): () => void {
    this.subscribers.push(callback);
    callback([...this.records]);
    return () => {
      this.subscribers = this.subscribers.filter((cb) => cb !== callback);
    };
  }

  /**
   * Verifies a proof record
   * @param record - The proof record to verify
   * @returns A promise that resolves to the verification result
   * @throws Error if the record is missing required data or is in an invalid state
   */
  async verifyProof(record: ProofRecord): Promise<VerifyProofResult> {
    console.log("Verifying proof for record:", record);
    if (!record.tlsCallResponse?.presentationJSON) {
      throw new Error("No presentationJSON available for this proof record.");
    }

    if(!record.tlsCall?.notaryUrl) {
      throw new Error("No notaryUrl available for this proof record.");
    }
    if(!record.tlsCall) {
      throw new Error("No tlsCall available for this proof record.");
    }
    if(!record.tlsCallResponse) {
      throw new Error("No tlsCallResponse available for this proof record.");
    }

    const tmp = this.records.find((r) => r.id === record.id);
    if (!tmp) {
      throw new Error("Record not found");
    }

    if(!tmp.status || tmp.status !== RequestStatus.Received) {
      throw new Error("Record is not in a valid state to verify proof");
    }

    tmp.status = RequestStatus.Pending;
    this.notifySubscribers();
    try {
      const result = await verifyProof(record.formData.notaryUrl, record.tlsCallResponse.presentationJSON);
      tmp.verifyProofResult = result;
      tmp.status = RequestStatus.Verified;
      this.notifySubscribers();
      return result;
    } catch (error) {
      console.error("Error verifying proof:", error);
      tmp.error = error;
      tmp.verifyProofResult = undefined;
      tmp.status = RequestStatus.Failed;
      this.notifySubscribers();
      throw error;
    }
  }

  /**
   * Sends a TLS request to generate a proof
   * @param input - The form data containing URL, headers, and other connection details
   * @returns A promise that resolves to the request ID
   * @throws Error if the tunnel creation fails or proof generation encounters an error
   */
  async sendRequest(input: TLSFormData): Promise<string> {
    const { url, notaryUrl, remoteDNS, remotePort, localPort, headers, body, method } = input;
    const id = nanoid(8);

    const proofRecord : ProofRecord = {
      id: id,
      status : RequestStatus.Sending,
      error : null,
      timestamp: new Date().toISOString(),
      formData : input,
      tunnelReq : {
        localPort: parseInt(localPort),
        remoteHost: remoteDNS,
        remotePort: parseInt(remotePort),
      },
    };
    this.records.unshift(proofRecord);
    this.notifySubscribers();

    tunnelService.create(proofRecord.tunnelReq)
    .then((tunnelRes) => {
      const record = this.records.find((r) => r.id === id);
      if (!record) {
        throw new Error("Record not found");
      }

      record.tunnelRes = tunnelRes;
      record.status = RequestStatus.Sending;

      record.tlsCall = {
        notaryUrl,
        serverDNS: remoteDNS,
        websocketProxyUrl: tunnelRes.websocketProxyUrl,
        request: {
          url,
          method,
          headers: JSON.parse(headers),
          body,
        },
      };
      this.notifySubscribers();

      generateProof(record.tlsCall)
      .then(async (tlsCallResponse) => {
        const record = this.records.find((r) => r.id === id);
        if (record) {
          record.tlsCallResponse = tlsCallResponse;
          record.status = RequestStatus.Received;
          record.error = null;
          this.notifySubscribers();

          try {
            await tunnelService.delete(record.tunnelRes.id);
          } catch (error) {
            console.error('Failed to delete tunnel:', error);
            // Continue execution even if tunnel deletion fails
          }
        }
      }).catch(async (error) => {
        console.error("Error generating proof:", error);
        const record = this.records.find((r) => r.id === id);
        if (record) {
          record.status = RequestStatus.Error;
          record.error = error;

          try {
            await tunnelService.delete(record.tunnelRes.id);
          } catch (deleteError) {
            // Continue execution even if tunnel deletion fails
          }
          this.notifySubscribers();
        }
      });
    }).catch(async (error) => {
      const record = this.records.find((r) => r.id === id);
      if (record) {
        record.status = RequestStatus.Error;
        record.error = error;

        // Check if the error is about a tunnel already existing
        if (error && error.error && typeof error.error === 'string' && 
            error.error.includes('Tunnel with these parameters already exists')) {

          try {
            // Clean up the existing tunnel with the same parameters
            await this.cleanupExistingTunnel(record.tunnelReq);

            // Retry the request after a short delay
            setTimeout(() => {
              this.sendRequest(input).catch(retryError => {
                console.error('Error retrying request after tunnel cleanup:', retryError);
              });
            }, 1000); // Wait 1 second before retrying
          } catch (cleanupError) {
            console.error('Error during tunnel cleanup:', cleanupError);
          }
        }

        this.notifySubscribers();
      }
    });

    return id;
  }

  /**
   * Retrieves a specific proof by its ID
   * @param id - The unique identifier of the proof
   * @returns A promise that resolves to the proof record if found, or null if not found
   */
  async getProof(id: string): Promise<ProofRecord | null> {
    return this.records.find((r) => r.id === id) ?? null;
  }

  /**
   * Retrieves all stored proofs
   * @returns A promise that resolves to an array of all tracked proof records
   */
  async getAllProofs(): Promise<ProofRecord[]> {
    return [...this.records];
  }

  /**
   * Delete a proof record by ID
   * @param id The ID of the proof to delete
   * @returns Promise that resolves when the proof is deleted
   */
  async deleteProof(id: string): Promise<void> {
    const existingIndex = this.records.findIndex((r) => r.id === id);
    if (existingIndex >= 0) {
      this.records.splice(existingIndex, 1);
      this.notifySubscribers();
    }
  }
}
