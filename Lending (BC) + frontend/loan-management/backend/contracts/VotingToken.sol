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
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        require(to != address(0), "Invalid address");
        console.log("VotingToken.mint called by");
        console.log(msg.sender);
        console.log("to");
        console.log(to);
        console.log("amount");
        console.log(amount);
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

    // Only DAO can slash tokens from a voter for malicious behavior
    function slash(address voter, uint256 amount) external {
        require(msg.sender == dao, "Only DAO can slash");
        require(voter != address(0), "Invalid address");
        uint256 balance = balanceOf(voter);
        require(balance > 0, "No tokens to slash");
        uint256 toBurn = amount > balance ? balance : amount;
        uint256 burned = 0;
        // Inefficient: iterate over all possible tokenIds
        for (
            uint256 tokenId = 1;
            tokenId < nextTokenId && burned < toBurn;
            tokenId++
        ) {
            if (ownerOf(tokenId) == voter) {
                _burn(tokenId);
                burned++;
            }
        }
        emit TokenSlashed(voter, burned);
        // Penalize reputation in ProtocolGovernor
        IProtocolGovernor(dao).penalizeReputation(voter, int256(burned));
    }
}
