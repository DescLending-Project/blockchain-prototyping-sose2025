export const config = {
  apiBase: process.env.API_BASE || 'http://localhost:8090/tunnels',
  openbankingApi: process.env.OPENBANKING_API || 'https://openbanking-api-826260723607.europe-west3.run.app',
  tlsRemotePort: process.env.TLS_REMOTE_PORT || '443',
  tlsLocalPort: process.env.TLS_LOCAL_PORT || '8091'
};