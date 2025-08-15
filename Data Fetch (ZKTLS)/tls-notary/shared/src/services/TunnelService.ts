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
  
  /**
   * Retrieves all tunnels from the server
   * @returns A promise that resolves to an array of all tunnels
   * @throws Error if the fetch operation fails
   */
  async getAll(): Promise<Tunnel[]> {
    const res = await fetch(this.API_BASE);
    if (!res.ok) throw new Error('Failed to fetch tunnels');
    return res.json();
  }

  /**
   * Retrieves a specific tunnel by its ID
   * @param id - The unique identifier of the tunnel
   * @returns A promise that resolves to the tunnel if found
   * @throws Error if the tunnel is not found
   */
  async getById(id: number): Promise<Tunnel> {
    const res = await fetch(`${this.API_BASE}/${id}`);
    if (!res.ok) throw new Error(`Tunnel ${id} not found`);
    return res.json();
  }

  /**
   * Creates a new tunnel
   * @param tunnel - The tunnel configuration to create
   * @returns A promise that resolves to the created tunnel
   * @throws Error if the tunnel creation fails
   */
  async create(tunnel: Omit<TunnelCreateRequest, 'id' | 'pid'>): Promise<Tunnel> {
    const res = await fetch(this.API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tunnel),
    });
    if (!res.ok) throw await res.json();
    return res.json();
  }

  /**
   * Updates an existing tunnel
   * @param id - The unique identifier of the tunnel to update
   * @param tunnel - The updated tunnel configuration
   * @returns A promise that resolves to the updated tunnel
   * @throws Error if the tunnel update fails
   */
  async update(id: number, tunnel: Omit<Tunnel, 'id' | 'pid'>): Promise<Tunnel> {
    const res = await fetch(`${this.API_BASE}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tunnel),
    });
    if (!res.ok) throw await res.json();
    return res.json();
  }

  /**
   * Deletes a tunnel by its ID
   * @param id - The unique identifier of the tunnel to delete
   * @returns A promise that resolves when the tunnel is deleted
   * @throws Error if the tunnel deletion fails
   */
  async delete(id: number): Promise<void> {
    const res = await fetch(`${this.API_BASE}/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(`Failed to delete tunnel ${id}`);
  }
}
