export interface TunnelCreateRequest {
  localPort: number;
  remoteHost: string;
  remotePort: number;
}

export interface TunnelCreateResponse {
  id?: number;
  localPort: number;
  remoteHost: string;
  remotePort: number;
  websocketProxyUrl: string;
  pid?: number;
}