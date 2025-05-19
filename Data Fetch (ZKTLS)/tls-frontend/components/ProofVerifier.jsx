import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldCheck, AlertTriangle, Lock } from "lucide-react";
import { motion } from "framer-motion";

export default function ProofVerifier({ onVerifyProof, isVerifying, verificationResult }) {
  const [proofData, setProofData] = useState("");

  const handleVerify = (e) => {
    e.preventDefault();
    if (proofData.trim()) {
      onVerifyProof(proofData);
    }
  };

  return (
    <Card className="w-full shadow-lg border-none bg-white/90 backdrop-blur-sm">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-blue-600" />
          Verify TLS Proof
        </CardTitle>
        <CardDescription>
          Verify the authenticity of a generated TLS proof
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleVerify} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="proof-data" className="text-sm font-medium">
              Paste Proof Data
            </label>
            <Textarea
              id="proof-data"
              placeholder="Paste the proof data here to verify its authenticity"
              value={proofData}
              onChange={(e) => setProofData(e.target.value)}
              className="min-h-[150px] transition-all focus-visible:ring-blue-500"
              required
            />
          </div>

          {verificationResult && (
            <div className="mt-4">
              <div className="rounded-md p-4 flex items-start gap-3">
                {verificationResult.valid ? (
                  <div className="bg-green-50 border border-green-100 rounded-md p-4 flex items-start gap-3 w-full">
                    <ShieldCheck className="w-5 h-5 text-green-500 mt-0.5" />
                    <div>
                      <h3 className="font-medium text-green-800">Proof Verified</h3>
                      <p className="text-sm text-green-700 mt-1">
                        This proof is valid. The content has been verified as authentic.
                      </p>
                      {verificationResult.details && (
                        <div className="mt-2 text-sm text-green-700">
                          <p><strong>URL:</strong> {verificationResult.details.url}</p>
                          <p><strong>Timestamp:</strong> {verificationResult.details.timestamp}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="bg-red-50 border border-red-100 rounded-md p-4 flex items-start gap-3 w-full">
                    <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5" />
                    <div>
                      <h3 className="font-medium text-red-800">Invalid Proof</h3>
                      <p className="text-sm text-red-700 mt-1">
                        This proof could not be verified. It may have been tampered with or be incorrectly formatted.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </form>
      </CardContent>
      <CardFooter>
        <Button
          type="submit"
          onClick={handleVerify}
          disabled={isVerifying || !proofData.trim()}
          className="w-full bg-blue-600 hover:bg-blue-700 transition-colors"
        >
          {isVerifying ? (
            <motion.div className="flex items-center">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Verifying...
            </motion.div>
          ) : (
            <motion.div
              className="flex items-center"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <ShieldCheck className="w-4 h-4 mr-2" />
              Verify Proof
            </motion.div>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}