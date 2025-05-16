import type { ITLSNotaryService } from "./ITLSNotaryService";
import type { ProofRecord, TLSFormData } from "../types/tls";
import { nanoid } from "nanoid";
import { ProofStatus, HttpMethod } from "../types/tls";

export class MockTLSNotaryService implements ITLSNotaryService {
  private records: ProofRecord[] = [];
  private subscribers: ((records: ProofRecord[]) => void)[] = [];

  private notifySubscribers() {
    const snapshot = [...this.records];
    this.subscribers.forEach((cb) => cb(snapshot));
  }

  subscribe(callback: (records: ProofRecord[]) => void): () => void {
    this.subscribers.push(callback);
    callback([...this.records]);
    return () => {
      this.subscribers = this.subscribers.filter((cb) => cb !== callback);
    };
  }

  private async send(input: TLSFormData, id: string): Promise<ProofRecord> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const index = this.records.findIndex((r) => r.id === id);
      if (index !== -1) {
        const updated: ProofRecord = {
          ...this.records[index],
          status: ProofStatus.Verified,
          proof: {
            ...this.records[index].proof,
            verified: true,
          },
        };
        this.records[index] = updated;
        resolve(updated);
      } else {
        throw new Error(`Record with ID ${id} not found during proof finalization.`);
      }
    }, 2000);
  });
}


  async sendRequest(input: TLSFormData): Promise<string> {
    const { url, method, notaryUrl, proxyUrl, body } = input;
    const id = nanoid(8);


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
    this.notifySubscribers();

    this.send(input, id).then((updated) => {
      this.notifySubscribers();
    });

    return id;
  }

  async getProof(id: string): Promise<ProofRecord | null> {
    return this.records.find((r) => r.id === id) ?? null;
  }

  async getAllProofs(): Promise<ProofRecord[]> {
    return [...this.records];
  }
}
