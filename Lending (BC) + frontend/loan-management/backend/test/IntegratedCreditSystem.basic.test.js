const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IntegratedCreditSystem - Basic Tests", function() {
    let creditSystem, mockRisc0Verifier, mockLiquidityPool;
    let owner, user1, user2, user3;

    // Mock data structures
    const mockAccountProofData = {
        storageRoot: "0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421",
        codeHash: "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
        stateRoot: "0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421"
    };

    beforeEach(async function () {
        [owner, user1, user2, user3] = await ethers.getSigners();

        // Deploy SimpleRISC0Test instead of MockRiscZeroVerifier
        const SimpleRISC0Test = await ethers.getContractFactory("SimpleRISC0Test");
        mockRisc0Verifier = await SimpleRISC0Test.deploy(owner.address);
        await mockRisc0Verifier.waitForDeployment();

        // Enable demo mode to accept mock proofs
        await mockRisc0Verifier.setDemoMode(true);

        // Deploy mock liquidity pool with timelock functionality
        const MockLiquidityPool = await ethers.getContractFactory("MockPool");
        mockLiquidityPool = await MockLiquidityPool.deploy();
        await mockLiquidityPool.waitForDeployment();

        // Deploy IntegratedCreditSystem
        const IntegratedCreditSystem = await ethers.getContractFactory("IntegratedCreditSystem");
        creditSystem = await IntegratedCreditSystem.deploy(
            await mockRisc0Verifier.getAddress(),
            await mockLiquidityPool.getAddress()
        );
        await creditSystem.waitForDeployment();
    });

    describe("Constructor and Initial State", function() {
        it("should initialize with correct parameters", async function () {
            expect(await creditSystem.risc0Verifier()).to.equal(await mockRisc0Verifier.getAddress());
            expect(await creditSystem.liquidityPool()).to.equal(await mockLiquidityPool.getAddress());
            expect(await creditSystem.VERIFICATION_VALIDITY_PERIOD()).to.equal(BigInt(30 * 24 * 60 * 60));
            expect(await creditSystem.MIN_CREDIT_SCORE()).to.equal(35n);
        });

        it("should have correct initial scoring weights", async function () {
            expect(await creditSystem.tradFiWeight()).to.equal(50n);
            expect(await creditSystem.accountWeight()).to.equal(30n);
            expect(await creditSystem.nestingWeight()).to.equal(20n);
        });

        it("should have empty initial credit profiles", async function () {
            const profile = await creditSystem.creditProfiles(user1.address);
            expect(profile.hasTradFiVerification).to.be.false;
            expect(profile.hasAccountVerification).to.be.false;
            expect(profile.hasNestingVerification).to.be.false;
            expect(profile.finalCreditScore).to.equal(0n);
        });
    });

    describe("Utility Functions", function() {
        it("should return minimum credit score", async function () {
            const minScore = await creditSystem.getMinimumCreditScore();
            expect(minScore).to.equal(35n);
        });

        it("should check borrowing eligibility for new users", async function () {
            const isEligible = await creditSystem.isEligibleToBorrow(user1.address);
            expect(isEligible).to.be.false;
        });

        it("should get empty user credit profile", async function () {
            const profile = await creditSystem.getUserCreditProfile(user1.address);
            expect(profile.hasTradFi).to.be.false;
            expect(profile.hasAccount).to.be.false;
            expect(profile.hasNesting).to.be.false;
            expect(profile.finalScore).to.equal(0n);
            expect(profile.isEligible).to.be.false;
        });

        it("should get detailed verification status", async function () {
            const status = await creditSystem.getDetailedVerificationStatus(user1.address);
            expect(status.tradFiScore).to.equal(0n);
            expect(status.accountScore).to.equal(0n);
            expect(status.hybridScore).to.equal(0n);
        });
    });
});