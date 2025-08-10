import { config } from "tls-notary-shared";

/**
 * Generic storage utility for Chrome extension storage
 * @param key The key to store the value under
 * @param value The value to store
 * @returns Promise that resolves when the value is stored
 */
export async function storeValue<T>(key: string, value: T): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    chrome.storage.local.set({ [key]: value }, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Generic retrieval utility for Chrome extension storage
 * @param key The key to retrieve the value for
 * @returns Promise that resolves with the value
 */
export async function getValue<T>(key: string): Promise<T | null> {
  return new Promise<T | null>((resolve, reject) => {
    chrome.storage.local.get([key], (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(result[key] || null);
      }
    });
  });
}

/**
 * Remove values from Chrome extension storage
 * @param keys The keys to remove
 * @returns Promise that resolves when the keys are removed
 */
export async function removeValues(keys: string[]): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    chrome.storage.local.remove(keys, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Check if an API URL is configured
 * @param apiUrl The API URL to check
 * @throws Error if the API URL is not configured
 */
export function validateApiUrl(apiUrl: string | undefined): void {
  if (!apiUrl) {
    throw new Error('API URL is not configured');
  }
}