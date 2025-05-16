import { HttpMethod, ProofStatus } from "../types/tls";

// Method color mapping
const methodColorMap: Record<HttpMethod, string> = {
  [HttpMethod.GET]: "bg-green-600",
  [HttpMethod.POST]: "bg-blue-600",
  [HttpMethod.PUT]: "bg-yellow-500",
  [HttpMethod.DELETE]: "bg-red-600",
};

export const getMethodColor = (method: HttpMethod): string => {
  return methodColorMap[method] ?? "bg-gray-600";
};

// Status color mapping
const statusColorMap: Record<ProofStatus, string> = {
  [ProofStatus.Generated]: "bg-gray-600",
  [ProofStatus.Verified]: "bg-green-600",
  [ProofStatus.Pending]: "bg-yellow-500",
  [ProofStatus.Failed]: "bg-red-600",
};

export const getStatusColor = (status: ProofStatus): string => {
  return statusColorMap[status] ?? "bg-gray-600";
};

const statusDotMap: Record<ProofStatus, string> = {
  [ProofStatus.Generated]: "⚪️",
  [ProofStatus.Verified]: "🟢",
  [ProofStatus.Pending]: "🟡",
  [ProofStatus.Failed]: "🔴",

};


export const getStatusDot = (status: ProofStatus): string => {
  return statusDotMap[status] ?? "⚪️";
};

