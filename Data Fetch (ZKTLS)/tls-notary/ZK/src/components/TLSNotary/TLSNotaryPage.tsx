import { useEffect, useState } from "react";
import { TLSForm } from "./TLSForm";
import { TLSTable } from "./TLSTable";
import { TLSModal } from "./TLSModal";
import { TLSNotaryService } from "../../utils/di";
import type { ProofRecord, TLSFormData } from "../../types/tls";
import React from "react";

export function TLSNotaryPage() {
  const [entries, setEntries] = useState<ProofRecord[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<ProofRecord | null>(null);

  useEffect(() => {
    const unsubscribe = TLSNotaryService.subscribe((records: ProofRecord[]) => {
      setEntries(records);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  
  const handleSubmit = (formData: TLSFormData) => {
    TLSNotaryService.sendRequest(formData);
  };

  const handleVerify = async (record: ProofRecord) => {
    TLSNotaryService.verifyProof(record)
  }

  const onDownload = (data: any, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <TLSForm onSubmit={handleSubmit} />
      <TLSTable entries={entries} onSelect={setSelectedEntry} />
      {selectedEntry && (
        <TLSModal
          record={selectedEntry}
          onClose={() => setSelectedEntry(null)}
          onDownload={onDownload}
          onVerify={handleVerify}
        />
      )}
    </div>
  );
}
