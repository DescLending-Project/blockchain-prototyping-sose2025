// src/middleware/logger.ts
import { Request, Response, NextFunction } from 'express';

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  console.log(`[INCOMING] ${req.method} ${req.url} - Body:`, req.body);

  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[OUTGOING] ${res.statusCode} ${req.method} ${req.url} - Duration: ${duration}ms`);
  });

  next();
}
