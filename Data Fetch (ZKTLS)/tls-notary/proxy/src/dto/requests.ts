export interface TunnelCreateRequest {
  localPort: number;
  remoteHost: string;
  remotePort: number;
}

export { TunnelCreateRequest as TunnelUpdateRequest };