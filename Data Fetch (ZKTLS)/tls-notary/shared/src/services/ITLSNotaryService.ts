import type { TLSFormData, ProofRecord, VerifyProofResult } from "../types/tls";

/**
 * Interface for TLS Notary Service that handles TLS proof generation, verification, and management
 */
export interface ITLSNotaryService {
  sendRequest(input: TLSFormData): Promise<string>; // returns request ID
  getAllProofs(): Promise<ProofRecord[]>;           // returns all tracked proofs
  getProof(id: string): Promise<ProofRecord | null>; // returns a single proof by ID
  subscribe(callback: (records: ProofRecord[]) => void): () => void; // listener for changes
  verifyProof(record : ProofRecord): Promise<VerifyProofResult>
  deleteProof(id: string): Promise<void>;           // deletes a proof by ID
}
