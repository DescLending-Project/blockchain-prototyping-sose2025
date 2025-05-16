import type { ProofRecord } from "../../types/tls";

interface TLSOutputProps {
  result: ProofRecord;
}

export function TLSOutput({ result }: TLSOutputProps) {
  const downloadJSON = (obj: any, filename: string) => {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-700">Proof</h2>
        <pre className="bg-gray-100 border rounded p-4 text-sm overflow-x-auto">
          {JSON.stringify(result.proof, null, 2)}
        </pre>
        <button
          onClick={() => downloadJSON(result.proof, "tls-proof.json")}
          className="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Download Proof
        </button>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-gray-700">Data</h2>
        <pre className="bg-gray-100 border rounded p-4 text-sm overflow-x-auto">
          {JSON.stringify(result.request, null, 2)}
        </pre>
        <button
          onClick={() => downloadJSON(result.request, "tls-data.json")}
          className="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Download Data
        </button>
      </div>
    </div>
  );
}
