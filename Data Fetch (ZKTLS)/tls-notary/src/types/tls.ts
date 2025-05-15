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
export interface TLSFormData {
  url: string;
  notaryUrl: string;
  proxyUrl: string;
  body: string;
  method: HttpMethod;
}

export interface ProofRecord {
  id: string;
  request: TLSFormData;
  status: ProofStatus;
  timestamp?: string;

  proof: any;
  response: any;
}
