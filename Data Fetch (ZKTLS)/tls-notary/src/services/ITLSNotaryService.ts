import type { ProofRecord, TLSFormData } from "../types/tls";

export interface ITLSNotaryService {
  submitRequest(input: TLSFormData): Promise<ProofRecord>;
  getProofEntries(): Promise<ProofRecord[]>;
}
