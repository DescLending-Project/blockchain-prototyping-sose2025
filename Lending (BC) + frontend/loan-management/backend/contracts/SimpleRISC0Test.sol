// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import "./verifiers/IRiscZeroVerifier.sol";

//Simple RISC Zero Integration Test with Demo Support
//- supports demo mode
contract SimpleRISC0Test {
    IRiscZeroVerifier public immutable verifier;
    
    bytes32 public constant ACCOUNT_MERKLE_IMAGE_ID = 0xb083f461f1de589187ceac04a9eb2c0fd7c99b8c80f4ed3f3d45963c8b9606bf;
    bytes32 public constant TRADFI_SCORE_IMAGE_ID = 0x81c6f5d0702b3a373ce771febb63581ed62fbd6ff427e4182bb827144e4a4c4c;
    //bytes32 public constant NESTING_PROOF_IMAGE_ID = 0xc5f84dae4b65b7ddd4591d0a119bcfb84fec97156216be7014ff03e1ff8f380e;
    //the address below is from the error output
    bytes32 public constant NESTING_PROOF_IMAGE_ID = 0x6da21d5bc6a7534bc686b9294717f12994b13c67183c86668c62d01fcc453151;
    
    // Demo mode for testing without real proofs
    bool public demoMode;
    address public owner;
    
    // Simple storage to track successful verifications
    mapping(address => bool) public hasVerifiedTradFi;
    mapping(address => bool) public hasVerifiedAccount;
    mapping(address => bool) public hasVerifiedNesting;
    
    // Events to confirm verification success
    event TradFiProofVerified(address indexed user, uint256 timestamp);
    event AccountProofVerified(address indexed user, uint256 timestamp);
    event NestingProofVerified(address indexed user, uint256 timestamp);
    event ProofVerificationFailed(address indexed user, string reason);
    event DemoModeToggled(bool enabled);
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }
    
    constructor(IRiscZeroVerifier _verifier) {
        verifier = _verifier;
        owner = msg.sender;
        demoMode = true; // Start in DEMO mode NOTE: DONT FORGET TO CHANGE THIS
    }
    
    // Toggle demo mode for testing
    function setDemoMode(bool _demoMode) external onlyOwner {
        demoMode = _demoMode;
        emit DemoModeToggled(_demoMode);
    }
    
    // Test TradFi TLSN proof verification
    // The RISC Zero proof seal
    // The journal data from the proof
    function testTradFiProof(
        bytes calldata seal,
        bytes calldata journalData
    ) external {
        if (demoMode) {
            // In demo mode, accept mock proofs that start with "MOCK_TRADFI_SEAL_"
            if (_isMockProof(seal, "MOCK_TRADFI_SEAL_")) {
                hasVerifiedTradFi[msg.sender] = true;
                emit TradFiProofVerified(msg.sender, block.timestamp);
                return;
            }
        }
        
        // Production verification
        try verifier.verify(seal, TRADFI_SCORE_IMAGE_ID, sha256(journalData)) {
            hasVerifiedTradFi[msg.sender] = true;
            emit TradFiProofVerified(msg.sender, block.timestamp);
        } catch Error(string memory reason) {
            emit ProofVerificationFailed(msg.sender, reason);
            revert(string(abi.encodePacked("TradFi verification failed: ", reason)));
        } catch {
            emit ProofVerificationFailed(msg.sender, "Unknown error");
            revert("TradFi verification failed: Unknown error");
        }
    }
    
    // Test Account Merkle proof verification
    // seal The RISC Zero proof seal
    // journalData The journal data from the proof
    function testAccountProof(
        bytes calldata seal,
        bytes calldata journalData
    ) external {
        if (demoMode) {
            // In demo mode, accept mock proofs that start with "MOCK_ACCOUNT_SEAL_"
            if (_isMockProof(seal, "MOCK_ACCOUNT_SEAL_")) {
                hasVerifiedAccount[msg.sender] = true;
                emit AccountProofVerified(msg.sender, block.timestamp);
                return;
            }
        }
        
        // Production verification
        try verifier.verify(seal, ACCOUNT_MERKLE_IMAGE_ID, sha256(journalData)) {
            hasVerifiedAccount[msg.sender] = true;
            emit AccountProofVerified(msg.sender, block.timestamp);
        } catch Error(string memory reason) {
            emit ProofVerificationFailed(msg.sender, reason);
            revert(string(abi.encodePacked("Account verification failed: ", reason)));
        } catch {
            emit ProofVerificationFailed(msg.sender, "Unknown error");
            revert("Account verification failed: Unknown error");
        }
    }
    
    // Test Nesting proof verification
    // seal The RISC Zero proof seal
    // journalData The journal data from the proof


    function testNestingProof(
        bytes calldata seal,
        bytes calldata journalData
    ) external {
        if (demoMode) {
            // In demo mode, accept mock proofs that start with "MOCK_NESTING_SEAL_"
            if (_isMockProof(seal, "MOCK_NESTING_SEAL_")) {
                hasVerifiedNesting[msg.sender] = true;
                emit NestingProofVerified(msg.sender, block.timestamp);
                return;
            }
        }
        
        // Production verification
        try verifier.verify(seal, NESTING_PROOF_IMAGE_ID, sha256(journalData)) {
            hasVerifiedNesting[msg.sender] = true;
            emit NestingProofVerified(msg.sender, block.timestamp);
        } catch Error(string memory reason) {
            emit ProofVerificationFailed(msg.sender, reason);
            revert(string(abi.encodePacked("Nesting verification failed: ", reason)));
        } catch {
            emit ProofVerificationFailed(msg.sender, "Unknown error");
            revert("Nesting verification failed: Unknown error");
        }
    }
    
    /// @notice Check if a seal is a mock proof
    function _isMockProof(bytes calldata seal, string memory prefix) internal pure returns (bool) {
        bytes memory prefixBytes = bytes(prefix);
        if (seal.length < prefixBytes.length) return false;
        
        // Convert seal to string for easier comparison
        string memory sealStr = string(seal);
        
        // Check if seal starts with the prefix
        for (uint i = 0; i < prefixBytes.length; i++) {
            if (seal[i] != prefixBytes[i]) return false;
        }
        return true;
    }
    
    /// @notice Helper function to check mock proof (public for debugging)
    function isMockProof(bytes calldata seal, string memory prefix) external pure returns (bool) {
        return _isMockProof(seal, prefix);
    }
    
    function getVerificationStatus(address user) 
        external 
        view 
        returns (
            bool tradFiVerified,
            bool accountVerified,
            bool nestingVerified
        ) 
    {
        tradFiVerified = hasVerifiedTradFi[user];
        accountVerified = hasVerifiedAccount[user];
        nestingVerified = hasVerifiedNesting[user];
    }
    

    function ping() external view returns (uint256) {
        return block.timestamp;
    }
    

    function getVerifierAddress() external view returns (address) {
        return address(verifier);
    }
    
    
    function isDemoMode() external view returns (bool) {
        return demoMode;
    }
}