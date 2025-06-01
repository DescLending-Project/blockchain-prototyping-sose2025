// src/config.ts
import dotenv from 'dotenv';
dotenv.config();

var defaultPort = 3002

export const config = {
  port: process.env.PORT || defaultPort,
  url: process.env.URL || `http://${process.env.HOST_NAME}:${process.env.PORT || defaultPort}`,
  webSocketHost: process.env.HOST_NAME || 'localhost',
};
