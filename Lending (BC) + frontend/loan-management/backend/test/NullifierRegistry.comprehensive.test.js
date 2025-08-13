const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("NullifierRegistry - Comprehensive Coverage", function () {
    let nullifierRegistry;
    let admin, user1, user2, user3, consumer, nonConsumer;
    let accounts1, accounts2, accounts3;

    beforeEach(async function () {
        [admin, user1, user2, user3, consumer, nonConsumer] = await ethers.getSigners();

        // Deploy NullifierRegistry
        const NullifierRegistry = await ethers.getContractFactory("NullifierRegistry");
        nullifierRegistry = await upgrades.deployProxy(NullifierRegistry, [admin.address], {
            initializer: "initialize"
        });

        // Setup test accounts arrays
        accounts1 = [user1.address, user2.address];
        accounts2 = [user2.address, user3.address, admin.address];
        accounts3 = [user1.address];

        // Grant NULLIFIER_CONSUMER_ROLE to consumer
        const NULLIFIER_CONSUMER_ROLE = await nullifierRegistry.NULLIFIER_CONSUMER_ROLE();
        await nullifierRegistry.connect(admin).grantRole(NULLIFIER_CONSUMER_ROLE, consumer.address);
    });

    describe("Initialization", function () {
        it("should initialize with correct admin", async function () {
            const DEFAULT_ADMIN_ROLE = await nullifierRegistry.DEFAULT_ADMIN_ROLE();
            expect(await nullifierRegistry.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be.true;
        });

        it("should have correct NULLIFIER_CONSUMER_ROLE", async function () {
            const expectedRole = ethers.keccak256(ethers.toUtf8Bytes("NULLIFIER_CONSUMER_ROLE"));
            expect(await nullifierRegistry.NULLIFIER_CONSUMER_ROLE()).to.equal(expectedRole);
        });

        it("should start with no used nullifiers", async function () {
            const testNullifier = ethers.keccak256(ethers.toUtf8Bytes("test"));
            expect(await nullifierRegistry.isNullifierUsed(testNullifier)).to.be.false;
        });

        it("should start with no selected accounts for users", async function () {
            expect(await nullifierRegistry.hasSelectedAccounts(user1.address)).to.be.false;
            expect(await nullifierRegistry.getUserAccounts(user1.address)).to.deep.equal([]);
        });
    });

    describe("Account Selection", function () {
        it("should allow user to select accounts", async function () {
            await expect(nullifierRegistry.connect(user1).selectAccounts(accounts1))
                .to.emit(nullifierRegistry, "AccountsSelected")
                .withArgs(user1.address, accounts1);

            expect(await nullifierRegistry.hasSelectedAccounts(user1.address)).to.be.true;
            expect(await nullifierRegistry.getUserAccounts(user1.address)).to.deep.equal(accounts1);
        });

        it("should prevent selecting accounts twice", async function () {
            await nullifierRegistry.connect(user1).selectAccounts(accounts1);
            
            await expect(nullifierRegistry.connect(user1).selectAccounts(accounts2))
                .to.be.revertedWith("Accounts already selected");
        });

        it("should reject empty accounts array", async function () {
            await expect(nullifierRegistry.connect(user1).selectAccounts([]))
                .to.be.revertedWith("Invalid number of accounts");
        });

        it("should reject more than 10 accounts", async function () {
            const tooManyAccounts = Array(11).fill(user1.address);
            await expect(nullifierRegistry.connect(user1).selectAccounts(tooManyAccounts))
                .to.be.revertedWith("Invalid number of accounts");
        });

        it("should reject zero address in accounts", async function () {
            const accountsWithZero = [user1.address, ethers.ZeroAddress, user2.address];
            await expect(nullifierRegistry.connect(user1).selectAccounts(accountsWithZero))
                .to.be.revertedWith("Invalid account address");
        });

        it("should handle maximum allowed accounts (10)", async function () {
            const maxAccounts = Array(10).fill().map((_, i) => 
                ethers.getAddress(`0x${'1'.repeat(39)}${i}`)
            );
            
            await expect(nullifierRegistry.connect(user1).selectAccounts(maxAccounts))
                .to.emit(nullifierRegistry, "AccountsSelected")
                .withArgs(user1.address, maxAccounts);

            expect(await nullifierRegistry.getUserAccounts(user1.address)).to.deep.equal(maxAccounts);
        });

        it("should handle single account selection", async function () {
            await nullifierRegistry.connect(user1).selectAccounts(accounts3);
            expect(await nullifierRegistry.getUserAccounts(user1.address)).to.deep.equal(accounts3);
        });

        it("should handle different users selecting different accounts", async function () {
            await nullifierRegistry.connect(user1).selectAccounts(accounts1);
            await nullifierRegistry.connect(user2).selectAccounts(accounts2);

            expect(await nullifierRegistry.getUserAccounts(user1.address)).to.deep.equal(accounts1);
            expect(await nullifierRegistry.getUserAccounts(user2.address)).to.deep.equal(accounts2);
        });
    });

    describe("Nullifier Generation", function () {
        beforeEach(async function () {
            await nullifierRegistry.connect(user1).selectAccounts(accounts1);
        });

        it("should generate nullifier for user with selected accounts", async function () {
            const loanAmount = ethers.parseEther("100");
            const timestamp = Math.floor(Date.now() / 1000);

            const nullifier = await nullifierRegistry.generateNullifier(
                user1.address,
                loanAmount,
                timestamp
            );

            expect(nullifier).to.not.equal(ethers.ZeroHash);
        });

        it("should generate different nullifiers for different parameters", async function () {
            const loanAmount1 = ethers.parseEther("100");
            const loanAmount2 = ethers.parseEther("200");
            const timestamp = Math.floor(Date.now() / 1000);

            const nullifier1 = await nullifierRegistry.generateNullifier(
                user1.address,
                loanAmount1,
                timestamp
            );

            const nullifier2 = await nullifierRegistry.generateNullifier(
                user1.address,
                loanAmount2,
                timestamp
            );

            expect(nullifier1).to.not.equal(nullifier2);
        });

        it("should generate different nullifiers for different timestamps", async function () {
            const loanAmount = ethers.parseEther("100");
            const timestamp1 = Math.floor(Date.now() / 1000);
            const timestamp2 = timestamp1 + 1;

            const nullifier1 = await nullifierRegistry.generateNullifier(
                user1.address,
                loanAmount,
                timestamp1
            );

            const nullifier2 = await nullifierRegistry.generateNullifier(
                user1.address,
                loanAmount,
                timestamp2
            );

            expect(nullifier1).to.not.equal(nullifier2);
        });

        it("should generate different nullifiers for different users", async function () {
            await nullifierRegistry.connect(user2).selectAccounts(accounts2);
            
            const loanAmount = ethers.parseEther("100");
            const timestamp = Math.floor(Date.now() / 1000);

            const nullifier1 = await nullifierRegistry.generateNullifier(
                user1.address,
                loanAmount,
                timestamp
            );

            const nullifier2 = await nullifierRegistry.generateNullifier(
                user2.address,
                loanAmount,
                timestamp
            );

            expect(nullifier1).to.not.equal(nullifier2);
        });

        it("should reject nullifier generation for user without selected accounts", async function () {
            const loanAmount = ethers.parseEther("100");
            const timestamp = Math.floor(Date.now() / 1000);

            await expect(nullifierRegistry.generateNullifier(
                user2.address,
                loanAmount,
                timestamp
            )).to.be.revertedWith("User must select accounts first");
        });

        it("should generate deterministic nullifiers", async function () {
            const loanAmount = ethers.parseEther("100");
            const timestamp = Math.floor(Date.now() / 1000);

            const nullifier1 = await nullifierRegistry.generateNullifier(
                user1.address,
                loanAmount,
                timestamp
            );

            const nullifier2 = await nullifierRegistry.generateNullifier(
                user1.address,
                loanAmount,
                timestamp
            );

            expect(nullifier1).to.equal(nullifier2);
        });
    });

    describe("Nullifier Usage", function () {
        let nullifier;
        const loanAmount = ethers.parseEther("100");
        const timestamp = Math.floor(Date.now() / 1000);

        beforeEach(async function () {
            await nullifierRegistry.connect(user1).selectAccounts(accounts1);
            nullifier = await nullifierRegistry.generateNullifier(
                user1.address,
                loanAmount,
                timestamp
            );
        });

        it("should allow consumer to use nullifier", async function () {
            await expect(nullifierRegistry.connect(consumer).useNullifier(nullifier, user1.address))
                .to.emit(nullifierRegistry, "NullifierUsed")
                .withArgs(nullifier, user1.address, await ethers.provider.getBlock('latest').then(b => b.timestamp + 1));

            expect(await nullifierRegistry.isNullifierUsed(nullifier)).to.be.true;
        });

        it("should reject using nullifier from non-consumer", async function () {
            await expect(nullifierRegistry.connect(nonConsumer).useNullifier(nullifier, user1.address))
                .to.be.reverted; // AccessControl revert
        });

        it("should reject using already used nullifier", async function () {
            await nullifierRegistry.connect(consumer).useNullifier(nullifier, user1.address);
            
            await expect(nullifierRegistry.connect(consumer).useNullifier(nullifier, user1.address))
                .to.be.revertedWith("Nullifier already used");
        });

        it("should reject using nullifier for user without selected accounts", async function () {
            await expect(nullifierRegistry.connect(consumer).useNullifier(nullifier, user2.address))
                .to.be.revertedWith("User has no selected accounts");
        });

        it("should handle multiple different nullifiers", async function () {
            const nullifier2 = await nullifierRegistry.generateNullifier(
                user1.address,
                ethers.parseEther("200"),
                timestamp
            );

            await nullifierRegistry.connect(consumer).useNullifier(nullifier, user1.address);
            await nullifierRegistry.connect(consumer).useNullifier(nullifier2, user1.address);

            expect(await nullifierRegistry.isNullifierUsed(nullifier)).to.be.true;
            expect(await nullifierRegistry.isNullifierUsed(nullifier2)).to.be.true;
        });
    });

    describe("Account Verification", function () {
        beforeEach(async function () {
            await nullifierRegistry.connect(user1).selectAccounts(accounts1);
            await nullifierRegistry.connect(user2).selectAccounts(accounts2);
        });

        it("should verify correct account selection", async function () {
            expect(await nullifierRegistry.verifyAccountSelection(user1.address, accounts1)).to.be.true;
            expect(await nullifierRegistry.verifyAccountSelection(user2.address, accounts2)).to.be.true;
        });

        it("should reject verification for user without selected accounts", async function () {
            expect(await nullifierRegistry.verifyAccountSelection(user3.address, accounts1)).to.be.false;
        });

        it("should reject verification with wrong number of accounts", async function () {
            expect(await nullifierRegistry.verifyAccountSelection(user1.address, accounts2)).to.be.false;
            expect(await nullifierRegistry.verifyAccountSelection(user1.address, [user1.address])).to.be.false;
        });

        it("should reject verification with wrong account addresses", async function () {
            const wrongAccounts = [user3.address, user2.address];
            expect(await nullifierRegistry.verifyAccountSelection(user1.address, wrongAccounts)).to.be.false;
        });

        it("should reject verification with accounts in wrong order", async function () {
            const reversedAccounts = [user2.address, user1.address];
            expect(await nullifierRegistry.verifyAccountSelection(user1.address, reversedAccounts)).to.be.false;
        });

        it("should handle empty arrays correctly", async function () {
            expect(await nullifierRegistry.verifyAccountSelection(user1.address, [])).to.be.false;
        });

        it("should handle single account verification", async function () {
            await nullifierRegistry.connect(user3).selectAccounts(accounts3);
            expect(await nullifierRegistry.verifyAccountSelection(user3.address, accounts3)).to.be.true;
            expect(await nullifierRegistry.verifyAccountSelection(user3.address, [user2.address])).to.be.false;
        });
    });

    describe("View Functions", function () {
        it("should return correct nullifier usage status", async function () {
            const testNullifier = ethers.keccak256(ethers.toUtf8Bytes("test"));
            expect(await nullifierRegistry.isNullifierUsed(testNullifier)).to.be.false;
        });

        it("should return empty array for user without selected accounts", async function () {
            expect(await nullifierRegistry.getUserAccounts(user1.address)).to.deep.equal([]);
        });

        it("should return correct selected accounts", async function () {
            await nullifierRegistry.connect(user1).selectAccounts(accounts1);
            expect(await nullifierRegistry.getUserAccounts(user1.address)).to.deep.equal(accounts1);
        });

        it("should return correct hasSelectedAccounts status", async function () {
            expect(await nullifierRegistry.hasSelectedAccounts(user1.address)).to.be.false;
            await nullifierRegistry.connect(user1).selectAccounts(accounts1);
            expect(await nullifierRegistry.hasSelectedAccounts(user1.address)).to.be.true;
        });
    });

    describe("Access Control", function () {
        it("should allow admin to grant NULLIFIER_CONSUMER_ROLE", async function () {
            const NULLIFIER_CONSUMER_ROLE = await nullifierRegistry.NULLIFIER_CONSUMER_ROLE();
            await nullifierRegistry.connect(admin).grantRole(NULLIFIER_CONSUMER_ROLE, user1.address);
            expect(await nullifierRegistry.hasRole(NULLIFIER_CONSUMER_ROLE, user1.address)).to.be.true;
        });

        it("should allow admin to revoke NULLIFIER_CONSUMER_ROLE", async function () {
            const NULLIFIER_CONSUMER_ROLE = await nullifierRegistry.NULLIFIER_CONSUMER_ROLE();
            await nullifierRegistry.connect(admin).revokeRole(NULLIFIER_CONSUMER_ROLE, consumer.address);
            expect(await nullifierRegistry.hasRole(NULLIFIER_CONSUMER_ROLE, consumer.address)).to.be.false;
        });

        it("should reject role management from non-admin", async function () {
            const NULLIFIER_CONSUMER_ROLE = await nullifierRegistry.NULLIFIER_CONSUMER_ROLE();
            await expect(nullifierRegistry.connect(user1).grantRole(NULLIFIER_CONSUMER_ROLE, user2.address))
                .to.be.reverted; // AccessControl revert
        });
    });

    describe("Edge Cases and Complex Scenarios", function () {
        it("should handle maximum complexity scenario", async function () {
            // Setup multiple users with different account selections
            const maxAccounts = Array(10).fill().map((_, i) => 
                ethers.getAddress(`0x${'1'.repeat(39)}${i}`)
            );
            
            await nullifierRegistry.connect(user1).selectAccounts(maxAccounts);
            await nullifierRegistry.connect(user2).selectAccounts([user2.address]);
            
            // Generate and use multiple nullifiers
            const nullifier1 = await nullifierRegistry.generateNullifier(
                user1.address,
                ethers.parseEther("100"),
                1000
            );
            
            const nullifier2 = await nullifierRegistry.generateNullifier(
                user2.address,
                ethers.parseEther("200"),
                2000
            );
            
            await nullifierRegistry.connect(consumer).useNullifier(nullifier1, user1.address);
            await nullifierRegistry.connect(consumer).useNullifier(nullifier2, user2.address);
            
            // Verify all states
            expect(await nullifierRegistry.isNullifierUsed(nullifier1)).to.be.true;
            expect(await nullifierRegistry.isNullifierUsed(nullifier2)).to.be.true;
            expect(await nullifierRegistry.verifyAccountSelection(user1.address, maxAccounts)).to.be.true;
            expect(await nullifierRegistry.verifyAccountSelection(user2.address, [user2.address])).to.be.true;
        });

        it("should handle zero values in nullifier generation", async function () {
            await nullifierRegistry.connect(user1).selectAccounts(accounts1);
            
            const nullifier = await nullifierRegistry.generateNullifier(
                user1.address,
                0, // zero loan amount
                0  // zero timestamp
            );
            
            expect(nullifier).to.not.equal(ethers.ZeroHash);
        });

        it("should handle very large values in nullifier generation", async function () {
            await nullifierRegistry.connect(user1).selectAccounts(accounts1);
            
            const maxUint256 = ethers.MaxUint256;
            const nullifier = await nullifierRegistry.generateNullifier(
                user1.address,
                maxUint256,
                maxUint256
            );
            
            expect(nullifier).to.not.equal(ethers.ZeroHash);
        });
    });
});
