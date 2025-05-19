import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Separator } from "@/components/ui/separator";
import { motion } from "framer-motion";
import { Copy, CheckCircle, Clock, Lock, ExternalLink, Info } from "lucide-react";
import { format } from "date-fns";

export default function ProofDisplay({ proof }) {
  const [copied, setCopied] = useState(false);

  const copyProofToClipboard = () => {
    navigator.clipboard.writeText(proof.proof_data);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const statusColors = {
    valid: "bg-green-100 text-green-800 border-green-200",
    invalid: "bg-red-100 text-red-800 border-red-200",
    pending: "bg-amber-100 text-amber-800 border-amber-200"
  };

  const statusIcons = {
    valid: <CheckCircle className="w-4 h-4 mr-1" />,
    invalid: <Info className="w-4 h-4 mr-1" />,
    pending: <Clock className="w-4 h-4 mr-1" />
  };

  const formatTimestamp = (timestamp) => {
    try {
      return format(new Date(timestamp), "PPpp");
    } catch (e) {
      return "Unknown date";
    }
  };

  if (!proof) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="w-full shadow-lg border-none bg-white/90 backdrop-blur-sm">
        <CardHeader className="space-y-1">
          <div className="flex justify-between items-center">
            <CardTitle className="text-2xl font-bold flex items-center gap-2">
              <Lock className="w-5 h-5 text-blue-600" />
              TLS Proof
            </CardTitle>
            <Badge variant="outline" className={`${statusColors[proof.status]} border`}>
              {statusIcons[proof.status]}
              {proof.status.charAt(0).toUpperCase() + proof.status.slice(1)}
            </Badge>
          </div>
          <CardDescription>
            Generated on {formatTimestamp(proof.timestamp)}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="space-y-1">
            <div className="text-sm font-medium text-gray-500">URL</div>
            <div className="flex items-center gap-2">
              <a 
                href={proof.url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline flex items-center gap-1"
              >
                {proof.url}
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          <Separator />

          <div className="space-y-1">
            <div className="text-sm font-medium text-gray-500">Notarized Data</div>
            <div className="p-3 bg-gray-50 rounded-md overflow-x-auto text-sm">
              <pre className="whitespace-pre-wrap">{proof.data}</pre>
            </div>
          </div>

          <Separator />

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-gray-500">Proof Data</div>
              <HoverCard>
                <HoverCardTrigger>
                  <Info className="w-4 h-4 text-gray-400 cursor-help" />
                </HoverCardTrigger>
                <HoverCardContent className="text-sm">
                  This is the cryptographic proof that verifies the content. Share this with anyone who needs to verify the content.
                </HoverCardContent>
              </HoverCard>
            </div>
            <div className="relative">
              <div className="p-3 bg-gray-50 rounded-md overflow-x-auto text-sm max-h-40">
                <pre className="whitespace-pre-wrap">{proof.proof_data}</pre>
              </div>
            </div>
          </div>
        </CardContent>

        <CardFooter className="flex justify-end">
          <Button
            variant="outline"
            onClick={copyProofToClipboard}
            className="transition-colors"
          >
            {copied ? (
              <motion.span className="flex items-center">
                <CheckCircle className="w-4 h-4 mr-2 text-green-500" />
                Copied!
              </motion.span>
            ) : (
              <span className="flex items-center">
                <Copy className="w-4 h-4 mr-2" />
                Copy Proof
              </span>
            )}
          </Button>
        </CardFooter>
      </Card>
    </motion.div>
  );
}