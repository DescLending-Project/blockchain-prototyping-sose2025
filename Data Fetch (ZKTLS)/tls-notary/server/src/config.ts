// src/config.ts
import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT || 8090,
  corsOrigin: process.env.CORS_ORIGIN || '*',
  webSocketHost : process.env.WEB_SOCKET_HOST || '127.0.0.1',
};
