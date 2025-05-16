import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';


import tunnelRouter from './routes/tunnels';

const app = express();
const port = process.env.PORT || 3002;
app.use(cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging Middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  console.log(`[INCOMING] ${req.method} ${req.url} - Body:`, req.body);

  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[OUTGOING] ${res.statusCode} ${req.method} ${req.url} - Duration: ${duration}ms`);
  });

  next();
});

app.use('/tunnels', tunnelRouter);


app.get('/', (_req: Request, res: Response) => {
  return res.send('Hello, Tunnel World!');
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
