// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "hardhat/console.sol";

// Add interface for ProtocolGovernor
interface IProtocolGovernor {
    function penalizeReputation(address user, int256 amount) external;
}

contract VotingToken is ERC721, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    uint256 public nextTokenId;
    address public dao;

    // Add mapping to track user's tokens for efficient slashing
    mapping(address => uint256[]) private userTokens;
    mapping(uint256 => uint256) private tokenIndex; // tokenId => index in userTokens array

    event TokenMinted(address indexed to, uint256 indexed tokenId);
    event DAOSet(address indexed newDAO);
    event TokenSlashed(address indexed voter, uint256 amount);

    constructor(address _dao) ERC721("Governance Token", "GOV") {
        require(_dao != address(0), "DAO address required");
        dao = _dao;
        nextTokenId = 1;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    function setDAO(address newDAO) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newDAO != address(0), "Invalid DAO");
        dao = newDAO;
        emit DAOSet(newDAO);
    }

    // MINTER_ROLE can mint soulbound tokens
    function mintSingle(address to) external onlyRole(MINTER_ROLE) {
        require(to != address(0), "Invalid address");
        uint256 tokenId = nextTokenId++;
        _mint(to, tokenId);
        emit TokenMinted(to, tokenId);
    }

    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        require(to != address(0), "Invalid address");
        require(amount > 0 && amount <= 100, "Amount must be 1-100"); // Limit batch size
        for (uint256 i = 0; i < amount; i++) {
            uint256 tokenId = nextTokenId++;
            _mint(to, tokenId);
            emit TokenMinted(to, tokenId);
        }
    }

    // Block all transfers except minting and burning by overriding transferFrom only
    function transferFrom(
        address from,
        address to,
        uint256 tokenId
    ) public override {
        revert("Soulbound: non-transferable");
    }

    // Voting power = number of tokens
    function getVotes(address user) external view returns (uint256) {
        return balanceOf(user);
    }

    function _mint(address to, uint256 tokenId) internal override {
        super._mint(to, tokenId);
        // Add to user's token list
        tokenIndex[tokenId] = userTokens[to].length;
        userTokens[to].push(tokenId);
    }

    function _burn(uint256 tokenId) internal override {
        address owner = ownerOf(tokenId);

        // Remove from user's token list efficiently
        uint256[] storage tokens = userTokens[owner];
        uint256 index = tokenIndex[tokenId];
        uint256 lastIndex = tokens.length - 1;

        if (index != lastIndex) {
            uint256 lastTokenId = tokens[lastIndex];
            tokens[index] = lastTokenId;
            tokenIndex[lastTokenId] = index;
        }

        tokens.pop();
        delete tokenIndex[tokenId];

        super._burn(tokenId);
    }

    function slash(address voter, uint256 amount) external {
        require(msg.sender == dao, "Only DAO can slash");
        require(voter != address(0), "Invalid address");

        uint256[] storage tokens = userTokens[voter];
        uint256 balance = tokens.length;
        require(balance > 0, "No tokens to slash");

        uint256 toBurn = amount > balance ? balance : amount;

        // Burn from the end of array for efficiency
        for (uint256 i = 0; i < toBurn; i++) {
            uint256 tokenId = tokens[tokens.length - 1];
            _burn(tokenId);
        }

        emit TokenSlashed(voter, toBurn);
        IProtocolGovernor(dao).penalizeReputation(voter, int256(toBurn));
    }
}
