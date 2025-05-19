import React, { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import ProofForm from "../components/ProofForm";
import ProofDisplay from "../components/ProofDisplay";
import ProofVerifier from "../components/ProofVerifier";
import InfoBox from "../components/InfoBox";

export default function Home() {
  const [currentProof, setCurrentProof] = useState(null);
  const [verificationResult, setVerificationResult] = useState(null);
  const [activeTab, setActiveTab] = useState("generate");

  const handleGenerateProof = async (data) => {
    // TODO: Implement actual TLS Notary proof generation
    console.log("Generate proof for:", data);
  };

  const handleVerifyProof = async (proofData) => {
    // TODO: Implement actual TLS Notary verification
    console.log("Verify proof:", proofData);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      <div className="container mx-auto p-4 md:p-8">
        <header className="text-center mb-8 md:mb-12">
          <h1 className="text-3xl md:text-4xl font-bold text-blue-900 mb-2">
            TLS Notary
          </h1>
          <p className="text-slate-600 max-w-2xl mx-auto">
            Create and verify cryptographic proofs of web content integrity
          </p>
        </header>

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid grid-cols-2 mb-6">
                <TabsTrigger value="generate">Generate Proof</TabsTrigger>
                <TabsTrigger value="verify">Verify Proof</TabsTrigger>
              </TabsList>
              
              <TabsContent value="generate" className="space-y-6">
                <ProofForm onGenerateProof={handleGenerateProof} />
                {currentProof && <ProofDisplay proof={currentProof} />}
              </TabsContent>
              
              <TabsContent value="verify">
                <ProofVerifier 
                  onVerifyProof={handleVerifyProof}
                  verificationResult={verificationResult}
                />
              </TabsContent>
            </Tabs>
          </div>

          <div>
            <InfoBox />
          </div>
        </div>
      </div>
    </div>
  );
}