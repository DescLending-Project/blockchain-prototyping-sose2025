import { HttpMethod, RequestStatus } from '../types/tls';

// Method color mapping
const methodColorMap: Record<HttpMethod, string> = {
  [HttpMethod.GET]: 'bg-green-600',
  [HttpMethod.POST]: 'bg-blue-600',
  [HttpMethod.PUT]: 'bg-yellow-500',
  [HttpMethod.DELETE]: 'bg-red-600',
};

export const getMethodColor = (method: HttpMethod): string => {
  return methodColorMap[method] ?? 'bg-gray-600';
};

// Status color mapping
const statusColorMap: Record<RequestStatus, string> = {
  [RequestStatus.Error]: 'bg-gray-600',
  [RequestStatus.Sending]: 'bg-blue-600',
  [RequestStatus.Received]: 'bg-purple-600',
  [RequestStatus.Pending]: 'bg-yellow-500',
  [RequestStatus.Verified]: 'bg-green-600',
  [RequestStatus.Failed]: 'bg-red-600',
};

export const getStatusColor = (status: RequestStatus): string => {
  return statusColorMap[status] ?? 'bg-gray-600';
};

const statusDotMap: Record<RequestStatus, string> = {
  [RequestStatus.Error]: '🔴',
  [RequestStatus.Sending]: '🔵',
  [RequestStatus.Received]: '🟣',
  [RequestStatus.Pending]: '🟡',
  [RequestStatus.Verified]: '🟢',
  [RequestStatus.Failed]: '🔴',
};


export const getStatusDot = (status: RequestStatus): string => {
  return statusDotMap[status] ?? '⚪️';
};

