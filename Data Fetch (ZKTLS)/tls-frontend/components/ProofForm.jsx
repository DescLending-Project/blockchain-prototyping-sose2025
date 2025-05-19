import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Lock, Globe, FileDigit } from "lucide-react";
import { motion } from "framer-motion";

export default function ProofForm({ onGenerateProof, isGenerating }) {
  const [url, setUrl] = useState("");
  const [data, setData] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (url.trim() && data.trim()) {
      onGenerateProof({ url, data });
    }
  };

  return (
    <Card className="w-full shadow-lg border-none bg-white/90 backdrop-blur-sm">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold flex items-center gap-2">
          <Lock className="w-5 h-5 text-blue-600" />
          Generate TLS Proof
        </CardTitle>
        <CardDescription>
          Create a cryptographic proof for web content verification
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center">
              <Globe className="w-4 h-4 mr-2 text-slate-500" />
              <label htmlFor="url" className="text-sm font-medium">
                URL to Notarize
              </label>
            </div>
            <Input
              id="url"
              placeholder="https://example.com/page-to-verify"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full transition-all focus-visible:ring-blue-500"
              required
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center">
              <FileDigit className="w-4 h-4 mr-2 text-slate-500" />
              <label htmlFor="data" className="text-sm font-medium">
                Data to Notarize
              </label>
            </div>
            <Textarea
              id="data"
              placeholder="Enter the specific content you want to notarize"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className="min-h-[120px] transition-all focus-visible:ring-blue-500"
              required
            />
            <p className="text-xs text-slate-500">
              This is the specific content from the URL that you want to generate a proof for
            </p>
          </div>
        </form>
      </CardContent>
      <CardFooter>
        <Button
          type="submit"
          onClick={handleSubmit}
          disabled={isGenerating || !url.trim() || !data.trim()}
          className="w-full bg-blue-600 hover:bg-blue-700 transition-colors"
        >
          {isGenerating ? (
            <motion.div className="flex items-center">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Generating Proof...
            </motion.div>
          ) : (
            <motion.div
              className="flex items-center"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Lock className="w-4 h-4 mr-2" />
              Generate Proof
            </motion.div>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}