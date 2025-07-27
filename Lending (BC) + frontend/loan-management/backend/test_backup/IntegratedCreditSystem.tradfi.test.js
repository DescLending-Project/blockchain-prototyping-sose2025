const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IntegratedCreditSystem - TradFi Tests", function () {
    let creditSystem, mockRisc0Verifier, mockLiquidityPool;
    let owner, user1, user2, user3;

    beforeEach(async function () {
        [owner, user1, user2, user3] = await ethers.getSigners();

        // Deploy SimpleRISC0Test
        const SimpleRISC0Test = await ethers.getContractFactory("SimpleRISC0Test");
        mockRisc0Verifier = await SimpleRISC0Test.deploy(owner.address);
        await mockRisc0Verifier.waitForDeployment();
        await mockRisc0Verifier.setDemoMode(true);

        // Deploy mock liquidity pool
        const MockLiquidityPool = await ethers.getContractFactory("MockPool");
        mockLiquidityPool = await MockLiquidityPool.deploy();
        await mockLiquidityPool.waitForDeployment();

        // Deploy IntegratedCreditSystem
        const IntegratedCreditSystem = await ethers.getContractFactory("IntegratedCreditSystem");
        creditSystem = await IntegratedCreditSystem.deploy(
            mockRisc0Verifier.address,
            mockLiquidityPool.address
        );
        await creditSystem.waitForDeployment();
    });

    describe("TradFi Proof Submission", function () {
        it("should successfully submit TradFi proof", async function () {
            const mockSeal = ethers.utils.toUtf8Bytes("MOCK_TRADFI_SEAL_750_" + Date.now());
            const mockJournal = ethers.utils.defaultAbiCoder.encode(
                ["tuple(string,string,string,string,string)"],
                [["750", "experian.com", "2024-01-15", "5 years", "excellent"]]
            );

            const tx = await creditSystem.connect(user1).submitTradFiProof(mockSeal, mockJournal);
            const receipt = await tx.wait();

            // Check events
            const verificationEvent = receipt.events?.find(e => e.event === "CreditVerificationCompleted");
            expect(verificationEvent).to.exist;
            expect(verificationEvent.args.user).to.equal(user1.address);
            expect(verificationEvent.args.verificationType).to.equal("TradFi");

            // Check profile update
            const profile = await creditSystem.creditProfiles(user1.address);
            expect(profile.hasTradFiVerification).to.be.true;
            expect(profile.finalCreditScore.toNumber()).to.be.greaterThan(0);
        });

        it("should handle different credit score ranges", async function () {
            const testCases = [
                { score: "850", expectedRange: [80, 100] },
                { score: "750", expectedRange: [70, 90] },
                { score: "650", expectedRange: [50, 70] },
                { score: "550", expectedRange: [30, 50] }
            ];

            for (let i = 0; i < testCases.length; i++) {
                const testCase = testCases[i];
                const testUser = [user1, user2, user3, owner][i];

                const mockSeal = ethers.utils.toUtf8Bytes("MOCK_TRADFI_SEAL_" + testCase.score + "_" + (Date.now() + i));
                const mockJournal = ethers.utils.defaultAbiCoder.encode(
                    ["tuple(string,string,string,string,string)"],
                    [[testCase.score, "experian", "2024-01-15", "5 years", "good"]]
                );

                await creditSystem.connect(testUser).submitTradFiProof(mockSeal, mockJournal);

                const profile = await creditSystem.creditProfiles(testUser.address);
                expect(profile.finalCreditScore.toNumber()).to.be.within(testCase.expectedRange[0], testCase.expectedRange[1]);

                // Reset for next test by expiring verification
                await ethers.provider.send("evm_increaseTime", [31 * 24 * 60 * 60]);
                await ethers.provider.send("evm_mine");
            }
        });

        it("should handle TradFi proof with fallback parsing", async function () {
            const mockSeal = ethers.utils.toUtf8Bytes("MOCK_TRADFI_SEAL_750_" + Date.now());
            const invalidJournal = ethers.utils.toUtf8Bytes("invalid data");

            const tx = await creditSystem.connect(user1).submitTradFiProof(mockSeal, invalidJournal);
            await tx.wait();

            // Should still work with fallback data
            const profile = await creditSystem.creditProfiles(user1.address);
            expect(profile.hasTradFiVerification).to.be.true;
        });

        it("should handle external TradFi journal decoding", async function () {
            const mockJournal = ethers.utils.defaultAbiCoder.encode(
                ["tuple(string,string,string,string,string)"],
                [["750", "experian", "2024-01-15", "5 years", "excellent"]]
            );

            const decoded = await creditSystem.decodeTradFiJournal(mockJournal);
            expect(decoded.creditScore).to.equal("750");
            expect(decoded.dataSource).to.equal("experian");
        });

        it("should emit ProofDataParsed event for TradFi", async function () {
            const mockSeal = ethers.utils.toUtf8Bytes("MOCK_TRADFI_SEAL_750_" + Date.now());
            const mockJournal = ethers.utils.defaultAbiCoder.encode(
                ["tuple(string,string,string,string,string)"],
                [["750", "experian", "2024-01-15", "5 years", "excellent"]]
            );

            const tx = await creditSystem.connect(user1).submitTradFiProof(mockSeal, mockJournal);
            const receipt = await tx.wait();

            const proofDataEvent = receipt.events?.find(e => e.event === "ProofDataParsed");
            expect(proofDataEvent).to.exist;
            expect(proofDataEvent.args.proofType).to.equal("TradFi");
        });

        it("should handle extreme credit scores", async function () {
            const extremeCases = ["300", "850", "0", "999"];

            for (let i = 0; i < extremeCases.length; i++) {
                const score = extremeCases[i];
                const testUser = [user1, user2, user3, owner][i];

                const mockSeal = ethers.utils.toUtf8Bytes("MOCK_TRADFI_SEAL_" + score + "_" + (Date.now() + i));
                const mockJournal = ethers.utils.defaultAbiCoder.encode(
                    ["tuple(string,string,string,string,string)"],
                    [[score, "test", "2024-01-15", "1 year", "test"]]
                );

                await creditSystem.connect(testUser).submitTradFiProof(mockSeal, mockJournal);

                const profile = await creditSystem.creditProfiles(testUser.address);
                expect(profile.hasTradFiVerification).to.be.true;
                expect(profile.finalCreditScore.toNumber()).to.be.at.least(0);
                expect(profile.finalCreditScore.toNumber()).to.be.at.most(100);

                // Reset for next test
                await ethers.provider.send("evm_increaseTime", [31 * 24 * 60 * 60]);
                await ethers.provider.send("evm_mine");
            }
        });
    });
});