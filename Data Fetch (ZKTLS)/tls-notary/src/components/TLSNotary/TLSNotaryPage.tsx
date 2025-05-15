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
    await TLSNotaryService.submitRequest(formData);
    const updatedEntries = await TLSNotaryService.getProofEntries();
    console.log("Updated entries:", updatedEntries);
    setEntries(updatedEntries);
  };

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
    console.log("TLSNotaryPage", { entries }),
    <div className="space-y-6">
      <TLSForm onSubmit={handleSubmit} />
      <TLSTable entries={entries} onSelect={setSelectedEntry} />

      {selectedEntry && (
  <TLSModal
    record={selectedEntry}
    onClose={() => setSelectedEntry(null)}
    onDownload={onDownload}
  />
)}

    </div>
  );
}
