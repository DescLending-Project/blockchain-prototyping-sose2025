import express, { Request, Response } from 'express';
import cors from 'cors';
import { config } from './config';
import { requestLogger } from './middleware/logger';
import tunnelRouter from './routes/tunnels';

const app = express();
const port = config.port;

app.use(cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.use(requestLogger);
app.use('/tunnels', tunnelRouter);

app.get('/', (_req: Request, res: Response) => {
  return res.send('Hello, Tunnel World!');
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
