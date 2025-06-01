import type { TunnelCreateRequest } from '../types/dto';
import type { Tunnel } from '../types/tls';
import { getProxyApiUrl } from '../config';

export class TunnelService {
  async getAll(): Promise<Tunnel[]> {
    const res = await fetch(getProxyApiUrl());
    if (!res.ok) throw new Error('Failed to fetch tunnels');
    return res.json();
  }

  async getById(id: number): Promise<Tunnel> {
    const res = await fetch(`${getProxyApiUrl()}/${id}`);
    if (!res.ok) throw new Error(`Tunnel ${id} not found`);
    return res.json();
  }

  async create(tunnel: Omit<TunnelCreateRequest, 'id' | 'pid'>): Promise<Tunnel> {
    const res = await fetch(getProxyApiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tunnel),
    });
    if (!res.ok) throw await res.json();
    return res.json();
  }

  async update(id: number, tunnel: Omit<Tunnel, 'id' | 'pid'>): Promise<Tunnel> {
    const res = await fetch(`${getProxyApiUrl()}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tunnel),
    });
    if (!res.ok) throw await res.json();
    return res.json();
  }

  async delete(id: number): Promise<void> {
    const res = await fetch(`${getProxyApiUrl()}/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(`Failed to delete tunnel ${id}`);
  }
}
