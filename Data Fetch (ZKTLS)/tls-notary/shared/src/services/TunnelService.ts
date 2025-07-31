import type {TunnelCreateRequest } from '../types/dto';
import type { Tunnel } from '../types/tls';
import { config } from '../config';

export class TunnelService {
  private API_BASE: string;

  constructor(apiBase?: string) {
    this.API_BASE = apiBase || config.apiBase;
  }

  /**
   * Set the API base URL
   * @param apiBase - the API base URL
   */
  setApiBase(apiBase: string): void {
    this.API_BASE = apiBase;
  }

  /**
   * Get the API base URL
   * @returns the API base URL
   */
  getApiBase(): string {
    return this.API_BASE;
  }
  async getAll(): Promise<Tunnel[]> {
    const res = await fetch(this.API_BASE);
    if (!res.ok) throw new Error('Failed to fetch tunnels');
    return res.json();
  }

  async getById(id: number): Promise<Tunnel> {
    const res = await fetch(`${this.API_BASE}/${id}`);
    if (!res.ok) throw new Error(`Tunnel ${id} not found`);
    return res.json();
  }

  async create(tunnel: Omit<TunnelCreateRequest, 'id' | 'pid'>): Promise<Tunnel> {
    const res = await fetch(this.API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tunnel),
    });
    if (!res.ok) throw await res.json();
    return res.json();
  }

  async update(id: number, tunnel: Omit<Tunnel, 'id' | 'pid'>): Promise<Tunnel> {
    const res = await fetch(`${this.API_BASE}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tunnel),
    });
    if (!res.ok) throw await res.json();
    return res.json();
  }

  async delete(id: number): Promise<void> {
    const res = await fetch(`${this.API_BASE}/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(`Failed to delete tunnel ${id}`);
  }
}
