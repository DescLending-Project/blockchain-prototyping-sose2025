const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IntegratedCreditSystem - Account Tests", function() {
    let creditSystem, mockRisc0Verifier, mockLiquidityPool;
    let owner, user1, user2, user3;
    let mockAccountProofData;

    beforeEach(async function () {
        [owner, user1, user2, user3] = await ethers.getSigners();

        // Deploy mock contracts
        const MockRiscZeroVerifier = await ethers.getContractFactory("MockRiscZeroVerifier");
        mockRisc0Verifier = await MockRiscZeroVerifier.deploy();
        await mockRisc0Verifier.waitForDeployment();

        const MockLiquidityPool = await ethers.getContractFactory("MockLiquidityPool");
        mockLiquidityPool = await MockLiquidityPool.deploy();
        await mockLiquidityPool.waitForDeployment();

        // Deploy IntegratedCreditSystem
        const IntegratedCreditSystem = await ethers.getContractFactory("IntegratedCreditSystem");
        creditSystem = await IntegratedCreditSystem.deploy(
            await mockRisc0Verifier.getAddress(),
            await mockLiquidityPool.getAddress()
        );
        await creditSystem.waitForDeployment();

        // Mock account proof data
        mockAccountProofData = {
            account: user1.address,
            nonce: 100,
            balance: ethers.parseEther("1"),
            storageRoot: ethers.keccak256("0x1234"),
            codeHash: ethers.keccak256("0x5678"),
            blockNumber: 12345,
            stateRoot: ethers.keccak256("0x9abc")
        };
    });

    describe("Account Proof Submission", function() {
        it("should reject account proof with wrong account address", async function () {
            const mockSeal = ethers.toUtf8Bytes("MOCK_ACCOUNT_SEAL_WRONG");
            const mockJournal = ethers.AbiCoder.defaultAbiCoder().encode(
                ["tuple(address,uint256,uint256,bytes32,bytes32,uint256,bytes32)"],
                [[user2.address, 100, ethers.parseEther("1"),
                mockAccountProofData.storageRoot, mockAccountProofData.codeHash,
                    12345, mockAccountProofData.stateRoot]]
            );

            await expect(
                creditSystem.connect(user1).submitAccountProof(mockSeal, mockJournal)
            ).to.be.revertedWith("Account mismatch");
        });

        it("should successfully submit valid account proof", async function () {
            const mockSeal = ethers.toUtf8Bytes("MOCK_ACCOUNT_SEAL_VALID");
            const mockJournal = ethers.AbiCoder.defaultAbiCoder().encode(
                ["tuple(address,uint256,uint256,bytes32,bytes32,uint256,bytes32)"],
                [[user1.address, 100, ethers.parseEther("1"),
                mockAccountProofData.storageRoot, mockAccountProofData.codeHash,
                    12345, mockAccountProofData.stateRoot]]
            );

            await expect(
                creditSystem.connect(user1).submitAccountProof(mockSeal, mockJournal)
            ).to.not.be.reverted;

            const profile = await creditSystem.creditProfiles(user1.address);
            expect(profile.hasAccountVerification).to.be.true;
        });

        it("should calculate different scores based on account data", async function () {
            const testCases = [
                { nonce: 10, balance: ethers.parseEther("0.1"), expectedMin: 20 },
                { nonce: 100, balance: ethers.parseEther("1"), expectedMin: 40 },
                { nonce: 1000, balance: ethers.parseEther("10"), expectedMin: 60 }
            ];

            for (let i = 0; i < testCases.length; i++) {
                const testCase = testCases[i];
                const testUser = [user1, user2, user3][i];

                const mockSeal = ethers.toUtf8Bytes("MOCK_ACCOUNT_SEAL_" + i + "_" + Date.now());
                const mockJournal = ethers.AbiCoder.defaultAbiCoder().encode(
                    ["tuple(address,uint256,uint256,bytes32,bytes32,uint256,bytes32)"],
                    [[testUser.address, testCase.nonce, testCase.balance,
                    mockAccountProofData.storageRoot, mockAccountProofData.codeHash,
                        12345, mockAccountProofData.stateRoot]]
                );

                await creditSystem.connect(testUser).submitAccountProof(mockSeal, mockJournal);

                const profile = await creditSystem.creditProfiles(testUser.address);
                expect(profile.finalCreditScore).to.be.at.least(testCase.expectedMin);
            }
        });

        it("should handle extreme balance values", async function () {
            const extremeSeal = ethers.toUtf8Bytes("MOCK_ACCOUNT_SEAL_EXTREME_" + Date.now());
            const extremeJournal = ethers.AbiCoder.defaultAbiCoder().encode(
                ["tuple(address,uint256,uint256,bytes32,bytes32,uint256,bytes32)"],
                [[user1.address, 1000000, ethers.parseEther("1000000"),
                ethers.keccak256("0x1234"), ethers.keccak256("0x5678"),
                    12345, ethers.keccak256("0x9abc")]]
            );

            const tx = await creditSystem.connect(user1).submitAccountProof(extremeSeal, extremeJournal);
            await tx.wait();

            const profile = await creditSystem.creditProfiles(user1.address);
            expect(profile.hasAccountVerification).to.be.true;
            expect(profile.accountScore).to.be.greaterThan(0);
        });

        it("should emit events on successful submission", async function () {
            const mockSeal = ethers.toUtf8Bytes("MOCK_ACCOUNT_SEAL_EVENT");
            const mockJournal = ethers.AbiCoder.defaultAbiCoder().encode(
                ["tuple(address,uint256,uint256,bytes32,bytes32,uint256,bytes32)"],
                [[user1.address, 100, ethers.parseEther("1"),
                mockAccountProofData.storageRoot, mockAccountProofData.codeHash,
                    12345, mockAccountProofData.stateRoot]]
            );

            await expect(
                creditSystem.connect(user1).submitAccountProof(mockSeal, mockJournal)
            ).to.emit(creditSystem, "CreditVerificationCompleted")
                .and.to.emit(creditSystem, "ProofDataParsed");
        });
    });
});