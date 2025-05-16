import { Router, Request, Response } from 'express';
import { Tunnel } from '../models/tunnel';
import { body, validationResult } from 'express-validator';
import { spawn, ChildProcess } from 'child_process';

const tunnelRouter = Router();
let tunnels: Tunnel[] = [];
const activeProcesses: Map<number, ChildProcess> = new Map();

let nextId = 1;

// Constants
const WEBSOCKET_HOST = 'localhost';

// Validators
const validateTunnel = [
  body('localPort').isInt({ min: 1, max: 65535 }).withMessage('Local port must be an integer between 1 and 65535'),
  body('remotePort').isInt({ min: 1, max: 65535 }).withMessage('Remote port must be an integer between 1 and 65535'),
];

// GET all tunnels
tunnelRouter.get('/', (_req: Request, res: Response) => {
  res.json(tunnels);
});

tunnelRouter.get('/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const tunnel = tunnels.find(t => t.id === id);
  if (!tunnel) return res.status(404).send('Tunnel not found');
  return res.json(tunnel);
});

// POST create tunnel
tunnelRouter.post('/', validateTunnel, (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { localPort, remoteHost, remotePort } = req.body;
  if (tunnels.some(t => t.localPort === localPort)) {
    return res.status(409).json({ error: 'Tunnel on this localPort already exists' });
  }

  const remote = `${remoteHost}:${remotePort}`;
  const websocketProxyUrl = `ws://${WEBSOCKET_HOST}:${localPort}`;
  console.log(`Starting tunnel: 127.0.0.1:${localPort} -> ${remote}`);

  const proc = spawn('wstcp', ['--bind-addr', `127.0.0.1:${localPort}`, remote], { stdio: 'inherit' });
  const id = nextId++;
  const tunnel: Tunnel = { id, localPort, remoteHost, remotePort, pid: proc.pid ?? -1, websocketProxyUrl };

  tunnels.push(tunnel);
  activeProcesses.set(id, proc);

  proc.on('error', (err) => {
    console.error('Failed to start wstcp:', err);
    tunnels = tunnels.filter(t => t.id !== id);
    activeProcesses.delete(id);
    return res.status(500).send('Failed to start tunnel');
  });

  proc.on('exit', (code, signal) => {
    console.log(`Tunnel process exited. PID: ${proc.pid}, Code: ${code}, Signal: ${signal}`);
    tunnels = tunnels.filter(t => t.id !== id);
    activeProcesses.delete(id);
  });

  return res.status(201).json(tunnel);
});

// PUT update tunnel
tunnelRouter.put('/:id', validateTunnel, (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const index = tunnels.findIndex(t => t.id === id);
  if (index === -1) return res.status(404).send('Tunnel not found');

  const oldProc = activeProcesses.get(id);
  if (oldProc) oldProc.kill();
  activeProcesses.delete(id);

  const { localPort, remoteHost, remotePort } = req.body;
  const remote = `${remoteHost}:${remotePort}`;
  const websocketProxyUrl = `ws://${WEBSOCKET_HOST}:${localPort}`;
  const proc = spawn('wstcp', ['--bind-addr', `127.0.0.1:${localPort}`, remote], { stdio: 'inherit' });

  const updated: Tunnel = { id, localPort, remoteHost, remotePort, pid: proc.pid ?? -1, websocketProxyUrl };
  tunnels[index] = updated;
  activeProcesses.set(id, proc);

  proc.on('exit', (code, signal) => {
    console.log(`Updated tunnel process exited. PID: ${proc.pid}, Code: ${code}, Signal: ${signal}`);
    tunnels = tunnels.filter(t => t.id !== id);
    activeProcesses.delete(id);
  });

  return res.json(updated);
});

// DELETE tunnel
tunnelRouter.delete('/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const index = tunnels.findIndex(t => t.id === id);
  if (index === -1) return res.status(404).send('Tunnel not found');

  const proc = activeProcesses.get(id);
  if (proc) proc.kill();

  tunnels.splice(index, 1);
  activeProcesses.delete(id);

  return res.status(204).send();
});

export default tunnelRouter;
