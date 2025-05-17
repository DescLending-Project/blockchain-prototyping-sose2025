// src/config.ts
export const config = {
  port: process.env.PORT || 3002,
  corsOrigin: process.env.CORS_ORIGIN || '*',
  webSocketHost : process.env.WEB_SOCKET_HOST || 'localhost',
};
