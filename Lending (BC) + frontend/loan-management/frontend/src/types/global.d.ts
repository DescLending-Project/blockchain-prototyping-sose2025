// src/types/global.d.ts
declare global {
  interface Window {
    openTLSNExtension?: () => any;
    tlsnExtensionAvailable?: boolean;
    tlsn?: {
      openExtension: () => void;
      isInstalled: boolean;
      version: string;
    };
  }
}

export {};