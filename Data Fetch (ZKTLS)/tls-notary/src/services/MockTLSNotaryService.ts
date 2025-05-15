import type { ITLSNotaryService } from "./ITLSNotaryService";
import type { ProofRecord, TLSFormData } from "../types/tls";
import { nanoid } from "nanoid";
import { ProofStatus, HttpMethod } from "../types/tls";


export class MockTLSNotaryService implements ITLSNotaryService {
  private records: ProofRecord[] = [];

  async submitRequest(input: TLSFormData): Promise<ProofRecord> {
    const { url, method, notaryUrl, proxyUrl, body } = input;
    const id = nanoid(8);
    console.log("MockTLSNotaryService.submitRequest", { url, method, notaryUrl, proxyUrl, body });
    const record: ProofRecord = {
      id,
      request: input,
      status: ProofStatus.Pending,
      timestamp: new Date().toISOString(),
      proof: {
        verified: false,
        method,
        notaryUrl,
        proxyUrl,
      },
      response: {
        content: `Mock response from ${method} ${url}`,
        body: method === HttpMethod.GET ? null : body,
      },
    };

    this.records.unshift(record);
    console.log("MockTLSNotaryService.submitRequest", { record });

    return this.records[this.records.length - 1];
  }

  async getProofEntries(): Promise<ProofRecord[]> {
    console.log("MockTLSNotaryService.getProofEntries", { records: this.records });
    return [...this.records]; // return a new array reference
  }
}
