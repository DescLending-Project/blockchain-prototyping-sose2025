import React from "react";
import { TabLayout } from "../components/TabLayout";
import { TLSNotaryPage } from "../components/TLSNotary/TLSNotaryPage";

export function Home() {
  return (
    <div className="max-w-4xl mx-auto py-10 px-4">
      <TabLayout
        tabs={[
          { name: "TLS Notary", content: <TLSNotaryPage /> },
          // You can add more tabs here later
        ]}
      />
    </div>
  );
}
