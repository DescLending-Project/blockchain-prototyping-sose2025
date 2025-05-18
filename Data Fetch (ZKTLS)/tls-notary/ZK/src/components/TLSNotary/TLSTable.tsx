import React from 'react';
import type { ProofRecord } from '../../types/tls';
import { getStatusDot } from '../common';

interface TLSTableProps {
  entries: ProofRecord[];
  onSelect: (entry: ProofRecord) => void;
}

export function TLSTable({ entries, onSelect }: TLSTableProps) {
  if (entries.length === 0) {
    return <div className="text-sm text-gray-500">No proof entries available.</div>;
  }

  return (
    <div className="overflow-x-auto border rounded-md">
      <table className="min-w-full text-sm text-left table-auto">
        <thead className="bg-gray-100 border-b">
          <tr>
            <th className="px-4 py-2 font-semibold">ID</th>
            <th className="px-4 py-2 font-semibold">METHOD</th>
            <th className="px-4 py-2 font-semibold">URL</th>
            <th className="px-4 py-2 font-semibold">Status</th>
            <th className="px-4 py-2 font-semibold">Timestamp</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr
              key={entry.id}
              onClick={() => onSelect(entry)}
              className="border-b hover:bg-blue-50 cursor-pointer"
            >
              <td className="px-4 py-2">{entry.id}</td>
              <td className="px-4 py-2 font-semibold">{entry.formData.method}</td>
              <td className="px-4 py-2 text-blue-600 underline">{entry.formData.url}</td>
              <td className="px-4 py-2 flex items-center gap-1">
                <span>{getStatusDot(entry.status)}</span>
                <span>{entry.status}</span>
              </td>
              <td className="px-4 py-2">{entry.timestamp || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
