import { useState } from 'react';
import { HttpMethod, type TLSFormData } from '../../types/tls';
import { getMethodColor } from '../common';
import React from 'react';

interface TLSFormProps {
  onSubmit: (formData: TLSFormData) => void;
}

const httpMethodOptions = Object.values(HttpMethod);

export function TLSForm({ onSubmit }: TLSFormProps) {
  const [form, setForm] = useState<TLSFormData>({
    url: '',
    notaryUrl: 'https://notary.pse.dev/v0.1.0-alpha.10',
    remoteDNS: 'openbanking-api-826260723607.europe-west3.run.app',
    remotePort: '443',
    localPort: '55688',
    body: '',
    headers: '{ "Content-Type": "application/json", "secret": "test_secret" }',
    method: HttpMethod.GET,
  });

  const [touched, setTouched] = useState({
    url: false,
    notaryUrl: false,
    remoteDNS: false,
    remotePort: false,
    localPort: false,
  });

  const handleChange = <K extends keyof TLSFormData>(field: K, value: TLSFormData[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleBlur = (field: keyof typeof touched) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const isInvalid = (field: keyof typeof touched) =>
    touched[field] && form[field].trim() === '';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.url.trim() || !form.notaryUrl.trim()) return;
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      {/* WebSocket Proxy URL */}
      <div>
        <label htmlFor="proxyUrl" className="block text-sm font-medium text-gray-700">
          WebSocket Proxy URL
        </label>

      </div>

      {/* Remote Host + Remote Port */}
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700">Remote DNS</label>
          <input
            type="text"
            value={form.remoteDNS}
            onChange={(e) => {
              const dns = e.target.value;
              handleChange('remoteDNS', dns);
              handleChange('url', `https://${dns}/`);
            }}
            onBlur={() => handleBlur('remoteDNS')}
            placeholder="example.com"
            className={`w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${isInvalid('remoteDNS') ? 'border-red-500' : 'border-gray-300'
              }`}
          />


        </div>
        <div className="w-[120px]">
          <label className="block text-sm font-medium text-gray-700">Remote Port</label>
          <input
            type="number"
            value={form.remotePort}
            onChange={(e) => handleChange('remotePort', e.target.value)}
            onBlur={() => handleBlur('remotePort')}
            placeholder="443"
            className={`w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${isInvalid('remotePort') ? 'border-red-500' : 'border-gray-300'
              }`}
          />
        </div>
      </div>

      {/* Localhost + Local Port */}
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700">Local Host</label>
          <input
            type="text"
            value="127.0.0.1"
            disabled
            className="w-full px-4 py-2 border rounded-md bg-gray-100 text-gray-500 cursor-not-allowed"
          />
        </div>
        <div className="w-[120px]">
          <label className="block text-sm font-medium text-gray-700">Local Port</label>
          <input
            type="number"
            value={form.localPort}
            onChange={(e) => handleChange('localPort', e.target.value)}
            onBlur={() => handleBlur('localPort')}
            placeholder="55688"
            className={`w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${isInvalid('localPort') ? 'border-red-500' : 'border-gray-300'
              }`}
          />
        </div>
      </div>


      {/* Method + URL */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Request Method & URL</label>
        <div className="flex gap-2 items-center">
          <select
            value={form.method}
            onChange={(e) => handleChange('method', e.target.value as HttpMethod)}
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
            onChange={(e) => handleChange('url', e.target.value)}
            onBlur={() => handleBlur('url')}
            placeholder="https://example.com"
            className={`flex-1 h-[42px] px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${isInvalid('url') ? 'border-red-500' : 'border-gray-300'
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
          onChange={(e) => handleChange('notaryUrl', e.target.value)}
          onBlur={() => handleBlur('notaryUrl')}
          placeholder="wss://notary.example.com"
          className={`w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${isInvalid('notaryUrl') ? 'border-red-500' : 'border-gray-300'
            }`}
        />
      </div>

      {/* Request Headers */}
      <div>
        <label htmlFor="headers" className="block text-sm font-medium text-gray-700">
          Request Headers
        </label>
        <textarea
          id="headers"
          value={form.headers}
          onChange={(e) => handleChange('headers', e.target.value)}
          rows={4}
          placeholder='{ "Content-Type": "application/json" }'
          className="w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
        />
      </div>

      {/* Request Body */}
      <div>
        <label htmlFor="body" className="block text-sm font-medium text-gray-700">
          Request Body {form.method === HttpMethod.GET && '(disabled for GET)'}
        </label>
        <textarea
          id="body"
          value={form.body}
          onChange={(e) => handleChange('body', e.target.value)}
          rows={4}
          placeholder='{"key":"value"}'
          disabled={form.method === HttpMethod.GET}
          className={`w-full px-4 py-2 border rounded-md font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 ${form.method === HttpMethod.GET ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white'
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
