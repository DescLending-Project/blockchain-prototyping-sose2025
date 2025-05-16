import { useState } from "react";
import { HttpMethod, type TLSFormData } from "../../types/tls";
import { getMethodColor } from "../common";

interface TLSFormProps {
  onSubmit: (formData: TLSFormData) => void;
}

const httpMethodOptions = Object.values(HttpMethod);

export function TLSForm({ onSubmit }: TLSFormProps) {
  const [form, setForm] = useState<TLSFormData>({
    url: "",
    notaryUrl: "",
    proxyUrl: "",
    body: "",
    headers: "",
    method: HttpMethod.GET,
  });

  const [touched, setTouched] = useState({
    url: false,
    notaryUrl: false,
    proxyUrl: false,
  });

  const handleChange = <K extends keyof TLSFormData>(field: K, value: TLSFormData[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleBlur = (field: keyof typeof touched) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const isInvalid = (field: keyof typeof touched) =>
    touched[field] && form[field].trim() === "";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.url.trim() || !form.notaryUrl.trim() || !form.proxyUrl.trim()) return;
    onSubmit(form);
    setForm({ url: "", notaryUrl: "", proxyUrl: "", body: "", method: HttpMethod.GET, headers: "" });
    setTouched({ url: false, notaryUrl: false, proxyUrl: false });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      {/* Method + URL */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Request Method & URL</label>
        <div className="flex gap-2 items-center">
          <select
            value={form.method}
            onChange={(e) => handleChange("method", e.target.value as HttpMethod)}
            className={`h-[42px] px-4 border rounded-md text-sm font-semibold text-white focus:outline-none focus:ring-2 ${getMethodColor(form.method)}`}
          >
            {httpMethodOptions.map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </select>

          <input
            type="text"
            value={form.url}
            onChange={(e) => handleChange("url", e.target.value)}
            onBlur={() => handleBlur("url")}
            placeholder="https://example.com"
            className={`flex-1 h-[42px] px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              isInvalid("url") ? "border-red-500" : "border-gray-300"
            }`}
          />
        </div>
      </div>

      {/* Notary Server URL */}
      <div>
        <label htmlFor="notaryUrl" className="block text-sm font-medium text-gray-700">
          Notary Server URL
        </label>
        <input
          type="text"
          id="notaryUrl"
          value={form.notaryUrl}
          onChange={(e) => handleChange("notaryUrl", e.target.value)}
          onBlur={() => handleBlur("notaryUrl")}
          placeholder="wss://notary.example.com"
          className={`w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            isInvalid("notaryUrl") ? "border-red-500" : "border-gray-300"
          }`}
        />
      </div>

      {/* Proxy URL */}
      <div>
        <label htmlFor="proxyUrl" className="block text-sm font-medium text-gray-700">
          WebSocket Proxy URL
        </label>
        <input
          type="text"
          id="proxyUrl"
          value={form.proxyUrl}
          onChange={(e) => handleChange("proxyUrl", e.target.value)}
          onBlur={() => handleBlur("proxyUrl")}
          placeholder="wss://proxy.example.com"
          className={`w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            isInvalid("proxyUrl") ? "border-red-500" : "border-gray-300"
          }`}
        />
      </div>

      <div>
        <label htmlFor="headers" className="block text-sm font-medium text-gray-700">
          Request Headers
        </label>
        <textarea
          id="headers"
          value={form.headers}
          onChange={(e) => handleChange("headers", e.target.value)}
          rows={4}
          placeholder='{ "Content-Type": "application/json" }'
          className={`w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono ${
             "bg-white"
          }`}
        />
      </div>

      {/* Request Body */}
      <div>
        <label htmlFor="body" className="block text-sm font-medium text-gray-700">
          Request Body {form.method === HttpMethod.GET && "(disabled for GET)"}
        </label>
        <textarea
          id="body"
          value={form.body}
          onChange={(e) => handleChange("body", e.target.value)}
          rows={4}
          placeholder='{"key":"value"}'
          disabled={form.method === HttpMethod.GET}
          className={`w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono ${
            form.method === HttpMethod.GET ? "bg-gray-100 text-gray-400 cursor-not-allowed" : "bg-white"
          }`}
        />
      </div>

      {/* Submit */}
      <div>
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700"
        >
          Submit
        </button>
      </div>
    </form>
  );
}
