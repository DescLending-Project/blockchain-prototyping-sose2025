import { useState, useEffect } from 'react';
import { Button } from '../../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Alert, AlertDescription } from '../../ui/alert';
import { Badge } from '../../ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import { Shield, Download, Terminal, CheckCircle, Clock, AlertCircle, RefreshCw, Eye, Copy, RotateCcw } from 'lucide-react';

export function CreditScorePanel({ contracts, account, provider }) {
  const [creditScore, setCreditScore] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState('check'); // 'check', 'tlsn', 'tlsn-error', 'export', 'proof', 'complete'
  const [tlsnData, setTlsnData] = useState(null);
  const [tlsnError, setTlsnError] = useState(null);
  const [generatedCommand, setGeneratedCommand] = useState('');
  const [activeTab, setActiveTab] = useState('verify');

  // Check if user has existing credit score
  useEffect(() => {
    const checkExistingScore = async () => {
      if (contracts?.creditScoreVerifier && account) {
        try {
          setIsLoading(true);
          const result = await contracts.creditScoreVerifier.getCreditScore(account);
          console.log('Credit score result:', result);
          
          if (result[1]) { // isValid
            setCreditScore({
              score: Number(result[0]),
              isValid: result[1],
              timestamp: Number(result[2])
            });
            setStep('complete');
          }
        } catch (err) {
          console.log('No existing credit score found:', err);
        } finally {
          setIsLoading(false);
        }
      }
    };
    
    checkExistingScore();
  }, [contracts, account]);

  // Listen for credit score events
  useEffect(() => {
    if (contracts?.creditScoreVerifier && account) {
      const filter = contracts.creditScoreVerifier.filters.CreditScoreSubmitted(account);
      
      const handleCreditScoreEvent = (user, score, serverName, stateRootProvider, timestamp) => {
        console.log('Credit score event received:', { user, score, serverName, stateRootProvider, timestamp });
        setCreditScore({
          score: Number(score),
          isValid: true,
          timestamp: Number(timestamp)
        });
        setStep('complete');
        // Trigger a refresh of other components
        window.dispatchEvent(new CustomEvent('creditScoreUpdated', { detail: { score: Number(score) } }));
      };

      contracts.creditScoreVerifier.on(filter, handleCreditScoreEvent);

      return () => {
        contracts.creditScoreVerifier.off(filter, handleCreditScoreEvent);
      };
    }
  }, [contracts, account]);

  const getFICORating = (score) => {
    if (score >= 800) return { rating: "Exceptional", color: "text-green-600", bgColor: "bg-green-50", borderColor: "border-green-200" };
    if (score >= 740) return { rating: "Very Good", color: "text-green-500", bgColor: "bg-green-50", borderColor: "border-green-200" };  
    if (score >= 670) return { rating: "Good", color: "text-yellow-600", bgColor: "bg-yellow-50", borderColor: "border-yellow-200" };
    if (score >= 580) return { rating: "Fair", color: "text-orange-600", bgColor: "bg-orange-50", borderColor: "border-orange-200" };
    return { rating: "Poor", color: "text-red-600", bgColor: "bg-red-50", borderColor: "border-red-200" };
  };

  const handleTLSNStart = () => {
    console.log('Starting TLSNotary process...');
    setStep('tlsn');
    setTlsnError(null);
    
    if (window.openTLSNExtension && window.tlsnExtensionAvailable) {
      try {
        const result = window.openTLSNExtension();
        console.log('TLSNotary extension result:', result);
        
        // Listen for real TLSNotary completion
        // This would need to be implemented based on how the extension communicates results
        // For now, we'll simulate checking for completion
        
        // Check for TLSNotary completion after a reasonable time
        setTimeout(() => {
          // Here you would check if TLSNotary actually completed
          // For now, we'll assume it might fail and show the error state
          const tlsnCompleted = false; // This should be replaced with actual check
          
          if (tlsnCompleted) {
            // Real TLSNotary data would be processed here
            setTlsnData({
              creditScore: 720, // Real score from TLSNotary
              bankName: "Real Bank",
              attestationProof: "0xreal...",
              sessionData: { validated: true },
              isRealData: true
            });
            setStep('export');
          } else {
            // Show error with options
            setTlsnError({
              message: "TLSNotary verification failed or timed out",
              details: "The extension may need more time or encountered an error"
            });
            setStep('tlsn-error');
          }
        }, 10000); // Wait 100 seconds for real completion
        
      } catch (error) {
        console.error('Error calling TLSNotary extension:', error);
        setTlsnError({
          message: "Failed to start TLSNotary extension",
          details: error.message
        });
        setStep('tlsn-error');
      }
    } else {
      console.log('TLSNotary Extension not available');
      setTlsnError({
        message: "TLSNotary Extension not found",
        details: "Please install the TLSNotary extension first"
      });
      setStep('tlsn-error');
    }
  };

  const retryTLSNotary = () => {
    setTlsnError(null);
    handleTLSNStart();
  };

  const useMockData = () => {
    console.log('Using mock data for testing...');
    setTlsnData({
      creditScore: 750,
      bankName: "Mock Bank",
      attestationProof: "0x1234...",
      sessionData: { validated: true },
      isRealData: false
    });
    setTlsnError(null);
    setStep('export');
  };

  const generateExportFiles = () => {
    // Generate the RISC Zero command with current network details
    const chainId = provider?.network?.chainId || 11155111; // Default to Sepolia
    const rpcUrl = chainId === 11155111 ? 'https://sepolia.infura.io/v3/YOUR_INFURA_KEY' : 'http://localhost:8545';
    const contractAddress = contracts?.creditScoreVerifier?.target || contracts?.creditScoreVerifier?.address;
    
    const command = `RISC0_USE_DOCKER=1 cargo run -p host --bin host --release -- \\
  --tradfi-receipt-path host/receipts/tradfi_score.bin \\
  --account-receipt-path host/receipts/account_receipt.bin \\
  --stateroot-receipt-path host/receipts/alchemy_stateroot.bin \\
  --chain-id ${chainId} \\
  --rpc-url ${rpcUrl} \\
  --contract ${contractAddress} \\
  --eth-wallet-private-key YOUR_PRIVATE_KEY`;

    setGeneratedCommand(command);
    setStep('proof');
  };

  const copyCommand = () => {
    navigator.clipboard.writeText(generatedCommand);
    alert('Command copied to clipboard!');
  };

  const resetProcess = () => {
    setStep('check');
    setTlsnData(null);
    setTlsnError(null);
    setGeneratedCommand('');
    setCreditScore(null);
  };

  const refreshCreditScore = async () => {
    setIsLoading(true);
    try {
      const result = await contracts.creditScoreVerifier.getCreditScore(account);
      if (result[1]) {
        setCreditScore({
          score: Number(result[0]),
          isValid: result[1],
          timestamp: Number(result[2])
        });
        setStep('complete');
      }
    } catch (err) {
      console.log('No credit score found:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading && !creditScore) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>Checking for existing credit score...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Credit Score Verification</h2>
        <div className="flex gap-2">
          {creditScore && (
            <Button variant="outline" onClick={resetProcess}>
              Get New Score
            </Button>
          )}
          <Button variant="outline" onClick={refreshCreditScore} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="verify">Verification Flow</TabsTrigger>
          <TabsTrigger value="status">Current Status</TabsTrigger>
        </TabsList>

        <TabsContent value="status">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Current Credit Score Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              {creditScore ? (
                <div className="space-y-4">
                  <div className={`p-6 rounded-lg border ${getFICORating(creditScore.score).bgColor} ${getFICORating(creditScore.score).borderColor}`}>
                    <div className="text-center space-y-4">
                      <div className="flex items-center justify-center space-x-2">
                        <CheckCircle className="h-6 w-6 text-green-600" />
                        <h3 className="text-lg font-semibold">Verified Credit Score</h3>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="text-5xl font-bold text-gray-800">{creditScore.score}</div>
                        <div className="text-sm text-gray-600">FICO Score (300-850)</div>
                        
                        <Badge className={`${getFICORating(creditScore.score).bgColor} ${getFICORating(creditScore.score).color} border-0`}>
                          {getFICORating(creditScore.score).rating} Credit
                        </Badge>
                        
                        <div className="text-xs text-gray-500 mt-2">
                          Verified on {new Date(creditScore.timestamp * 1000).toLocaleDateString()}
                        </div>
                      </div>

                      <div className="w-full bg-gray-200 rounded-full h-4 mt-4">
                        <div 
                          className="bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 h-4 rounded-full transition-all duration-1000"
                          style={{ width: `${((creditScore.score - 300) / 550) * 100}%` }}
                        ></div>
                      </div>
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>300</span>
                        <span>850</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 border rounded-lg bg-blue-50">
                      <h4 className="font-medium text-blue-900">Borrowing Impact</h4>
                      <p className="text-sm text-blue-700 mt-1">
                        {creditScore.score >= 700 ? "Eligible for premium rates" : 
                         creditScore.score >= 650 ? "Standard rates available" : 
                         "Limited borrowing options"}
                      </p>
                    </div>
                    <div className="p-4 border rounded-lg bg-green-50">
                      <h4 className="font-medium text-green-900">Collateral Benefits</h4>
                      <p className="text-sm text-green-700 mt-1">
                        {creditScore.score >= 650 ? "Partial withdrawal enabled" : "Standard collateral rules"}
                      </p>
                    </div>
                    <div className="p-4 border rounded-lg bg-purple-50">
                      <h4 className="font-medium text-purple-900">Verification</h4>
                      <p className="text-sm text-purple-700 mt-1">Zero-knowledge proof verified</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Shield className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900">No Verified Credit Score</h3>
                  <p className="text-gray-600 mt-2">Complete the verification process to see your score here.</p>
                  <Button onClick={() => setActiveTab('verify')} className="mt-4">
                    Start Verification
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="verify">
          {/* Progress Steps */}
          <div className="flex items-center space-x-4 mb-6">
            {['check', 'tlsn', 'export', 'proof', 'complete'].map((stepName, index) => {
              const currentStepIndex = ['check', 'tlsn', 'tlsn-error', 'export', 'proof', 'complete'].indexOf(step);
              const targetStepIndex = ['check', 'tlsn', 'export', 'proof', 'complete'].indexOf(stepName);
              
              return (
                <div key={stepName} className="flex items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    step === stepName || (step === 'tlsn-error' && stepName === 'tlsn') ? 'bg-blue-600 text-white' :
                    currentStepIndex > targetStepIndex ? 'bg-green-600 text-white' :
                    'bg-gray-200 text-gray-600'
                  }`}>
                    {currentStepIndex > targetStepIndex ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : (
                      index + 1
                    )}
                  </div>
                  {index < 4 && (
                    <div className={`w-16 h-1 ${
                      currentStepIndex > targetStepIndex ? 'bg-green-600' : 'bg-gray-200'
                    }`} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Step Content */}
          {step === 'check' && !creditScore && (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center space-y-4">
                  <Shield className="h-16 w-16 text-blue-600 mx-auto" />
                  <h3 className="text-xl font-semibold">Get Your Verified Credit Score</h3>
                  <p className="text-gray-600 max-w-md mx-auto">
                    Use TLSNotary to privately verify your credit score from traditional financial institutions. 
                    Your data remains private while generating cryptographic proof.
                  </p>
                  <Button onClick={handleTLSNStart} className="mt-4" size="lg">
                    <Shield className="h-4 w-4 mr-2" />
                    Start Verification Process
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {step === 'tlsn' && (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center space-y-4">
                  <div className="animate-pulse">
                    <Shield className="h-16 w-16 text-blue-600 mx-auto" />
                  </div>
                  <h3 className="text-xl font-semibold">TLSNotary in Progress</h3>
                  <p className="text-gray-600">
                    Please complete the verification in the TLSNotary extension window...
                  </p>
                  <div className="flex items-center justify-center space-x-2 text-sm text-gray-500">
                    <Clock className="h-4 w-4" />
                    <span>This may take a few minutes</span>
                  </div>
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Waiting for TLSNotary extension to complete verification. If this takes too long, the process may have failed.
                    </AlertDescription>
                  </Alert>
                </div>
              </CardContent>
            </Card>
          )}

          {step === 'tlsn-error' && tlsnError && (
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      <div className="space-y-1">
                        <p className="font-medium">{tlsnError.message}</p>
                        {tlsnError.details && (
                          <p className="text-sm text-red-600">{tlsnError.details}</p>
                        )}
                      </div>
                    </AlertDescription>
                  </Alert>

                  <div className="text-center space-y-4">
                    <h3 className="text-lg font-semibold">What would you like to do?</h3>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                      <Button onClick={retryTLSNotary} variant="outline" className="flex items-center gap-2">
                        <RotateCcw className="h-4 w-4" />
                        Retry TLSNotary
                      </Button>
                      <Button onClick={useMockData} variant="secondary" className="flex items-center gap-2">
                        <Terminal className="h-4 w-4" />
                        Use Mock Data for Testing
                      </Button>
                    </div>
                    <p className="text-sm text-gray-500 max-w-md mx-auto">
                      You can retry TLSNotary verification or continue with mock data to test the complete integration flow.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {step === 'export' && tlsnData && (
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <h3 className="text-lg font-semibold">TLSNotary Complete</h3>
                    {!tlsnData.isRealData && (
                      <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                        Mock Data
                      </Badge>
                    )}
                  </div>
                  
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      TLSNotary verification successful! Credit score: {tlsnData.creditScore} from {tlsnData.bankName}
                      {!tlsnData.isRealData && " (using mock data for testing)"}
                    </AlertDescription>
                  </Alert>

                  <div className="space-y-2">
                    <p className="text-sm text-gray-600">
                      Next, you'll need to generate a zero-knowledge proof using RISC Zero. 
                      This creates cryptographic evidence without revealing your private data.
                    </p>
                    <Button onClick={generateExportFiles} className="w-full">
                      <Download className="h-4 w-4 mr-2" />
                      Generate Proof Instructions
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {step === 'proof' && generatedCommand && (
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold flex items-center">
                    <Terminal className="h-5 w-5 mr-2" />
                    Generate Zero-Knowledge Proof
                  </h3>
                  
                  <div className="space-y-3">
                    <p className="text-sm text-gray-600">
                      Run this command in your RISC Zero environment to generate and submit your proof:
                    </p>
                    
                    <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm overflow-x-auto">
                      <pre className="whitespace-pre-wrap">{generatedCommand}</pre>
                    </div>
                    
                    <div className="flex space-x-2">
                      <Button onClick={copyCommand} variant="outline" size="sm">
                        <Copy className="h-4 w-4 mr-2" />
                        Copy Command
                      </Button>
                    </div>
                    
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        After running this command successfully, your verified credit score will appear automatically on this page. 
                        The page will refresh when the proof is submitted to the contract.
                      </AlertDescription>
                    </Alert>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {step === 'complete' && creditScore && (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center space-y-4">
                  <CheckCircle className="h-16 w-16 text-green-600 mx-auto" />
                  <h3 className="text-xl font-semibold">Verification Complete!</h3>
                  <p className="text-gray-600">
                    Your credit score has been successfully verified and is now available for enhanced borrowing terms.
                  </p>
                  <Button onClick={() => setActiveTab('status')} variant="outline">
                    <Eye className="h-4 w-4 mr-2" />
                    View Credit Score Details
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}