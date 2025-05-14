import type { ProofRecord } from "../../types/tls";

interface TLSModalProps {
  onClose: () => void;
  record: ProofRecord;
}

export function TLSModal({ onClose, record }: TLSModalProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-md p-6 w-full max-w-xl shadow-lg relative">
        <button
          onClick={onClose}
          className="absolute top-2 right-2 text-gray-500 hover:text-gray-700 text-lg font-bold"
        >
          ×
        </button>

        <h2 className="text-xl font-semibold mb-4">Proof Details</h2>

        <div className="space-y-2 text-sm">
          <div><strong>ID:</strong> {record.id}</div>
          <div><strong>URL:</strong> {record.url}</div>
          <div><strong>Status:</strong> {record.status}</div>
          <div><strong>Timestamp:</strong> {record.timestamp || "—"}</div>

          <div>
            <strong>Proof:</strong>
            <pre className="bg-gray-100 p-3 rounded mt-1 overflow-x-auto text-xs">
              {JSON.stringify(record.proof, null, 2)}
            </pre>
          </div>

          <div>
            <strong>Data:</strong>
            <pre className="bg-gray-100 p-3 rounded mt-1 overflow-x-auto text-xs">
              {JSON.stringify(record.data, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
