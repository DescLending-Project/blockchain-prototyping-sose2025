import { Router, Request, Response } from 'express';
import { Tunnel } from '../models/tunnel';
import { body, validationResult } from 'express-validator';
import { spawn, ChildProcess } from 'child_process';
import crypto from 'crypto';
import { TunnelCreateRequest, TunnelUpdateRequest } from '../dto/requests';
import { TunnelCreateResponse, TunnelUpdateResponse } from '../dto/responses';
import { config } from '../config';
import dns from 'dns/promises';

const tunnelRouter = Router();
let tunnels: Tunnel[] = [];
const activeProcesses: Map<string, ChildProcess> = new Map();

const WEBSOCKET_HOST = config.webSocketHost || '127.0.0.1';

function generateTunnelId(localPort: number, remoteHost: string, remotePort: number): string {
  const hash = crypto.createHash('sha256').update(remoteHost).digest('hex').slice(0, 8);
  return `${localPort}-${hash}-${remotePort}`;
}

async function isValidHost(host: string): Promise<boolean> {
  try {
    await dns.lookup(host);
    return true;
  } catch (error) {
    console.error(`Invalid host: ${host}`, error);
    return false;
  }
}

tunnelRouter.get('/', (_req: Request, res: Response) => {
  res.json(tunnels);
});

tunnelRouter.get('/:id', (req: Request, res: Response) => {
  const id = req.params.id;
  const tunnel = tunnels.find(t => t.id === id);
  if (!tunnel) return res.status(404).send('Tunnel not found');
  return res.json(tunnel);
});

tunnelRouter.post('/',
  [
    body('localPort').isInt({ min: 1, max: 65535 }).withMessage('Local port must be an integer between 1 and 65535'),
    body('remotePort').isInt({ min: 1, max: 65535 }).withMessage('Remote port must be an integer between 1 and 65535'),
  ], async (req: Request<{}, {}, TunnelCreateRequest>, res: Response<TunnelCreateResponse | { error: any }>) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array() });

    const { localPort, remoteHost, remotePort } = req.body;

    const isValid = await isValidHost(remoteHost);
    if (!isValid) return res.status(400).json({ error: `Invalid remoteHost: ${remoteHost}` });

    const tunnelId = generateTunnelId(localPort, remoteHost, remotePort);

    if (tunnels.some(t => t.id === tunnelId)) {
      return res.status(409).json({ error: 'Tunnel with these parameters already exists' });
    }

    const remote = `${remoteHost}:${remotePort}`;
    const websocketProxyUrl = `ws://${WEBSOCKET_HOST}:${localPort}`;
    console.log(`Starting tunnel:${WEBSOCKET_HOST}:${localPort} -> ${remote}`);

    const proc = spawn('wstcp', ['--bind-addr', `0.0.0.0:${localPort}`, remote], { stdio: 'inherit' });
    const tunnel: Tunnel = { id: tunnelId, localPort, remoteHost, remotePort, pid: proc.pid ?? -1, websocketProxyUrl };

    tunnels.push(tunnel);
    activeProcesses.set(tunnelId, proc);

    proc.on('error', (err) => {
      console.error('Failed to start wstcp:', err);
      tunnels = tunnels.filter(t => t.id !== tunnelId);
      activeProcesses.delete(tunnelId);
      return res.status(500).json({ error: 'Failed to start tunnel' });
    });

    proc.on('exit', (code, signal) => {
      console.log(`Tunnel process exited. PID: ${proc.pid}, Code: ${code}, Signal: ${signal}`);
      tunnels = tunnels.filter(t => t.id !== tunnelId);
      activeProcesses.delete(tunnelId);
    });

    return res.status(201).json(tunnel);
  });

tunnelRouter.put('/:id', [
  body('localPort').isInt({ min: 1, max: 65535 }).withMessage('Local port must be an integer between 1 and 65535'),
  body('remotePort').isInt({ min: 1, max: 65535 }).withMessage('Remote port must be an integer between 1 and 65535'),
], async (req: Request<any, {}, TunnelUpdateRequest>, res: Response<TunnelUpdateResponse | { error: any }>) => {
  const id = req.params.id;
  const index = tunnels.findIndex(t => t.id === id);
  if (index === -1) return res.status(404).json({ error: 'Tunnel not found' });
  const { localPort, remoteHost, remotePort } = req.body;

  const isValid = await isValidHost(remoteHost);
  if (!isValid) return res.status(400).json({ error: `Invalid remoteHost: ${remoteHost}` });


  const oldProc = activeProcesses.get(id);
  if (oldProc) oldProc.kill();
  activeProcesses.delete(id);

  const newId = generateTunnelId(localPort, remoteHost, remotePort);
  const remote = `${remoteHost}:${remotePort}`;
  const websocketProxyUrl = `ws://${WEBSOCKET_HOST}:${localPort}`;
  const proc = spawn('wstcp', ['--bind-addr', `127.0.0.1:${localPort}`, remote], { stdio: 'inherit' });

  const updated: Tunnel = { id: newId, localPort, remoteHost, remotePort, pid: proc.pid ?? -1, websocketProxyUrl };
  tunnels[index] = updated;
  activeProcesses.set(newId, proc);

  proc.on('exit', (code, signal) => {
    console.log(`Updated tunnel process exited. PID: ${proc.pid}, Code: ${code}, Signal: ${signal}`);
    tunnels = tunnels.filter(t => t.id !== newId);
    activeProcesses.delete(newId);
  });

  return res.status(200).json(updated);
});

tunnelRouter.delete('/:id', (req: Request, res: Response) => {
  const id = req.params.id;
  const index = tunnels.findIndex(t => t.id === id);
  if (index === -1) return res.status(404).send('Tunnel not found');

  const proc = activeProcesses.get(id);
  if (proc) proc.kill();

  tunnels.splice(index, 1);
  activeProcesses.delete(id);

  return res.status(204).send();
});

tunnelRouter.delete('/', (_req: Request, res: Response) => {
  tunnels.forEach(tunnel => {
    const proc = activeProcesses.get(tunnel.id);
    if (proc) proc.kill();
  });

  tunnels = [];
  activeProcesses.clear();

  return res.status(204).send();
});

export default tunnelRouter;
