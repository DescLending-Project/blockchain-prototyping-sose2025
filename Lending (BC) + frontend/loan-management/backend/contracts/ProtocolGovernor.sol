// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/governance/Governor.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorSettings.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorCountingSimple.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorTimelockControl.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./VotingToken.sol";
import "./interfaces/AggregatorV3Interface.sol";
import "hardhat/console.sol";

contract ProtocolGovernor is
    Governor,
    GovernorSettings,
    GovernorCountingSimple,
    GovernorTimelockControl
{
    using Math for uint256;
    VotingToken public votingToken;

    constructor(
        address _votingToken,
        TimelockController _timelock
    )
        Governor("ProtocolGovernor")
        GovernorSettings(60 /* 60 seconds */, 60 /* 60 seconds */, 0)
        GovernorTimelockControl(_timelock)
    {
        votingToken = VotingToken(_votingToken);
        contractWhitelist[address(this)] = true;
    }

    // The following functions are overrides required by Solidity.

    function votingDelay()
        public
        view
        override(IGovernor, GovernorSettings)
        returns (uint256)
    {
        return super.votingDelay();
    }

    function votingPeriod()
        public
        view
        override(IGovernor, GovernorSettings)
        returns (uint256)
    {
        return super.votingPeriod();
    }

    function proposalThreshold()
        public
        view
        override(Governor, GovernorSettings)
        returns (uint256)
    {
        return super.proposalThreshold();
    }

    function quorum(
        uint256 blockNumber
    ) public view override(IGovernor) returns (uint256) {
        if (bootstrapMode) return bootstrapQuorum;
        return ((votingToken.nextTokenId() - 1) * quorumPercentage) / 10000;
    }

    function state(
        uint256 proposalId
    )
        public
        view
        override(Governor, GovernorTimelockControl)
        returns (ProposalState)
    {
        return super.state(proposalId);
    }

    function propose(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        string memory description
    ) public override(Governor, IGovernor) returns (uint256) {
        console.log("Proposing with target:", targets[0]);
        console.log("Value:", values[0]);
        console.log("Calldata length:", calldatas[0].length);
        return super.propose(targets, values, calldatas, description);
    }

    function _execute(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) {
        super._execute(proposalId, targets, values, calldatas, descriptionHash);
    }

    function _cancel(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) returns (uint256) {
        return super._cancel(targets, values, calldatas, descriptionHash);
    }

    function _executor()
        internal
        view
        override(Governor, GovernorTimelockControl)
        returns (address)
    {
        return super._executor();
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(Governor, GovernorTimelockControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    function _getVotes(
        address account,
        uint256 /*timepoint*/,
        bytes memory /*params*/
    ) internal view override returns (uint256) {
        uint256 rawVotes = votingToken.balanceOf(account);
        uint256 baseVotes = Math.sqrt(rawVotes);
        int256 rep = reputation[account];
        if (rep < -10) {
            return baseVotes / 2;
        } else if (rep > 20) {
            return (baseVotes * 3) / 2;
        } else {
            return baseVotes;
        }
    }

    function queueAdvancedProposal(uint256 proposalId) public {
        Proposal storage p = proposals[proposalId];
        require(block.timestamp > p.endTime, "Voting not ended");
        require(p.yesVotes > p.noVotes, "Proposal failed");
        require(!p.queued, "Already queued");

        console.log("Queueing proposal:", proposalId);
        console.log("Yes votes:", p.yesVotes);
        console.log("No votes:", p.noVotes);

        p.queued = true;
        bytes32 salt = keccak256(abi.encode(proposalId));
        bytes memory callData = abi.encodePacked(
            p.functionSelector,
            p.encodedParams
        );

        console.log("Scheduling through timelock...");
        TimelockController(payable(_executor())).schedule(
            p.targetContract,
            0,
            callData,
            bytes32(0),
            salt,
            TimelockController(payable(_executor())).getMinDelay()
        );

        p.executeAfter =
            block.timestamp +
            TimelockController(payable(_executor())).getMinDelay();
        console.log("Scheduled for execution at:", p.executeAfter);
    }

    function executeAdvancedProposal(uint256 proposalId) public {
        Proposal storage p = proposals[proposalId];
        require(p.queued, "Proposal not queued");
        require(block.timestamp >= p.executeAfter, "Timelock not expired");
        require(!p.executed, "Already executed");
        require(vetoSignatures[proposalId] < 3, "Vetoed by multisig");

        console.log("Executing proposal:", proposalId);
        console.log("Target contract:", p.targetContract);
        console.log("Function selector:", uint32(p.functionSelector));

        bytes32 salt = keccak256(abi.encode(proposalId));
        bytes memory callData = abi.encodePacked(
            p.functionSelector,
            p.encodedParams
        );

        console.log("Executing through timelock...");
        TimelockController timelock = TimelockController(payable(_executor()));
        bytes32 operationId = timelock.hashOperation(
            p.targetContract,
            0,
            callData,
            bytes32(0),
            salt
        );

        require(timelock.isOperationReady(operationId), "Operation not ready");
        timelock.execute(p.targetContract, 0, callData, bytes32(0), salt);

        p.executed = true;
        emit AdvancedProposalExecuted(proposalId);
    }

    function proposalSnapshot(
        uint256 proposalId
    ) public view override(IGovernor, Governor) returns (uint256) {
        return super.proposalSnapshot(proposalId);
    }

    function proposalDeadline(
        uint256 proposalId
    ) public view override(IGovernor, Governor) returns (uint256) {
        return super.proposalDeadline(proposalId);
    }

    function proposalEta(
        uint256 proposalId
    ) public view override returns (uint256) {
        return super.proposalEta(proposalId);
    }

    // --- Voting Token Reward System Additions ---
    uint256 public quorumPercentage = 1; // 1 = 0.01% (for tests)
    event QuorumPercentageChanged(uint256 newBasisPoints);
    event SetQuorumAttempt(uint256 newBasisPoints, address sender);
    bool public bootstrapMode = true;
    uint256 public bootstrapQuorum = 100; // Fixed quorum for first proposal
    event BootstrapModeDisabled();

    function disableBootstrapMode() external onlyGovernance {
        bootstrapMode = false;
        emit BootstrapModeDisabled();
    }

    function setQuorumPercentage(
        uint256 newBasisPoints
    ) external onlyDAOProposal {
        console.log("setQuorumPercentage called by", msg.sender);
        emit SetQuorumAttempt(newBasisPoints, msg.sender);
        require(newBasisPoints > 0, "Quorum must be > 0");
        require(newBasisPoints <= 10000, "Quorum must be <= 10000");
        quorumPercentage = newBasisPoints;
        emit QuorumPercentageChanged(newBasisPoints);
    }

    enum ActionType {
        LEND,
        BORROW,
        REPAY
    }

    // --- Reputation System ---
    mapping(address => int256) public reputation;
    event ReputationChanged(
        address indexed user,
        int256 newReputation,
        int256 delta
    );

    function getReputation(address user) public view returns (int256) {
        return reputation[user];
    }

    uint256 public lendMultiplier = 1.5e18;
    uint256 public borrowMultiplier = 0.7e18;
    uint256 public repayMultiplier = 1.0e18;

    mapping(address => bool) public allowedContracts;
    mapping(address => address) public priceFeeds; // asset => price feed
    mapping(address => address) public fallbackPriceFeeds; // asset => fallback price feed

    event MultipliersUpdated(uint256 lend, uint256 borrow, uint256 repay);
    event TokensGranted(
        address indexed user,
        uint256 tokens,
        ActionType action,
        address asset,
        uint256 amount,
        uint256 usdValue
    );
    event AllowedContractSet(address indexed contractAddr, bool allowed);
    event PriceFeedSet(address indexed asset, address indexed feed);
    event FallbackPriceFeedSet(address indexed asset, address indexed feed);

    modifier onlyDAOProposal() {
        require(
            _msgSender() == address(this) || _msgSender() == _executor(),
            "Only DAO via proposal or timelock"
        );
        _;
    }
    modifier onlyAllowedContracts() {
        require(allowedContracts[msg.sender], "Not allowed");
        _;
    }

    function setMultipliers(
        uint256 lend,
        uint256 borrow,
        uint256 repay
    ) public onlyDAOProposal {
        require(lend <= 2e18 && lend >= 1e18, "Lend multiplier out of bounds");
        require(
            borrow <= 1e18 && borrow >= 0.5e18,
            "Borrow multiplier out of bounds"
        );
        require(
            repay <= 1.5e18 && repay >= 0.5e18,
            "Repay multiplier out of bounds"
        );
        lendMultiplier = lend;
        borrowMultiplier = borrow;
        repayMultiplier = repay;
        emit MultipliersUpdated(lend, borrow, repay);
    }

    function setAllowedContract(
        address contractAddr,
        bool allowed
    ) public onlyDAOProposal {
        allowedContracts[contractAddr] = allowed;
        emit AllowedContractSet(contractAddr, allowed);
    }

    function setPriceFeed(address asset, address feed) public onlyDAOProposal {
        priceFeeds[asset] = feed;
        emit PriceFeedSet(asset, feed);
    }

    function setFallbackPriceFeed(
        address asset,
        address feed
    ) public onlyDAOProposal {
        fallbackPriceFeeds[asset] = feed;
        emit FallbackPriceFeedSet(asset, feed);
    }

    function grantTokens(
        address user,
        address asset,
        uint256 amount,
        ActionType action
    ) external onlyAllowedContracts {
        address feed = priceFeeds[asset];
        require(feed != address(0), "No price feed for asset");
        (, int256 price, , , ) = AggregatorV3Interface(feed).latestRoundData();
        if (price <= 0 && fallbackPriceFeeds[asset] != address(0)) {
            feed = fallbackPriceFeeds[asset];
            (, price, , , ) = AggregatorV3Interface(feed).latestRoundData();
        }
        require(price > 0, "Invalid price");
        uint8 decimals = AggregatorV3Interface(feed).decimals();
        uint256 usdValue = (amount * uint256(price)) / (10 ** decimals);
        uint256 multiplier = action == ActionType.LEND
            ? lendMultiplier
            : action == ActionType.BORROW
            ? borrowMultiplier
            : repayMultiplier;
        uint256 tokens = (sqrt(usdValue) * multiplier) / (10 * 1e18);
        if (tokens > 1000) {
            tokens = 1000;
        }
        if (tokens > 0) {
            votingToken.mint(user, tokens);
            emit TokensGranted(user, tokens, action, asset, amount, usdValue);
        }
    }

    function sqrt(uint256 x) internal pure returns (uint256 y) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }

    function getVotingPower(address user) public view returns (uint256) {
        return sqrt(votingToken.balanceOf(user));
    }

    // --- Advanced Proposal System Extension ---
    struct Proposal {
        address targetContract;
        bytes4 functionSelector;
        bytes encodedParams;
        uint256 minVotesNeeded;
        uint256 startTime;
        uint256 endTime;
        uint256 executeAfter;
        bool executed;
        uint256 yesVotes;
        uint256 noVotes;
        bool queued;
        mapping(address => bool) hasVoted;
    }

    uint256 public proposalCount;
    mapping(uint256 => Proposal) public proposals;
    mapping(address => bool) public contractWhitelist;
    address[] public emergencyMultisig;
    mapping(uint256 => uint256) public vetoSignatures;

    uint256 public constant QUORUM = 10; // 10%
    uint256 public constant APPROVAL_THRESHOLD = 60; // 60%
    uint256 public constant VOTING_PERIOD = 7 days;
    uint256 public constant EXECUTION_DELAY = 2 days;

    event AdvancedProposalCreated(
        uint256 indexed proposalId,
        address indexed proposer,
        address targetContract,
        bytes4 functionSelector,
        bytes encodedParams,
        uint256 minVotesNeeded,
        uint256 startTime,
        uint256 endTime,
        uint256 executeAfter
    );
    event AdvancedVoteCast(
        uint256 indexed proposalId,
        address indexed voter,
        bool support,
        uint256 votes
    );
    event AdvancedProposalExecuted(uint256 indexed proposalId);
    event AdvancedProposalVetoed(
        uint256 indexed proposalId,
        address indexed vetoer,
        uint256 vetoCount
    );
    event ContractWhitelisted(address indexed contractAddr, bool allowed);
    event EmergencyMultisigSet(address[] signers);

    function proposeAdvanced(
        address targetContract,
        bytes4 functionSelector,
        bytes calldata encodedParams,
        uint256 minVotesNeeded
    ) external {
        require(
            getVotingPower(msg.sender) >=
                (votingToken.nextTokenId() - 1) / 1000,
            "Need 0.1% tokens to propose"
        );
        require(contractWhitelist[targetContract], "Target not whitelisted");
        uint256 start = block.timestamp;
        uint256 end = start + VOTING_PERIOD;
        uint256 exec = end + EXECUTION_DELAY;
        uint256 id = proposalCount++;
        Proposal storage p = proposals[id];
        p.targetContract = targetContract;
        p.functionSelector = functionSelector;
        p.encodedParams = encodedParams;
        p.minVotesNeeded = minVotesNeeded;
        p.startTime = start;
        p.endTime = end;
        p.executeAfter = exec;
        p.executed = false;
        p.yesVotes = 0;
        p.noVotes = 0;
        emit AdvancedProposalCreated(
            id,
            msg.sender,
            targetContract,
            functionSelector,
            encodedParams,
            minVotesNeeded,
            start,
            end,
            exec
        );
    }

    function voteAdvanced(uint256 proposalId, bool support) external {
        Proposal storage p = proposals[proposalId];
        require(
            block.timestamp >= p.startTime && block.timestamp <= p.endTime,
            "Voting closed"
        );
        require(!p.hasVoted[msg.sender], "Already voted");
        uint256 votes = getVotingPower(msg.sender);
        if (support) p.yesVotes += votes;
        else p.noVotes += votes;
        p.hasVoted[msg.sender] = true;
        emit AdvancedVoteCast(proposalId, msg.sender, support, votes);
    }

    function vetoAdvanced(uint256 proposalId) external {
        require(isMultisig(msg.sender), "Not a multisig signer");
        vetoSignatures[proposalId]++;
        emit AdvancedProposalVetoed(
            proposalId,
            msg.sender,
            vetoSignatures[proposalId]
        );
    }

    function setContractWhitelist(
        address contractAddr,
        bool allowed
    ) public onlyDAOProposal {
        contractWhitelist[contractAddr] = allowed;
        emit ContractWhitelisted(contractAddr, allowed);
    }

    function setEmergencyMultisig(
        address[] calldata signers
    ) public onlyDAOProposal {
        emergencyMultisig = signers;
        emit EmergencyMultisigSet(signers);
    }

    function isMultisig(address signer) public view returns (bool) {
        for (uint256 i = 0; i < emergencyMultisig.length; i++) {
            if (emergencyMultisig[i] == signer) return true;
        }
        return false;
    }

    function penalizeReputation(address user, int256 amount) external {
        require(msg.sender == address(votingToken), "Only VotingToken");
        reputation[user] -= amount;
        emit ReputationChanged(user, reputation[user], -amount);
    }

    function bytes4ToHex(bytes4 data) internal pure returns (string memory) {
        bytes memory hexChars = "0123456789abcdef";
        bytes memory result = new bytes(10);
        result[0] = "0";
        result[1] = "x";
        for (uint i = 0; i < 4; i++) {
            result[2 + i * 2] = hexChars[uint8(data[i]) >> 4];
            result[3 + i * 2] = hexChars[uint8(data[i]) & 0x0f];
        }
        return string(result);
    }

    // Implementation for IERC6372 required functions
    function clock() public view override returns (uint48) {
        // Use block.number as the clock, matching OpenZeppelin's default
        return uint48(block.number);
    }

    function CLOCK_MODE() public view override returns (string memory) {
        // Return the default clock mode string as in OpenZeppelin
        return "mode=blocknumber";
    }
}
