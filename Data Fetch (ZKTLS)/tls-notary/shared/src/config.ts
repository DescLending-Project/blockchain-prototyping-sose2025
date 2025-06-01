// shared/config.ts
let apiUrl: string | undefined = undefined;

export function setConfig(url: string | undefined) {
  apiUrl = url;
}

export function getProxyApiUrl(): string {
  if (!apiUrl) throw new Error("API URL not set");
  return apiUrl;
}
