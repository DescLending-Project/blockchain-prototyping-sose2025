// services/ITLSNotaryService.ts
import type { TLSFormData, ProofRecord } from "../types/tls";

export interface ITLSNotaryService {
  sendRequest(input: TLSFormData): Promise<string>; // returns request ID
  getAllProofs(): Promise<ProofRecord[]>;           // returns all tracked proofs
  getProof(id: string): Promise<ProofRecord | null>; // returns a single proof by ID
  subscribe(callback: (records: ProofRecord[]) => void): () => void; // listener for changes
}
