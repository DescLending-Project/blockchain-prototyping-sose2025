import type { ITLSNotaryService } from "../services/ITLSNotaryService";
import { MockTLSNotaryService } from "../services/MockTLSNotaryService";

export const TLSNotaryService: ITLSNotaryService = new MockTLSNotaryService();
