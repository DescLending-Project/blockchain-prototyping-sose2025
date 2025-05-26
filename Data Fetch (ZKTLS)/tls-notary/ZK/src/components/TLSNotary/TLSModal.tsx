import React from 'react';
import type { ProofRecord } from '../../types/tls';
import { RequestStatus, HttpMethod } from '../../types/tls';

interface TLSModalProps {
  onClose: () => void;
  onVerify: (record: ProofRecord) => void;
  onDownload(data: any, filename: string): void;
  record: ProofRecord;
}

export function TLSModal({ onClose, onDownload, onVerify, record }: TLSModalProps) {
  const responseBody = record.tlsCallResponse?.responseBody;
  const presentationJSON = record.tlsCallResponse?.presentationJSON;
  const verifyResult = record.verifyProofResult;
  const error = record.error;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-md w-full max-w-xl max-h-[90vh] shadow-lg relative text-left overflow-hidden flex flex-col">
        <button
          onClick={onClose}
          className="absolute top-2 right-2 text-gray-500 hover:text-gray-700 text-lg font-bold z-10"
        >
          ×
        </button>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto flex-1 mt-6">
          <h2 className="text-xl font-semibold mb-4">Proof Details</h2>

          <div className="space-y-4 text-sm">
            <div><strong>ID:</strong> {record.id}</div>
            <div><strong>URL:</strong> {record.formData.url}</div>
            <div><strong>Method:</strong> {record.formData.method as HttpMethod}</div>
            <div><strong>Status:</strong> {record.status as RequestStatus}</div>
            <div><strong>Timestamp:</strong> {record.timestamp || '—'}</div>

            <div>
              <h3 className="font-semibold text-gray-700 mt-4 mb-1">Request</h3>
              <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-xs whitespace-pre-wrap">
                {JSON.stringify(record.formData, null, 2)}
              </pre>
            </div>

            {responseBody && (
              <div>
                <h3 className="font-semibold text-gray-700 mt-4 mb-1">Response</h3>
                <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-xs whitespace-pre-wrap">
                  {JSON.stringify(responseBody, null, 2)}
                </pre>
              </div>
            )}

            {presentationJSON && (
              <div>
                <h3 className="font-semibold text-gray-700 mt-4 mb-1">Presentation JSON</h3>
                <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-xs whitespace-pre-wrap">
                  {JSON.stringify(presentationJSON, null, 2)}
                </pre>
              </div>
            )}

            {verifyResult && (
              <div>
                <h3 className="font-semibold text-gray-700 mt-4 mb-1">Verification Result</h3>
                <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-xs whitespace-pre-wrap">
                  {JSON.stringify(verifyResult, null, 2)}
                </pre>
              </div>
            )}

            {error && ((record.status as RequestStatus) === RequestStatus.Error || (record.status as RequestStatus) === RequestStatus.Failed) && (
              <div>
                <h3 className="font-semibold text-red-700 mt-4 mb-1">Error</h3>
                <pre className="bg-red-100 p-3 rounded overflow-x-auto text-xs whitespace-pre-wrap text-red-900">
                  {JSON.stringify(error, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="p-4 border-t flex justify-end gap-2 flex-wrap">
          {responseBody && (
            <button
              onClick={() => onDownload(responseBody, `response-${record.id}.json`)}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700"
            >
              Download Response
            </button>
          )}
          {presentationJSON && (
            <>
              <button
                onClick={() => onDownload(presentationJSON, `proof-${record.id}.json`)}
                className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700"
              >
                Download Proof
              </button>
              {record.status !== RequestStatus.Verified && (
                <button
                  onClick={() => onVerify(record)}
                  className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded hover:bg-purple-700 disabled:opacity-50"
                  disabled={record.status !== RequestStatus.Received}
                >
                  Verify Proof
                </button>
              )}
            </>
          )}
          {verifyResult && (
            <button
              onClick={() => onDownload(verifyResult, `verification-${record.id}.json`)}
              className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded hover:bg-amber-700"
            >
              Download Verification
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
