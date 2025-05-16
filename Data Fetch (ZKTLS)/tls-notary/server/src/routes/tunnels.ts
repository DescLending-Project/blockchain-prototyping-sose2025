import { Router, Request, Response } from 'express';
import { Tunnel } from '../models/tunnel';
import { body, validationResult } from 'express-validator';

import { spawn } from 'child_process';

const tunnelRouter = Router();
const tunnels: Tunnel[] = [];

tunnelRouter.get('/', (req: Request, res: Response) => {
    res.json(tunnels);
});

const taskValidationPostWstcp =[
    body('localPort').isInt({ min: 1, max: 65535 }).withMessage('Local port must be an integer between 1 and 65535'),
    body('remoteHost').isIP().withMessage('Remote host must be a valid IP address'),
    body('remotePort').isInt({ min: 1, max: 65535 }).withMessage('Remote port must be an integer between 1 and 65535'),
]

tunnelRouter.post('/', taskValidationPostWstcp, (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
    }
  
    const { localPort, remoteHost, remotePort } = req.body;

  const remote = `${remoteHost}:${remotePort}`;
  console.log(`Starting tunnel: 127.0.0.1:${localPort} -> ${remote}`);

  const proc = spawn('wstcp', ['--bind-addr', `127.0.0.1:${localPort}`, remote], {
    stdio: 'inherit',
  });

  proc.on('error', (err) => {
    console.error('Failed to start wstcp:', err);
    res.status(500).send('Failed to start tunnel');
  });

res.send(`wstcp tunnel started from 127.0.0.1:${localPort} to ${remote}`);
});




export default tunnelRouter;
