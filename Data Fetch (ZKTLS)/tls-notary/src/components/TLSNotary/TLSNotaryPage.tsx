import { useEffect, useState } from "react";
import { TLSForm } from "./TLSForm";
import { TLSTable } from "./TLSTable";
import { TLSModal } from "./TLSModal";
import { TLSNotaryService } from "../../utils/di";
import type { ProofRecord, TLSFormData } from "../../types/tls";

export function TLSNotaryPage() {
  const [entries, setEntries] = useState<ProofRecord[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<ProofRecord | null>(null);

  useEffect(() => {
    TLSNotaryService.getProofEntries().then(setEntries);
  }, []);

  const handleSubmit = async (formData: TLSFormData) => {
    TLSNotaryService.submitRequest(formData);
    const updatedEntries = await TLSNotaryService.getProofEntries();
    setEntries(updatedEntries);
  };

  return (
    <div className="space-y-6">
      <TLSForm onSubmit={handleSubmit} />
      <TLSTable entries={entries} onSelect={setSelectedEntry} />

      {selectedEntry && (
        <TLSModal record={selectedEntry} onClose={() => setSelectedEntry(null)} />
      )}
    </div>
  );
}
