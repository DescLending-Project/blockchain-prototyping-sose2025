import type { ITLSNotaryService } from "./ITLSNotaryService";
import type { ProofRecord, TLSFormData } from "../types/tls";
import { TLSTunnelService } from "../utils/di"
import { nanoid } from "nanoid";
import { ProofStatus, HttpMethod, VerifyProofResult } from "../types/tls";
import { generateProof, verifyProof } from "../script/generateProofs";
import {
  Presentation as TPresentation,
} from 'tlsn-js';
import type { PresentationJSON } from 'tlsn-js/build/types';

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

  async verifyProof(record: ProofRecord): Promise<VerifyProofResult> {
    if (!record.tlsCallResponse?.presentationJSON) {
      throw new Error("No presentationJSON available for this proof record.");
    }

    const tmp = this.records.find((r) => r.id === record.id);
    if (!tmp) {
      throw new Error("Record not found");
    }

    tmp.status = ProofStatus.Pending;
    this.notifySubscribers();

    try {
      const result = await verifyProof(record.request.notaryUrl, record.tlsCallResponse.presentationJSON);
      tmp.verifyProofResult = result;
      tmp.status = ProofStatus.Verified;
      this.notifySubscribers();
      return result;
    } catch (error) {
      console.error("Error verifying proof:", error);
      tmp.status = ProofStatus.Failed;
      this.notifySubscribers();
      throw error;
    }
  }


  async sendRequest(input: TLSFormData): Promise<string> {
    const { url, notaryUrl, remoteDNS, remotePort, localPort, headers, body, method } = input;
    const id = nanoid(8);
    TLSTunnelService.create({
      localPort: parseInt(localPort),
      remoteHost: remoteDNS,
      remotePort: parseInt(remotePort),
    }).then((tunnel) => {
      generateProof({
        notaryUrl,
        serverDNS: remoteDNS,
        websocketProxyUrl: tunnel.websocketProxyUrl,
        request: {
          url,
          method,
          headers: JSON.parse(headers),
          body,
        },
      }).then((tlsCallResponse) => {
        const record = this.records.find((r) => r.id === id);
        if (record) {
          record.tlsCallResponse = tlsCallResponse;
          record.status = ProofStatus.Generated;
          this.notifySubscribers();
        }

      })
    }).catch((error) => {
      console.error("Error creating tunnel:", error);
    });

    const record: ProofRecord = {
      id,
      request: input,
      status: ProofStatus.Pending,
      timestamp: new Date().toISOString(),

    };

    this.records.unshift(record);
    this.notifySubscribers();

    return id;
  }

  async getProof(id: string): Promise<ProofRecord | null> {
    return this.records.find((r) => r.id === id) ?? null;
  }

  async getAllProofs(): Promise<ProofRecord[]> {
    return [...this.records];
  }
}
