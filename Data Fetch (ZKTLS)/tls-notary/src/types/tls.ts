export interface TLSFormData {
  url: string;
  notaryUrl: string;
  proxyUrl: string;
  body: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
}

export interface ProofRecord {
  id: string;
  url: string;
  status: "Pending" | "Verified" | "Failed";
  timestamp?: string;

  proof: any; // Expand if structure is known
  data: any;
}
