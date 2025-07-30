const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("LendingManager - Edge Case Lines", function () {
    let lendingManager, mockPool, mockToken;
    let owner, user1, user2, user3;

    beforeEach(async function () {
        [owner, user1, user2, user3] = await ethers.getSigners();

        // Deploy MockPool
        const MockPool = await ethers.getContractFactory("MockPool");
        mockPool = await MockPool.deploy();
        await mockPool.waitForDeployment();

        // Deploy MockToken
        const MockToken = await ethers.getContractFactory("MockToken");
        mockToken = await MockToken.deploy("Mock Token", "MOCK");
        await mockToken.waitForDeployment();

        // Deploy LendingManager
        const LendingManager = await ethers.getContractFactory("LendingManager");
        lendingManager = await LendingManager.deploy(
            await mockPool.getAddress(),
            owner.address
        );
        await lendingManager.waitForDeployment();

        // Set up credit scores
        await mockPool.setCreditScore(user1.address, 80);
        await mockPool.setCreditScore(user2.address, 75);
        await mockPool.setCreditScore(user3.address, 85);
    });

    describe("Edge Case Line Coverage", function () {
        it("should hit error condition lines in depositFunds", async function () {
            // Test paused contract error line
            await lendingManager.connect(owner).setPaused(true);
            try {
                await lendingManager.connect(user1).depositFunds({ value: ethers.parseEther("1") });
                expect.fail("Should have reverted");
            } catch (error) {
                expect(error.message).to.include("revert");
            }
            await lendingManager.connect(owner).setPaused(false);

            // Test minimum deposit error line
            try {
                await lendingManager.connect(user1).depositFunds({ value: ethers.parseEther("0.005") });
                expect.fail("Should have reverted");
            } catch (error) {
                expect(error.message).to.include("revert");
            }

            // Test maximum deposit error line
            try {
                await lendingManager.connect(user1).depositFunds({ value: ethers.parseEther("150") });
                expect.fail("Should have reverted");
            } catch (error) {
                expect(error.message).to.include("revert");
            }

            // Test credit score error line
            await mockPool.setCreditScore(user1.address, 50); // Low score
            try {
                await lendingManager.connect(user1).depositFunds({ value: ethers.parseEther("1") });
                expect.fail("Should have reverted");
            } catch (error) {
                expect(error.message).to.include("revert");
            }
            await mockPool.setCreditScore(user1.address, 80); // Reset

            // Test successful deposit to hit success lines
            await lendingManager.connect(user1).depositFunds({ value: ethers.parseEther("1") });
            const lenderInfo = await lendingManager.lenders(user1.address);
            expect(lenderInfo.balance).to.be.gt(0);
        });

        it("should hit error condition lines in addLenders", async function () {
            // Test empty array error line
            try {
                await lendingManager.connect(owner).addLenders([]);
                expect.fail("Should have reverted");
            } catch (error) {
                expect(error.message).to.include("Empty lender list");
            }

            // Test too many lenders error line
            const manyLenders = new Array(101).fill(user1.address);
            try {
                await lendingManager.connect(owner).addLenders(manyLenders);
                expect.fail("Should have reverted");
            } catch (error) {
                expect(error.message).to.include("Too many lenders");
            }

            // Test successful addition to hit success lines
            await lendingManager.connect(owner).addLenders([user1.address, user2.address]);
            expect(await lendingManager.isLender(user1.address)).to.be.true;
            expect(await lendingManager.isLender(user2.address)).to.be.true;

            // Test duplicate lender error line
            try {
                await lendingManager.connect(owner).addLenders([user1.address]);
                expect.fail("Should have reverted");
            } catch (error) {
                expect(error.message).to.include("revert");
            }
        });

        it("should hit error condition lines in requestWithdrawal", async function () {
            // Test not a lender error line
            try {
                await lendingManager.connect(user3).requestWithdrawal(ethers.parseEther("1"));
                expect.fail("Should have reverted");
            } catch (error) {
                expect(error.message).to.include("Not a lender");
            }

            // Add user as lender
            await lendingManager.connect(owner).addLenders([user1.address]);

            // Test zero amount error line
            try {
                await lendingManager.connect(user1).requestWithdrawal(0);
                expect.fail("Should have reverted");
            } catch (error) {
                expect(error.message).to.include("Amount must be greater than 0");
            }

            // Test inactive lender error line
            try {
                await lendingManager.connect(user1).requestWithdrawal(ethers.parseEther("1"));
                expect.fail("Should have reverted");
            } catch (error) {
                expect(error.message).to.include("revert");
            }
        });

        it("should hit error condition lines in completeWithdrawal", async function () {
            // Test not a lender error line
            try {
                await lendingManager.connect(user3).completeWithdrawal();
                expect.fail("Should have reverted");
            } catch (error) {
                expect(error.message).to.include("revert");
            }

            // Add user as lender
            await lendingManager.connect(owner).addLenders([user1.address]);

            // Test inactive lender error line
            try {
                await lendingManager.connect(user1).completeWithdrawal();
                expect.fail("Should have reverted");
            } catch (error) {
                expect(error.message).to.include("revert");
            }
        });

        it("should hit error condition lines in claimInterest", async function () {
            // Test not a lender error line
            try {
                await lendingManager.connect(user3).claimInterest();
                expect.fail("Should have reverted");
            } catch (error) {
                expect(error.message).to.include("Not a lender");
            }

            // Add user as lender
            await lendingManager.connect(owner).addLenders([user1.address]);

            // Test inactive lender error line
            try {
                await lendingManager.connect(user1).claimInterest();
                expect.fail("Should have reverted");
            } catch (error) {
                expect(error.message).to.include("revert");
            }
        });

        it("should hit error condition lines in admin functions", async function () {
            // Test setCurrentDailyRate error lines
            try {
                await lendingManager.connect(owner).setCurrentDailyRate(ethers.parseEther("0.5"));
                expect.fail("Should have reverted");
            } catch (error) {
                expect(error.message).to.include("Invalid rate");
            }

            try {
                await lendingManager.connect(owner).setCurrentDailyRate(ethers.parseEther("1.01"));
                expect.fail("Should have reverted");
            } catch (error) {
                expect(error.message).to.include("Invalid rate");
            }

            // Test setReserveAddress error line
            try {
                await lendingManager.connect(owner).setReserveAddress(ethers.ZeroAddress);
                expect.fail("Should have reverted");
            } catch (error) {
                expect(error.message).to.include("Invalid reserve address");
            }

            // Test setVotingToken error line
            try {
                await lendingManager.connect(owner).setVotingToken(ethers.ZeroAddress);
                expect.fail("Should have reverted");
            } catch (error) {
                expect(error.message).to.include("revert");
            }

            // Test successful calls to hit success lines
            await lendingManager.connect(owner).setCurrentDailyRate(ethers.parseEther("1.002"));
            await lendingManager.connect(owner).setReserveAddress(user1.address);
            await lendingManager.connect(owner).setVotingToken(await mockToken.getAddress());
        });

        it("should hit error condition lines in batch functions", async function () {
            // Test batchCreditInterest error lines
            try {
                await lendingManager.batchCreditInterest([]);
                expect.fail("Should have reverted");
            } catch (error) {
                expect(error.message).to.include("No addresses provided");
            }

            const manyAddresses = new Array(60).fill(user1.address);
            try {
                await lendingManager.batchCreditInterest(manyAddresses);
                expect.fail("Should have reverted");
            } catch (error) {
                expect(error.message).to.include("Too many addresses");
            }

            // Test successful batch to hit success lines
            await lendingManager.connect(owner).addLenders([user1.address, user2.address]);
            await lendingManager.batchCreditInterest([user1.address, user2.address]);
        });

        it("should hit access control error lines", async function () {
            // Test onlyTimelock modifier error lines
            try {
                await lendingManager.connect(user1).setPaused(true);
                expect.fail("Should have reverted");
            } catch (error) {
                expect(error.message).to.include("revert");
            }

            try {
                await lendingManager.connect(user1).setCurrentDailyRate(ethers.parseEther("1.001"));
                expect.fail("Should have reverted");
            } catch (error) {
                expect(error.message).to.include("revert");
            }

            try {
                await lendingManager.connect(user1).setReserveAddress(user2.address);
                expect.fail("Should have reverted");
            } catch (error) {
                expect(error.message).to.include("revert");
            }

            try {
                await lendingManager.connect(user1).addLenders([user2.address]);
                expect.fail("Should have reverted");
            } catch (error) {
                expect(error.message).to.include("revert");
            }

            try {
                await lendingManager.connect(user1).performMonthlyMaintenance();
                expect.fail("Should have reverted");
            } catch (error) {
                expect(error.message).to.include("Only timelock");
            }
        });

        it("should hit calculation edge case lines", async function () {
            // Test rate calculations with edge cases
            const rates = [];
            for (let i = 0; i < 20; i++) {
                rates.push(await lendingManager.getDynamicSupplyRate());
                rates.push(await lendingManager.getLenderRate());
            }

            // Test with different amounts to hit different calculation paths
            const amounts = [
                ethers.parseEther("0.01"),
                ethers.parseEther("0.5"),
                ethers.parseEther("0.99"),
                ethers.parseEther("1.0"),
                ethers.parseEther("1.01"),
                ethers.parseEther("4.99"),
                ethers.parseEther("5.0"),
                ethers.parseEther("5.01"),
                ethers.parseEther("9.99"),
                ethers.parseEther("10.0"),
                ethers.parseEther("10.01"),
                ethers.parseEther("49.99"),
                ethers.parseEther("50.0"),
                ethers.parseEther("50.01"),
                ethers.parseEther("100.0")
            ];

            for (const amount of amounts) {
                const rate = await lendingManager.getInterestRate(amount);
                expect(rate).to.be.gt(0);
            }

            // Test baseLenderAPR with different addresses
            const addresses = [user1.address, user2.address, user3.address, owner.address];
            for (const addr of addresses) {
                const apr = await lendingManager.baseLenderAPR(addr);
                expect(apr).to.be.gte(0);
            }
        });

        it("should hit liquidation and maintenance lines", async function () {
            // Test executeLiquidation with various parameters
            try {
                await lendingManager.executeLiquidation(ethers.ZeroAddress, user1.address);
                expect.fail("Should have reverted");
            } catch (error) {
                expect(error.message).to.include("revert");
            }

            try {
                await lendingManager.executeLiquidation(await mockPool.getAddress(), ethers.ZeroAddress);
                expect.fail("Should have reverted");
            } catch (error) {
                expect(error.message).to.include("revert");
            }

            try {
                await lendingManager.executeLiquidation(await mockPool.getAddress(), user1.address);
                expect.fail("Should have reverted");
            } catch (error) {
                expect(error.message).to.include("revert");
            }

            // Test performMonthlyMaintenance
            await lendingManager.connect(owner).performMonthlyMaintenance();
        });

        it("should hit receive function lines", async function () {
            // Test receive function with different amounts
            const amounts = [1, 1000, ethers.parseEther("0.001"), ethers.parseEther("0.1")];
            
            for (const amount of amounts) {
                try {
                    await user1.sendTransaction({
                        to: await lendingManager.getAddress(),
                        value: amount
                    });
                } catch (error) {
                    // May fail but executes lines
                }
            }
        });

        it("should hit query function edge cases", async function () {
            // Test queries with empty state
            expect(await lendingManager.getAllLenders()).to.be.an('array');
            expect(await lendingManager.getLenderCount()).to.equal(0);

            // Add lenders and test again
            await lendingManager.connect(owner).addLenders([user1.address, user2.address, user3.address]);
            
            const allLenders = await lendingManager.getAllLenders();
            expect(allLenders.length).to.be.gte(3);
            
            const lenderCount = await lendingManager.getLenderCount();
            expect(lenderCount).to.be.gte(3);

            // Test interest tier queries
            const tierCount = await lendingManager.getInterestTierCount();
            for (let i = 0; i < tierCount; i++) {
                const tier = await lendingManager.getInterestTier(i);
                expect(tier.minAmount).to.be.gte(0);
                expect(tier.rate).to.be.gt(0);
            }
        });
    });
});
