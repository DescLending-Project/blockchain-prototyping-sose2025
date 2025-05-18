import type { ITLSNotaryService } from '../services/ITLSNotaryService';
import { MockTLSNotaryService } from '../services/MockTLSNotaryService';
import { TunnelService } from '../services/TunnelService';

export const TLSNotaryService: ITLSNotaryService = new MockTLSNotaryService();
export const TLSTunnelService: TunnelService = new TunnelService();
