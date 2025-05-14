import type { ITLSNotaryService } from "./ITLSNotaryService";
import type { ProofRecord, TLSFormData } from "../types/tls";

export class MockTLSNotaryService implements ITLSNotaryService {
  private latestRecord: ProofRecord | null = null;

  async submitRequest(input: TLSFormData): Promise<ProofRecord> {
    const { url, method, notaryUrl, proxyUrl, body } = input;

    this.latestRecord = {
      id: "mock123",
      url,
      status: "Verified",
      timestamp: new Date().toISOString(),
      proof: {
        id: "mock123",
        verified: true,
        method,
        notaryUrl,
        proxyUrl,
      },
      data: {
        content: `Mock response from ${method} ${url}`,
        body: method === "GET" ? null : body,
      },
    };

    return this.latestRecord;
  }

  async getProofEntries(): Promise<ProofRecord[]> {
    return this.latestRecord ? [this.latestRecord] : [];
  }
}
