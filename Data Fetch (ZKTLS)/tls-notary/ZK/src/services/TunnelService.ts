import type { Tunnel, CreateTunnelRequest } from '../types/tls';

const API_BASE = 'http://localhost:3002/tunnels';

export class TunnelService {
  async getAll(): Promise<Tunnel[]> {
    const res = await fetch(API_BASE);
    if (!res.ok) throw new Error('Failed to fetch tunnels');
    return res.json();
  }

  async getById(id: number): Promise<Tunnel> {
    const res = await fetch(`${API_BASE}/${id}`);
    if (!res.ok) throw new Error(`Tunnel ${id} not found`);
    return res.json();
  }

  async create(tunnel: Omit<CreateTunnelRequest, 'id' | 'pid'>): Promise<Tunnel> {
    const res = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tunnel),
    });
    if (!res.ok) throw await res.json();
    return res.json();
  }

  async update(id: number, tunnel: Omit<Tunnel, 'id' | 'pid'>): Promise<Tunnel> {
    const res = await fetch(`${API_BASE}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tunnel),
    });
    if (!res.ok) throw await res.json();
    return res.json();
  }

  async delete(id: number): Promise<void> {
    const res = await fetch(`${API_BASE}/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(`Failed to delete tunnel ${id}`);
  }
}
