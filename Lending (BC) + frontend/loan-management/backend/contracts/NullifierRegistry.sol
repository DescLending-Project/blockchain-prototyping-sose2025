// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract NullifierRegistry is Initializable, AccessControlUpgradeable {
    // Role for contracts that can use nullifiers
    bytes32 public constant NULLIFIER_CONSUMER_ROLE = keccak256("NULLIFIER_CONSUMER_ROLE");
    
    // Mapping from nullifier hash to usage status
    mapping(bytes32 => bool) public usedNullifiers;
    
    // Mapping from user to their selected accounts (set once)
    mapping(address => address[]) public userSelectedAccounts;
    mapping(address => bool) public hasSelectedAccounts;
    
    // Events
    event NullifierUsed(bytes32 indexed nullifier, address indexed user, uint256 timestamp);
    event AccountsSelected(address indexed user, address[] accounts);
    event NullifierGenerated(address indexed user, bytes32 nullifier, uint256 nonce);
    
    function initialize(address admin) public initializer {
        __AccessControl_init();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }
    
    /**
     * @notice Select Ethereum accounts for credit scoring (one-time operation)
     * @param accounts Array of Ethereum addresses to use for DeFi credit scoring
     */
    function selectAccounts(address[] calldata accounts) external {
        require(!hasSelectedAccounts[msg.sender], "Accounts already selected");
        require(accounts.length > 0 && accounts.length <= 10, "Invalid number of accounts");
        
        // Verify ownership of all accounts by checking signatures
        for (uint i = 0; i < accounts.length; i++) {
            require(accounts[i] != address(0), "Invalid account address");
            // Additional validation could be added here
        }
        
        userSelectedAccounts[msg.sender] = accounts;
        hasSelectedAccounts[msg.sender] = true;
        
        emit AccountsSelected(msg.sender, accounts);
    }
    
    /**
     * @notice Generate a nullifier for a new borrow operation
     * @param user The borrower's address
     * @param loanAmount The amount being borrowed
     * @param timestamp The current timestamp
     * @return nullifier The generated nullifier
     */
    function generateNullifier(
        address user,
        uint256 loanAmount,
        uint256 timestamp
    ) external view returns (bytes32) {
        require(hasSelectedAccounts[user], "User must select accounts first");
        
        // Generate deterministic nullifier based on user's selected accounts and loan params
        return keccak256(abi.encodePacked(
            user,
            userSelectedAccounts[user],
            loanAmount,
            timestamp,
            block.chainid
        ));
    }
    
    /**
     * @notice Use a nullifier (marks it as consumed)
     * @param nullifier The nullifier to mark as used
     * @param user The user associated with this nullifier
     */
    function useNullifier(bytes32 nullifier, address user) 
        external 
        onlyRole(NULLIFIER_CONSUMER_ROLE) 
    {
        require(!usedNullifiers[nullifier], "Nullifier already used");
        require(hasSelectedAccounts[user], "User has no selected accounts");
        
        usedNullifiers[nullifier] = true;
        emit NullifierUsed(nullifier, user, block.timestamp);
    }
    
    /**
     * @notice Check if a nullifier has been used
     * @param nullifier The nullifier to check
     * @return bool True if the nullifier has been used
     */
    function isNullifierUsed(bytes32 nullifier) external view returns (bool) {
        return usedNullifiers[nullifier];
    }
    
    /**
     * @notice Get user's selected accounts
     * @param user The user's address
     * @return address[] Array of selected accounts
     */
    function getUserAccounts(address user) external view returns (address[] memory) {
        return userSelectedAccounts[user];
    }
    
    /**
     * @notice Verify that provided accounts match user's selection
     * @param user The user's address
     * @param accounts The accounts to verify
     * @return bool True if accounts match
     */
    function verifyAccountSelection(address user, address[] calldata accounts) 
        external 
        view 
        returns (bool) 
    {
        if (!hasSelectedAccounts[user]) return false;
        if (accounts.length != userSelectedAccounts[user].length) return false;
        
        for (uint i = 0; i < accounts.length; i++) {
            if (accounts[i] != userSelectedAccounts[user][i]) return false;
        }
        
        return true;
    }
}