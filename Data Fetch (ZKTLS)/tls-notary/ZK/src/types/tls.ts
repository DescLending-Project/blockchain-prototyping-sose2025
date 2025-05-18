import {
    Presentation as TPresentation,
} from 'tlsn-js';
import type { PresentationJSON } from 'tlsn-js/build/types';
import { TunnelCreateResponse, TunnelCreateRequest} from './dto';

export const HttpMethod = {
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  DELETE: 'DELETE',
} as const;

export type HttpMethod = (typeof HttpMethod)[keyof typeof HttpMethod];


export const RequestStatus = {
  Error : 'Error',
  Sending: 'Sending',
  Received : 'Received',
  Pending: 'Pending',
  Verified: 'Verified',
  Failed: 'Failed',
} as const;

export type RequestStatus = (typeof RequestStatus)[keyof typeof RequestStatus];

export interface TLSFormData {
  url: string;
  notaryUrl: string;
  remoteDNS: string;
  remotePort: string;
  localPort: string;
  headers: string;
  body: string;
  method: HttpMethod;
}

export interface ProofRecord {
  id: string;
  status: RequestStatus;
  error? : any;
  timestamp?: string;
  formData: TLSFormData;
  tunnelReq?: TunnelCreateRequest | any;
  tunnelRes?: TunnelCreateResponse | any;
  tlsCall?: TLSCallRequest;
  tlsCallResponse? : TLSCallResponse;
  verifyProofResult?: VerifyProofResult;
}






export interface TLSCallRequest {
    notaryUrl: string;
    serverDNS : string;
    websocketProxyUrl: string;
    request : {
        url: string;
        method: 'GET' | 'POST' | 'PUT' | 'DELETE';
        headers: {
            [key: string]: string;
        };
        body: string;
    }
}


export interface VerifyProofResult {
    time: number;
    verifyingKey: string;
    notaryKey: string;
    serverName: string;
    sent: string;
    recv: string;
}

export interface TLSCallResponse {
    responseBody: any;
    presentation: TPresentation;
    presentationJSON: PresentationJSON;
}

export { TunnelCreateResponse as Tunnel };