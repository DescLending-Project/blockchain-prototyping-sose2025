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
    ) external view {
        // Basic validation to ensure parameters are provided (more lenient for testing)
        require(seal.length > 0, "MockVerifier: Empty seal");
        // Allow zero imageId and journalDigest for testing

        // For demo, always succeed
        // normally this would perform actual cryptographic verification
        // Note: Cannot emit events in view function
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

    // Mock function for account proof testing
    function testAccountProof(
        bytes calldata seal,
        bytes calldata journalData
    ) external {
        // Basic validation to ensure parameters are provided
        require(seal.length > 0, "Seal cannot be empty");
        require(journalData.length > 0, "Journal data cannot be empty");

        // In a real implementation, this would verify the proof
        // For mock, we just validate the inputs
        emit ProofVerificationAttempted(bytes32(0), keccak256(journalData), true);
    }

    // Mock function for TradFi proof testing
    function testTradFiProof(
        bytes calldata seal,
        bytes calldata journalData
    ) external {
        // Basic validation to ensure parameters are provided
        require(seal.length > 0, "Seal cannot be empty");
        require(journalData.length > 0, "Journal data cannot be empty");

        // In a real implementation, this would verify the proof
        // For mock, we just validate the inputs
        emit ProofVerificationAttempted(bytes32(0), keccak256(journalData), true);
    }
}