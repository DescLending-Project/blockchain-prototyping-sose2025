export interface Tunnel {
  id: string; // e.g., "8081-1a2b3c4d-443"
  websocketProxyUrl: string;
  localPort: number;
  remoteHost: string;
  remotePort: number;
  pid: number;
}
