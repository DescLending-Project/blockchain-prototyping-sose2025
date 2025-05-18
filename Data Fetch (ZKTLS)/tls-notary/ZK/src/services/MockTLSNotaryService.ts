import type { ITLSNotaryService } from "./ITLSNotaryService";
import type { ProofRecord, TLSFormData } from "../types/tls";
import { TLSTunnelService } from "../utils/di"
import { nanoid } from "nanoid";
import { RequestStatus, HttpMethod, VerifyProofResult, TLSCallRequest } from "../types/tls";
import { TunnelCreateRequest } from "../types/dto";

import { generateProof, verifyProof } from "../script/generateProofs";
import {
  Presentation as TPresentation,
} from 'tlsn-js';

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
    console.log("Verifying proof with notaryUrl:", record.formData.notaryUrl);
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

    TLSTunnelService.create(proofRecord.tunnelReq)
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
      .then((tlsCallResponse) => {
        const record = this.records.find((r) => r.id === id);
        if (record) {
          record.tlsCallResponse = tlsCallResponse;
          record.status = RequestStatus.Received;
          record.error = null;
          this.notifySubscribers();
          TLSTunnelService.delete(record.tunnelRes.id)
        }

      }).catch((error) => {
        console.error("Error generating proof:", error);
        const record = this.records.find((r) => r.id === id);
        if (record) {
          record.status = RequestStatus.Error;
          record.error = error;
          TLSTunnelService.delete(record.tunnelRes.id)
          this.notifySubscribers();
        }
      });
    }).catch((error) => {
      console.error("Error creating tunnel:", error);
      const record = this.records.find((r) => r.id === id);
      if (record) {
        record.status = RequestStatus.Error;
        record.error = error;
        this.notifySubscribers();
      }
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
