export interface TLSRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
  timestamp: string;
  status?: string;
  apiType: string;
}

export interface TLSProof {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
  timestamp: string;
  status: string;
  proofData?: any;
  apiType?: string;
}

export interface Settings {
  notaryServer: string;
}

export interface MessageResponse {
  success: boolean;
  error?: string;
}