export const HttpMethod = {
  GET: "GET",
  POST: "POST",
  PUT: "PUT",
  DELETE: "DELETE",
} as const;

export type HttpMethod = (typeof HttpMethod)[keyof typeof HttpMethod];


export const ProofStatus = {
  Pending: "Pending",
  Verified: "Verified",
  Failed: "Failed",
} as const;

export type ProofStatus = (typeof ProofStatus)[keyof typeof ProofStatus];


export interface ProofRecord {
  id: string;
  request: TLSFormData;
  status: ProofStatus;
  timestamp?: string;

  proof: any;
  response: any;
}

export interface CreateTunnelRequest {
  localPort: number;
  remoteHost: string;
  remotePort: number;
}

export interface Tunnel {
  id?: number;
  localPort: number;
  remoteHost: string;
  remotePort: number;
  websocketProxyUrl: string;
  pid?: number;
}

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

export interface TLSCall {
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