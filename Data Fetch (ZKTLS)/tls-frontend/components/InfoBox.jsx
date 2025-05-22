import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { motion } from "framer-motion";
import { LightbulbIcon, CheckCircle, XCircle, FileText, DatabaseIcon } from "lucide-react";

export default function InfoBox() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
    >
      <Card className="shadow-lg border-none bg-white/90 backdrop-blur-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-xl font-bold flex items-center gap-2">
            <LightbulbIcon className="w-5 h-5 text-amber-500" />
            About TLS Notary
          </CardTitle>
          <CardDescription>
            A tool for creating verifiable proofs of web content
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-600">
            TLS Notary allows you to generate cryptographic proofs that verify the content you saw on a website, 
            without requiring the website to implement any special features. These proofs can be shared with others 
            to verify the authenticity of web content.
          </p>

          <Separator />

          <div className="space-y-3">
            <h3 className="font-medium">How it works:</h3>
            <div className="grid gap-2">
              <div className="flex gap-2 items-start">
                <div className="bg-blue-100 p-1.5 rounded-full text-blue-600 mt-0.5">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="text-sm">
                  <span className="font-medium">Generate a proof</span> by providing a URL and the specific content to notarize
                </div>
              </div>
              
              <div className="flex gap-2 items-start">
                <div className="bg-blue-100 p-1.5 rounded-full text-blue-600 mt-0.5">
                  <DatabaseIcon className="w-4 h-4" />
                </div>
                <div className="text-sm">
                  <span className="font-medium">Share the proof</span> with anyone who needs to verify the content
                </div>
              </div>
              
              <div className="flex gap-2 items-start">
                <div className="bg-blue-100 p-1.5 rounded-full text-blue-600 mt-0.5">
                  <CheckCircle className="w-4 h-4" />
                </div>
                <div className="text-sm">
                  <span className="font-medium">Verify proofs</span> to confirm the content's authenticity
                </div>
              </div>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <h3 className="font-medium">Use cases:</h3>
            <ul className="space-y-1 list-disc list-inside text-sm text-gray-600">
              <li>Prove the content of communications</li>
              <li>Verify financial or legal information</li>
              <li>Document online agreements</li>
              <li>Create evidence of online statements</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}