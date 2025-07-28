// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
// import "hardhat/console.sol"; // Remove for production

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

    // Add these at the top with other state variables
    address public liquidityPool;

    // Then add this modifier
    modifier onlyAuthorized() {
        require(
            msg.sender == dao || msg.sender == liquidityPool,
            "Not authorized"
        );
        _;
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

    // Voting power = number of tokens + delegated votes
    mapping(address => uint256) private _delegatedVotes;

    function getVotes(address user) external view returns (uint256) {
        return _delegatedVotes[user];
    }

    function _mint(address to, uint256 tokenId) internal override {
        super._mint(to, tokenId);
        // Add to user's token list
        tokenIndex[tokenId] = userTokens[to].length;
        userTokens[to].push(tokenId);

        // Initialize delegated votes to self if no delegation exists
        if (_delegates[to] == address(0)) {
            _delegates[to] = to; // Set self-delegation
            _delegatedVotes[to] += 1;
        } else {
            // If already delegated, add votes to the delegatee
            _delegatedVotes[_delegates[to]] += 1;
        }
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

        // Remove delegated vote
        address delegatee = _delegates[owner];
        if (delegatee != address(0)) {
            _delegatedVotes[delegatee] -= 1;
        }

        super._burn(tokenId);
    }

    function slash(address voter, uint256 amount) external onlyAuthorized {
        require(voter != address(0), "Invalid address");

        uint256[] storage tokens = userTokens[voter];
        uint256 balance = tokens.length;
        require(balance > 0, "No tokens to slash");

        uint256 toBurn = amount > balance ? balance : amount;

        for (uint256 i = 0; i < toBurn; i++) {
            uint256 tokenId = tokens[tokens.length - 1];
            _burn(tokenId);
        }

        emit TokenSlashed(voter, toBurn);
        IProtocolGovernor(dao).penalizeReputation(voter, int256(toBurn));
    }

    function penalizeReputation(address user, uint256 amount) external {
        require(msg.sender == protocolGovernor, "Only ProtocolGovernor");
        require(user != address(0), "Invalid address");

        uint256[] storage tokens = userTokens[user];
        uint256 balance = tokens.length;
        if (balance == 0) return; // No tokens to burn

        uint256 toBurn = amount > balance ? balance : amount;

        for (uint256 i = 0; i < toBurn; i++) {
            uint256 tokenId = tokens[tokens.length - 1];
            _burn(tokenId);
        }

        // Update reputation
        reputation[user] -= int256(toBurn);

        emit TokenSlashed(user, toBurn);
        emit ReputationPenalized(user, toBurn);
    }

    // ===== BURN FUNCTIONS =====
    function burn(uint256 tokenId) public {
        require(_isApprovedOrOwner(msg.sender, tokenId), "Not owner nor approved");
        _burn(tokenId);
    }

    function burnFrom(address account, uint256 tokenId) public {
        require(_isApprovedOrOwner(msg.sender, tokenId), "Not owner nor approved");
        require(ownerOf(tokenId) == account, "Not token owner");
        _burn(tokenId);
    }

    // Add to VotingToken.sol
    function setLiquidityPool(address _pool) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_pool != address(0), "Invalid pool address");
        liquidityPool = _pool;
        emit LiquidityPoolUpdated(_pool);
    }

    // Add missing state variables and functions
    address public protocolGovernor;
    mapping(address => int256) public reputation;

    // Events
    event LiquidityPoolUpdated(address indexed newPool);
    event ProtocolGovernorUpdated(address indexed newGovernor);
    event ReputationPenalized(address indexed user, uint256 amount);

    function setProtocolGovernor(address _governor) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_governor != address(0), "Invalid governor address");
        protocolGovernor = _governor;
        emit ProtocolGovernorUpdated(_governor);
    }

    // Add totalSupply function for ERC721 compatibility
    function totalSupply() external view returns (uint256) {
        return nextTokenId - 1;
    }

    // ===== DELEGATION FUNCTIONS =====
    mapping(address => address) private _delegates;

    function delegate(address delegatee) public {
        _delegate(msg.sender, delegatee);
    }

    function delegates(address account) public view returns (address) {
        return _delegates[account];
    }

    function _delegate(address delegator, address delegatee) internal {
        require(delegatee != address(0), "Cannot delegate to zero address");

        address oldDelegatee = _delegates[delegator];
        uint256 delegatorBalance = balanceOf(delegator);

        // Remove votes from old delegatee
        if (oldDelegatee != address(0)) {
            _delegatedVotes[oldDelegatee] -= delegatorBalance;
        } else {
            // If no previous delegation, remove from self
            _delegatedVotes[delegator] -= delegatorBalance;
        }

        // Add votes to new delegatee
        _delegatedVotes[delegatee] += delegatorBalance;
        _delegates[delegator] = delegatee;

        emit DelegateChanged(delegator, delegatee);
    }

    // ===== PROTOCOL GOVERNOR INTEGRATION =====
    // (protocolGovernor already declared above)

    // ===== CHECKPOINT FUNCTIONS =====
    struct Checkpoint {
        uint32 fromBlock;
        uint256 votes;
    }

    mapping(address => Checkpoint[]) public checkpoints;

    function getPastVotes(address account, uint256 blockNumber) public view returns (uint256) {
        require(blockNumber < block.number, "Block not yet mined");

        Checkpoint[] storage accountCheckpoints = checkpoints[account];
        uint256 len = accountCheckpoints.length;

        if (len == 0) return 0;
        if (accountCheckpoints[0].fromBlock > blockNumber) return 0;

        uint256 lower = 0;
        uint256 upper = len - 1;

        while (upper > lower) {
            uint256 center = upper - (upper - lower) / 2;
            Checkpoint memory cp = accountCheckpoints[center];
            if (cp.fromBlock == blockNumber) {
                return cp.votes;
            } else if (cp.fromBlock < blockNumber) {
                lower = center;
            } else {
                upper = center - 1;
            }
        }

        return accountCheckpoints[lower].votes;
    }

    function _writeCheckpoint(address account, uint256 newVotes) internal {
        Checkpoint[] storage accountCheckpoints = checkpoints[account];
        uint256 len = accountCheckpoints.length;

        if (len > 0 && accountCheckpoints[len - 1].fromBlock == block.number) {
            accountCheckpoints[len - 1].votes = newVotes;
        } else {
            accountCheckpoints.push(Checkpoint({
                fromBlock: uint32(block.number),
                votes: newVotes
            }));
        }
    }

    // ===== EVENTS =====
    event DelegateChanged(address indexed delegator, address indexed delegatee);
    event VotesChanged(address indexed account, uint256 newVotes);

    // ===== OVERRIDES =====
    function _afterTokenTransfer(
        address from,
        address to,
        uint256 firstTokenId,
        uint256 batchSize
    ) internal override {
        super._afterTokenTransfer(from, to, firstTokenId, batchSize);

        // Update delegated votes on transfer
        if (from != address(0)) {
            address fromDelegatee = _delegates[from];
            if (fromDelegatee != address(0)) {
                _delegatedVotes[fromDelegatee] -= batchSize;
            } else {
                _delegatedVotes[from] -= batchSize;
            }
            uint256 fromVotes = _delegatedVotes[from];
            _writeCheckpoint(from, fromVotes);
            emit VotesChanged(from, fromVotes);
        }

        if (to != address(0)) {
            address toDelegatee = _delegates[to];
            if (toDelegatee != address(0)) {
                _delegatedVotes[toDelegatee] += batchSize;
            } else {
                _delegatedVotes[to] += batchSize;
            }
            uint256 toVotes = _delegatedVotes[to];
            _writeCheckpoint(to, toVotes);
            emit VotesChanged(to, toVotes);
        }
    }
}
