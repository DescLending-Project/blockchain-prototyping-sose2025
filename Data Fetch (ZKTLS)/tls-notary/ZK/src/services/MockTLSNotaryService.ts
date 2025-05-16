import type { ITLSNotaryService } from "./ITLSNotaryService";
import type { ProofRecord, TLSFormData } from "../types/tls";
import {TLSTunnelService} from "../utils/di"
import { nanoid } from "nanoid";
import { ProofStatus, HttpMethod } from "../types/tls";
import { generateProof } from "../script/generateProofs";

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


  async sendRequest(input: TLSFormData): Promise<string> {
    const { url, notaryUrl, remoteDNS, remotePort, localPort, headers, body, method } = input;
    const id = nanoid(8);
    TLSTunnelService.create({
      localPort: parseInt(localPort),
      remoteHost: remoteDNS,
      remotePort: parseInt(remotePort),
    }).then((tunnel) => {
      console.log("Tunnel created:", tunnel);
      console.log("headers", headers);
      console.log("parsed headers", JSON.parse(headers));

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
      }).then((proof) => {
        console.log("Generated proof:", proof);

      })
    }).catch((error) => {
      console.error("Error creating tunnel:", error);
    });

    const record: ProofRecord = {
      id,
      request: input,
      status: ProofStatus.Pending,
      timestamp: new Date().toISOString(),
      proof: {
        verified: false,
        method,
        notaryUrl,
      },
      response: {
        content: `Mock response from ${method} ${url}`,
        body: method === HttpMethod.GET ? null : body,
      },
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
