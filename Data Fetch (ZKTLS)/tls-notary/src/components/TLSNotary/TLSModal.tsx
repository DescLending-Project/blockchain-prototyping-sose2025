import type { ProofRecord } from "../../types/tls";
import { ProofStatus, HttpMethod } from "../../types/tls";

interface TLSModalProps {
  onClose: () => void;
  onDownload(data: any, filename: string): void;
  record: ProofRecord;
}

export function TLSModal({ onClose, onDownload ,record }: TLSModalProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-md p-6 w-full max-w-xl shadow-lg relative text-left">
        <button
          onClick={onClose}
          className="absolute top-2 right-2 text-gray-500 hover:text-gray-700 text-lg font-bold"
        >
          ×
        </button>

        <h2 className="text-xl font-semibold mb-4">Proof Details</h2>

        <div className="space-y-4 text-sm">
          <div><strong>ID:</strong> {record.id}</div>
          <div><strong>URL:</strong> {record.request.url}</div>
          <div><strong>Method:</strong> {record.request.method as HttpMethod}</div>
          <div><strong>Status:</strong> {record.status as ProofStatus}</div>
          <div><strong>Timestamp:</strong> {record.timestamp || "—"}</div>

          <div>
            <h3 className="font-semibold text-gray-700 mt-4 mb-1">Request</h3>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-xs whitespace-pre-wrap">
              {JSON.stringify(record.request, null, 2)}
            </pre>
          </div>

          <div>
            <h3 className="font-semibold text-gray-700 mt-4 mb-1">Response</h3>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-xs whitespace-pre-wrap">
              {JSON.stringify(record.response, null, 2)}
            </pre>
          </div>

          <div>
            <h3 className="font-semibold text-gray-700 mt-4 mb-1">Proof</h3>
            <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-xs whitespace-pre-wrap">
              {JSON.stringify(record.proof, null, 2)}
            </pre>
          </div>
          {/* Download buttons */}
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={() => onDownload(record.response, `response-${record.id}.json`)}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700"
          >
            Download Response
          </button>
          <button
            onClick={() => onDownload(record.proof, `proof-${record.id}.json`)}
            className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700"
          >
            Download Proof
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}
