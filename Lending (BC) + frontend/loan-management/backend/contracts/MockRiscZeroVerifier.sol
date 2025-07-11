// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// mock verifier for RISC0 proofs, used in demo mode
contract MockRiscZeroVerifier {
    
    // Events for tracking verification attempts
    event ProofVerificationAttempted(
        bytes32 indexed imageId,
        bytes32 indexed journalDigest,
        bool success
    );
    
    // seal:  The proof seal (ignored in mock)
    // imageId: The program image ID this is needed for proof verification
    //journalDigest: The journal hash which is a hash of the journal data
    function verify(
        bytes calldata seal, 
        bytes32 imageId, 
        bytes32 journalDigest
    ) external {
        // Basic validation to ensure parameters are provided
        require(seal.length > 0, "MockVerifier: Empty seal");
        require(imageId != bytes32(0), "MockVerifier: Empty image ID");
        require(journalDigest != bytes32(0), "MockVerifier: Empty journal digest");
        
        // For demo, always succeed
        // normally this would perform actual cryptographic verification
        
        emit ProofVerificationAttempted(imageId, journalDigest, true);
    }
    
    // Alternative verify function with journal data

    function verifyWithJournal(
        bytes calldata seal,
        bytes32 imageId,
        bytes calldata journal
    ) external {
        bytes32 journalDigest = sha256(journal);
        this.verify(seal, imageId, journalDigest);
    }
    
    // Check if this is a mock verifier
    //return true (always true for mock)
    function isMockVerifier() external pure returns (bool) {
        return true;
    }

    function version() external pure returns (string memory) {
        return "MockRiscZeroVerifier-v1.0.0-demo";
    }
}