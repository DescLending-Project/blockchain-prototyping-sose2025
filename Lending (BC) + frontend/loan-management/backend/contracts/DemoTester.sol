// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IntegratedCreditSystem.sol";
import "./SimpleRISC0Test.sol";
import "./LiquidityPoolV3.sol";

// complete end-to-end demo contract, but it is not necessary for the current workflow of the project, scripts already adjusted for the whole system to work without this contract
contract DemoTester {
    
    // Contract references
    IntegratedCreditSystem public creditSystem;
    SimpleRISC0Test public risc0Verifier;
    LiquidityPoolV3 public liquidityPool;
    
    // mock proof data structures matching real proofs
    struct MockAccountProof {
        address account;
        uint256 nonce;
        uint256 balance;
        bytes32 storageRoot;
        bytes32 codeHash;
        uint256 blockNumber;
        bytes32 stateRoot;
    }
    
    struct MockTradFiProof {
        string creditScore;
        string dataSource;
        string reportDate;
        string accountAge;
        string paymentHistory;
    }
    
    struct MockNestingProof {
        address account;
        uint256 defiScore;
        uint256 tradfiScore;
        uint256 hybridScore;
        uint256 timestamp;
    }
    
    // events for demo tracking
    event DemoStarted(address indexed user);
    event ProofGenerated(address indexed user, string proofType);
    event ProofSubmitted(address indexed user, string proofType, bool success);
    event BorrowAttempted(address indexed user, uint256 amount, bool success);
    event DemoCompleted(address indexed user, bool successful);
    
    constructor(
        address _creditSystem,
        address _risc0Verifier,
        address _liquidityPool
    ) {
        creditSystem = IntegratedCreditSystem(_creditSystem);
        risc0Verifier = SimpleRISC0Test(_risc0Verifier);
        liquidityPool = LiquidityPoolV3(payable(_liquidityPool));
    }
    
    // Run complete demo flow for a user

    function runCompleteDemo(uint256 creditScore, uint256 borrowAmount) 
        external 
    {
        emit DemoStarted(msg.sender);
        
        // generate account proof
        (bytes memory accountSeal, bytes memory accountJournal) = generateAccountProof();
        emit ProofGenerated(msg.sender, "Account");
        
        // generate TradFi Proof
        (bytes memory tradfiSeal, bytes memory tradfiJournal) = generateTradFiProof(creditScore);
        emit ProofGenerated(msg.sender, "TradFi");
        
        // generate Nesting Proof
        (bytes memory nestingSeal, bytes memory nestingJournal) = generateNestingProof(creditScore);
        emit ProofGenerated(msg.sender, "Nesting");
        
        // Submit all proofs to credit system
        try creditSystem.submitAccountProof(accountSeal, accountJournal) {
            emit ProofSubmitted(msg.sender, "Account", true);
        } catch {
            emit ProofSubmitted(msg.sender, "Account", false);
        }
        
        try creditSystem.submitTradFiProof(tradfiSeal, tradfiJournal) {
            emit ProofSubmitted(msg.sender, "TradFi", true);
        } catch {
            emit ProofSubmitted(msg.sender, "TradFi", false);
        }
        
        try creditSystem.submitNestingProof(nestingSeal, nestingJournal) {
            emit ProofSubmitted(msg.sender, "Nesting", true);
        } catch {
            emit ProofSubmitted(msg.sender, "Nesting", false);
        }
        
        // Check if user is eligible to borrow
        bool eligible = creditSystem.isEligibleToBorrow(msg.sender);
        
        // Attempt to borrow if eligible (collateral should be deposited separately)
        if (eligible && borrowAmount > 0) {
            try liquidityPool.borrow(borrowAmount) {
                emit BorrowAttempted(msg.sender, borrowAmount, true);
                emit DemoCompleted(msg.sender, true);
            } catch {
                emit BorrowAttempted(msg.sender, borrowAmount, false);
                emit DemoCompleted(msg.sender, false);
            }
        } else {
            emit DemoCompleted(msg.sender, eligible);
        }
    }
    
    // Generate mock account proof based on your working example
    function generateAccountProof() 
        public 
        view 
        returns (bytes memory seal, bytes memory journalData) 
    {
        // Create mock data similar to real proof
        // BUT use msg.sender instead of the hardcoded address from your real proof
        MockAccountProof memory proof = MockAccountProof({
            account: msg.sender, // This was the issue! Use msg.sender, not hardcoded address
            nonce: 6,
            balance: 367474808980032378259524, // Your actual balance from the proof
            storageRoot: 0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421,
            codeHash: 0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470,
            blockNumber: 22406754,
            stateRoot: 0xe717d168d366b01f6edddc3554333c5b63afaedb34edd210f425b7334c251764
        });
        
        // Encode journal data
        journalData = abi.encode(proof);
        
        // Generate mock seal for demo mode
        seal = abi.encodePacked(
            "MOCK_ACCOUNT_SEAL_",
            msg.sender,
            "_",
            block.timestamp
        );
        
        return (seal, journalData);
    }
    
    /// @notice Generate mock TradFi proof for demo
    function generateTradFiProof(uint256 creditScore) 
        public 
        view 
        returns (bytes memory seal, bytes memory journalData) 
    {
        require(creditScore >= 300 && creditScore <= 850, "Invalid credit score range");
        
        MockTradFiProof memory proof = MockTradFiProof({
            creditScore: _uint2str(creditScore),
            dataSource: "experian.com",
            reportDate: "2024-01-15",
            accountAge: "5 years",
            paymentHistory: creditScore >= 700 ? "Excellent" : creditScore >= 650 ? "Good" : "Fair"
        });
        
        journalData = abi.encode(proof);
        
        seal = abi.encodePacked(
            "MOCK_TRADFI_SEAL_",
            creditScore,
            "_",
            block.timestamp
        );
        
        return (seal, journalData);
    }
    
    /// @notice Generate mock nesting proof combining both verifications
    function generateNestingProof(uint256 tradfiCreditScore) 
        public 
        view 
        returns (bytes memory seal, bytes memory journalData) 
    {
        // Convert TradFi score to 0-100 scale
        uint256 tradfiScore = _mapCreditScore(tradfiCreditScore);
        
        // Generate DeFi score based on account activity (mock)
        uint256 defiScore = 75; // Good DeFi activity score
        
        // Calculate hybrid score (weighted average)
        uint256 hybridScore = (defiScore * 40 + tradfiScore * 60) / 100;
        
        MockNestingProof memory proof = MockNestingProof({
            account: msg.sender,
            defiScore: defiScore,
            tradfiScore: tradfiScore,
            hybridScore: hybridScore,
            timestamp: block.timestamp
        });
        
        journalData = abi.encode(proof);
        
        seal = abi.encodePacked(
            "MOCK_NESTING_SEAL_",
            msg.sender,
            "_",
            hybridScore,
            "_",
            block.timestamp
        );
        
        return (seal, journalData);
    }
    
    /// @notice Map credit score (300-850) to 0-100 scale
    function _mapCreditScore(uint256 creditScore) internal pure returns (uint256) {
        if (creditScore >= 800) return 95;      // Excellent (800-850)
        if (creditScore >= 750) return 85;      // Very Good (750-799)
        if (creditScore >= 700) return 75;      // Good (700-749)
        if (creditScore >= 650) return 65;      // Fair (650-699)
        if (creditScore >= 600) return 50;      // Poor (600-649)
        return 30;                              // Very Poor (<600)
    }
    
    /// @notice Helper function to convert uint to string
    function _uint2str(uint256 _i) internal pure returns (string memory) {
        if (_i == 0) {
            return "0";
        }
        uint256 j = _i;
        uint256 len;
        while (j != 0) {
            len++;
            j /= 10;
        }
        bytes memory bstr = new bytes(len);
        uint256 k = len;
        while (_i != 0) {
            k = k - 1;
            uint8 temp = (48 + uint8(_i - _i / 10 * 10));
            bytes1 b1 = bytes1(temp);
            bstr[k] = b1;
            _i /= 10;
        }
        return string(bstr);
    }
    
    /// @notice Get user's current credit profile
    function getUserStatus(address user) 
        external 
        view 
        returns (
            bool hasTradFi,
            bool hasAccount,
            bool hasNesting,
            uint256 finalScore,
            bool isEligible
        ) 
    {
        (
            bool tradFi,
            bool account, 
            bool nesting,
            uint256 score,
            bool eligible,
            uint256 lastUpdate // This extra return value was causing the mismatch
        ) = creditSystem.getUserCreditProfile(user);
        
        return (tradFi, account, nesting, score, eligible);
    }
    
    /// @notice Check demo readiness
    function isDemoReady() external view returns (bool) {
        return risc0Verifier.isDemoMode();
    }
    
    /// @notice Enable demo mode on risc0 verifier (admin only)
    function enableDemoMode() external {
        // This should be called by the owner of SimpleRISC0Test
        // For demo: risc0Verifier.setDemoMode(true);
    }
}