export interface Tunnel {
  id: number;
  websocketProxyUrl: string;
  localPort: number;
  remoteHost: string;
  remotePort: boolean;
  pid: number;

}