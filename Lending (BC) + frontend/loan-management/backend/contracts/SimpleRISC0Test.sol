// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import "./verifiers/IRiscZeroVerifier.sol";

/// @title Simple RISC Zero Integration Test
/// @notice Minimal contract to test RISC Zero proof verification
/// @dev Tests each proof type individually to ensure integration works
contract SimpleRISC0Test {
    IRiscZeroVerifier public immutable verifier;
    
    // Image IDs from your extracted values
    bytes32 public constant ACCOUNT_MERKLE_IMAGE_ID = 0xb083f461f1de589187ceac04a9eb2c0fd7c99b8c80f4ed3f3d45963c8b9606bf;
    bytes32 public constant TRADFI_SCORE_IMAGE_ID = 0x81c6f5d0702b3a373ce771febb63581ed62fbd6ff427e4182bb827144e4a4c4c;
    bytes32 public constant NESTING_PROOF_IMAGE_ID = 0xc5f84dae4b65b7ddd4591d0a119bcfb84fec97156216be7014ff03e1ff8f380e;
    
    // Simple storage to track successful verifications
    mapping(address => bool) public hasVerifiedTradFi;
    mapping(address => bool) public hasVerifiedAccount;
    mapping(address => bool) public hasVerifiedNesting;
    
    // Events to confirm verification success
    event TradFiProofVerified(address indexed user, uint256 timestamp);
    event AccountProofVerified(address indexed user, uint256 timestamp);
    event NestingProofVerified(address indexed user, uint256 timestamp);
    event ProofVerificationFailed(address indexed user, string reason);
    
    constructor(IRiscZeroVerifier _verifier) {
        verifier = _verifier;
    }
    
    /// @notice Test TradFi TLSN proof verification
    /// @param seal The RISC Zero proof seal
    /// @param journalData The journal data from the proof
    function testTradFiProof(
        bytes calldata seal,
        bytes calldata journalData
    ) external {
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
    
    /// @notice Test Account Merkle proof verification
    /// @param seal The RISC Zero proof seal
    /// @param journalData The journal data from the proof
    function testAccountProof(
        bytes calldata seal,
        bytes calldata journalData
    ) external {
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
    
    /// @notice Test Nesting proof verification
    /// @param seal The RISC Zero proof seal
    /// @param journalData The journal data from the proof
    function testNestingProof(
        bytes calldata seal,
        bytes calldata journalData
    ) external {
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
    
    /// @notice Get verification status for a user
    /// @param user Address to check
    /// @return tradFiVerified Whether user has verified TradFi proof
    /// @return accountVerified Whether user has verified Account proof
    /// @return nestingVerified Whether user has verified Nesting proof
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
    
    /// @notice Simple function to test if contract is working
    /// @return The current block timestamp
    function ping() external view returns (uint256) {
        return block.timestamp;
    }
    
    /// @notice Get the verifier address for debugging
    /// @return Address of the RISC Zero verifier contract
    function getVerifierAddress() external view returns (address) {
        return address(verifier);
    }
}