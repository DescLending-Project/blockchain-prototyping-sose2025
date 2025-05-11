import React, { ReactElement } from 'react';
import { Watch } from 'react-loader-spinner';
import { PresentationJSON } from 'tlsn-js/build/types';

interface TLSNotaryDemoProps {
  initialized: boolean;
  processing: boolean;
  presentationJSON: PresentationJSON | null;
  result: any | null;
  serverUrl: string;
  notaryUrl: string;
  websocketProxyUrl: string;
  onClick: () => void;
}

export function TLSNotaryDemo({
  initialized,
  processing,
  presentationJSON,
  result,
  serverUrl,
  notaryUrl,
  websocketProxyUrl,
  onClick,
}: TLSNotaryDemoProps): ReactElement {
  return (
    <div className="bg-slate-100 min-h-screen p-6 text-slate-800 flex flex-col items-center">
      <h1 className="text-2xl font-bold mb-6 text-slate-700">
        TLSNotary Demo
      </h1>
      <div className="mb-4 text-base font-light max-w-2xl">
        <p>
          This demo fetches data from an API, notarizes the TLS request using TLSNotary,
          and verifies the proof. Click the button below to start.
        </p>
        <p>
          <a
            href="https://docs.tlsnotary.org/quick_start/tlsn-js.html"
            className="text-blue-500 hover:underline"
          >
            More info
          </a>
        </p>
        <table className="table-auto w-full mt-4">
          <thead>
            <tr>
              <th className="px-4 py-2 text-left">Demo Settings</th>
              <th className="px-4 py-2 text-left">URL</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border px-4 py-2">Server</td>
              <td className="border px-4 py-2">{serverUrl}</td>
            </tr>
            <tr>
              <td className="border px-4 py-2">Notary Server</td>
              <td className="border px-4 py-2">{notaryUrl}</td>
            </tr>
            <tr>
              <td className="border px-4 py-2">WebSocket Proxy</td>
              <td className="border px-4 py-2">{websocketProxyUrl}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mb-4">
        <div className="flex justify-center">
          <button
            onClick={!processing ? onClick : undefined}
            disabled={processing || !initialized}
            className={`px-4 py-2 rounded-md text-white shadow-md font-semibold
              ${processing || !initialized ? 'bg-slate-400 cursor-not-allowed' : 'bg-slate-600 hover:bg-slate-700'}`}
          >
            Start Demo
          </button>
        </div>
      </div>
      {processing && (
        <div className="mt-6 flex justify-center items-center">
          <Watch
            visible={true}
            height="40"
            width="40"
            radius="48"
            color="#1E293B"
            ariaLabel="watch-loading"
            wrapperStyle={{}}
            wrapperClass=""
          />
        </div>
      )}
      <div className="w-full max-w-4xl">
        <div className="bg-slate-50 border border-slate-200 rounded p-4 mb-4">
          <b className="text-slate-600">Proof: </b>
          {!presentationJSON ? (
            <i className="text-slate-500">not started</i>
          ) : (
            <pre className="mt-2 p-2 bg-slate-100 rounded text-sm text-slate-800 whitespace-pre-wrap overflow-auto">
              {JSON.stringify(presentationJSON, null, 2)}
            </pre>
          )}
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded p-4">
          <b className="text-slate-600">Verification: </b>
          {!presentationJSON ? (
            <i className="text-slate-500">not started</i>
          ) : !result ? (
            <i className="text-slate-500">verifying</i>
          ) : (
            <pre className="mt-2 p-2 bg-slate-100 rounded text-sm text-slate-800 whitespace-pre-wrap overflow-auto">
              {JSON.stringify(result, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}