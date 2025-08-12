import type { ITLSNotaryService } from "../services/ITLSNotaryService";
import { MockTLSNotaryService } from "../services/MockTLSNotaryService";

/**
 * Singleton instance of the TLS Notary Service
 * This provides a single point of access to the TLS Notary Service throughout the application
 */
export const TLSNotaryService: ITLSNotaryService = new MockTLSNotaryService();
