import type { ITLSNotaryService } from "./ITLSNotaryService";
import type { ProofRecord, TLSFormData } from "../types/tls";
import { TunnelService } from "./TunnelService";
import { nanoid } from "nanoid";
import { RequestStatus, VerifyProofResult } from "../types/tls";

import { generateProof, verifyProof } from "../script/generateProofs";

// Create a local instance of TunnelService to avoid circular dependency
let tunnelService = new TunnelService();

export function updateTunnelServiceApiBase(apiBase: string): void {
  if (apiBase && apiBase !== tunnelService.getApiBase()) {
    console.log(`Updating TunnelService API base address to: ${apiBase}`);
    tunnelService.setApiBase(apiBase);
  }
}

export class MockTLSNotaryService implements ITLSNotaryService {
  private records: ProofRecord[] = [];
  private subscribers: ((records: ProofRecord[]) => void)[] = [];

  private notifySubscribers() {
    console.log(`Notifying ${this.subscribers.length} subscribers of record changes`);
    const snapshot = [...this.records];
    this.subscribers.forEach((cb) => cb(snapshot));
    console.log('All subscribers notified');
  }

  subscribe(callback: (records: ProofRecord[]) => void): () => void {
    console.log('New subscriber added to TLSNotaryService');
    this.subscribers.push(callback);
    console.log('Sending initial records to new subscriber');
    callback([...this.records]);
    return () => {
      console.log('Unsubscribing from TLSNotaryService');
      this.subscribers = this.subscribers.filter((cb) => cb !== callback);
      console.log(`Remaining subscribers: ${this.subscribers.length}`);
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
    console.log('MockTLSNotaryService.sendRequest called with input:', {
      url: input.url,
      method: input.method,
      remoteDNS: input.remoteDNS,
      notaryUrl: input.notaryUrl
    });

    const { url, notaryUrl, remoteDNS, remotePort, localPort, headers, body, method } = input;
    const id = nanoid(8);
    console.log('Generated request ID:', id);

    console.log('Creating proof record');
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
    console.log('Adding proof record to records list');
    this.records.unshift(proofRecord);
    this.notifySubscribers();

    console.log('Creating tunnel with tunnelService');
    tunnelService.create(proofRecord.tunnelReq)
    .then((tunnelRes) => {
      console.log('Tunnel created successfully:', tunnelRes.websocketProxyUrl);
      const record = this.records.find((r) => r.id === id);
      if (!record) {
        console.error('Record not found for ID:', id);
        throw new Error("Record not found");
      }

      console.log('Updating record with tunnel response');
      record.tunnelRes = tunnelRes;
      record.status = RequestStatus.Sending;

      console.log('Creating TLS call request');
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

      console.log('Generating proof with TLS call request');
      generateProof(record.tlsCall)
      .then((tlsCallResponse) => {
        console.log('Proof generated successfully');
        const record = this.records.find((r) => r.id === id);
        if (record) {
          console.log('Updating record with TLS call response');
          record.tlsCallResponse = tlsCallResponse;
          record.status = RequestStatus.Received;
          record.error = null;
          this.notifySubscribers();

          console.log('Deleting tunnel');
          tunnelService.delete(record.tunnelRes.id)
          console.log('Tunnel deleted successfully');
        } else {
          console.warn('Record not found after generating proof for ID:', id);
        }
      }).catch((error) => {
        console.error("Error generating proof:", error);
        const record = this.records.find((r) => r.id === id);
        if (record) {
          console.log('Updating record with error status');
          record.status = RequestStatus.Error;
          record.error = error;

          console.log('Deleting tunnel after error');
          tunnelService.delete(record.tunnelRes.id)
          this.notifySubscribers();
        } else {
          console.warn('Record not found after error for ID:', id);
        }
      });
    }).catch((error) => {
      console.error("Error creating tunnel:", error);
      const record = this.records.find((r) => r.id === id);
      if (record) {
        console.log('Updating record with error status');
        record.status = RequestStatus.Error;
        record.error = error;
        this.notifySubscribers();
      } else {
        console.warn('Record not found after tunnel error for ID:', id);
      }
    });

    console.log('Returning request ID:', id);
    return id;
  }

  async getProof(id: string): Promise<ProofRecord | null> {
    console.log('MockTLSNotaryService.getProof called with ID:', id);
    const record = this.records.find((r) => r.id === id) ?? null;
    if (record) {
      console.log('Proof record found for ID:', id);
    } else {
      console.log('No proof record found for ID:', id);
    }
    return record;
  }

  async getAllProofs(): Promise<ProofRecord[]> {
    console.log('MockTLSNotaryService.getAllProofs called');
    const records = [...this.records];
    console.log(`Returning ${records.length} proof records`);
    return records;
  }
}
