 import { HttpMethod } from "../types/tls";
import { ProofStatus } from "../types/tls";


export const getMethodColor = (method: HttpMethod): string => {
  switch (method) {
    case HttpMethod.GET:
      return "bg-green-600";
    case HttpMethod.POST:
      return "bg-blue-600";
    case HttpMethod.PUT:
      return "bg-yellow-500";
    case HttpMethod.DELETE:
      return "bg-red-600";
    default:
      return "bg-gray-600";
  }
};


export const getStatusColor = (status: ProofStatus): string => {
  switch (status) {
    case ProofStatus.Verified:
      return "bg-green-600";
    case ProofStatus.Pending:
      return "bg-yellow-500";
    case ProofStatus.Failed:
      return "bg-red-600";
    default:
      return "bg-gray-600";
  }
};