// src/config.ts
import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT || 3002,
  corsOrigin: process.env.CORS_ORIGIN || '*',
  webSocketHost : process.env.WEB_SOCKET_HOST || 'localhost',
};
