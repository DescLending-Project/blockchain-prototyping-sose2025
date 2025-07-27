const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IntegratedCreditSystem - Account Tests", function () {
    let creditSystem, mockRisc0Verifier, mockLiquidityPool;
    let owner, user1, user2, user3;
    let mockAccountProofData;

    beforeEach(async function () {
        [owner, user1, user2, user3] = await ethers.getSigners();

        // Deploy mock contracts
        const MockRiscZeroVerifier = await ethers.getContractFactory("MockRiscZeroVerifier");
        mockRisc0Verifier = await MockRiscZeroVerifier.deploy();
        await mockRisc0Verifier.deployed();

        const MockLiquidityPool = await ethers.getContractFactory("MockLiquidityPool");
        mockLiquidityPool = await MockLiquidityPool.deploy();
        await mockLiquidityPool.deployed();

        // Deploy IntegratedCreditSystem
        const IntegratedCreditSystem = await ethers.getContractFactory("IntegratedCreditSystem");
        creditSystem = await IntegratedCreditSystem.deploy(
            mockRisc0Verifier.address,
            mockLiquidityPool.address
        );
        await creditSystem.deployed();

        // Mock account proof data
        mockAccountProofData = {
            account: user1.address,
            nonce: 100,
            balance: ethers.utils.parseEther("1"),
            storageRoot: ethers.utils.keccak256("0x1234"),
            codeHash: ethers.utils.keccak256("0x5678"),
            blockNumber: 12345,
            stateRoot: ethers.utils.keccak256("0x9abc")
        };
    });

    describe("Account Proof Submission", function () {
        it("should reject account proof with wrong account address", async function () {
            const mockSeal = ethers.utils.toUtf8Bytes("MOCK_ACCOUNT_SEAL_WRONG");
            const mockJournal = ethers.utils.defaultAbiCoder.encode(
                ["tuple(address,uint256,uint256,bytes32,bytes32,uint256,bytes32)"],
                [[user2.address, 100, ethers.utils.parseEther("1"),
                mockAccountProofData.storageRoot, mockAccountProofData.codeHash,
                    12345, mockAccountProofData.stateRoot]]
            );

            await expect(
                creditSystem.connect(user1).submitAccountProof(mockSeal, mockJournal)
            ).to.be.revertedWith("Account mismatch");
        });

        it("should successfully submit valid account proof", async function () {
            const mockSeal = ethers.utils.toUtf8Bytes("MOCK_ACCOUNT_SEAL_VALID");
            const mockJournal = ethers.utils.defaultAbiCoder.encode(
                ["tuple(address,uint256,uint256,bytes32,bytes32,uint256,bytes32)"],
                [[user1.address, 100, ethers.utils.parseEther("1"),
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
                { nonce: 10, balance: ethers.utils.parseEther("0.1"), expectedMin: 20 },
                { nonce: 100, balance: ethers.utils.parseEther("1"), expectedMin: 40 },
                { nonce: 1000, balance: ethers.utils.parseEther("10"), expectedMin: 60 }
            ];

            for (let i = 0; i < testCases.length; i++) {
                const testCase = testCases[i];
                const testUser = [user1, user2, user3][i];

                const mockSeal = ethers.utils.toUtf8Bytes("MOCK_ACCOUNT_SEAL_" + i + "_" + Date.now());
                const mockJournal = ethers.utils.defaultAbiCoder.encode(
                    ["tuple(address,uint256,uint256,bytes32,bytes32,uint256,bytes32)"],
                    [[testUser.address, testCase.nonce, testCase.balance,
                    mockAccountProofData.storageRoot, mockAccountProofData.codeHash,
                        12345, mockAccountProofData.stateRoot]]
                );

                await creditSystem.connect(testUser).submitAccountProof(mockSeal, mockJournal);

                const profile = await creditSystem.creditProfiles(testUser.address);
                expect(profile.finalCreditScore.toNumber()).to.be.at.least(testCase.expectedMin);
            }
        });

        it("should handle extreme balance values", async function () {
            const extremeSeal = ethers.utils.toUtf8Bytes("MOCK_ACCOUNT_SEAL_EXTREME_" + Date.now());
            const extremeJournal = ethers.utils.defaultAbiCoder.encode(
                ["tuple(address,uint256,uint256,bytes32,bytes32,uint256,bytes32)"],
                [[user1.address, 1000000, ethers.utils.parseEther("1000000"),
                ethers.utils.keccak256("0x1234"), ethers.utils.keccak256("0x5678"),
                    12345, ethers.utils.keccak256("0x9abc")]]
            );

            const tx = await creditSystem.connect(user1).submitAccountProof(extremeSeal, extremeJournal);
            await tx.wait();

            const profile = await creditSystem.creditProfiles(user1.address);
            expect(profile.hasAccountVerification).to.be.true;
            expect(profile.accountScore.toNumber()).to.be.greaterThan(0);
        });

        it("should emit events on successful submission", async function () {
            const mockSeal = ethers.utils.toUtf8Bytes("MOCK_ACCOUNT_SEAL_EVENT");
            const mockJournal = ethers.utils.defaultAbiCoder.encode(
                ["tuple(address,uint256,uint256,bytes32,bytes32,uint256,bytes32)"],
                [[user1.address, 100, ethers.utils.parseEther("1"),
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
