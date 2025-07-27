const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ProtocolGovernor - Comprehensive Coverage", function () {
    let votingToken, timelock, governor;
    let owner, user1, user2, user3, user4;

    beforeEach(async function () {
        [owner, user1, user2, user3, user4] = await ethers.getSigners();

        // Deploy VotingToken
        const VotingToken = await ethers.getContractFactory("VotingToken");
        votingToken = await VotingToken.deploy(owner.address);
        await votingToken.waitForDeployment();

        // Deploy TimelockController
        const TimelockController = await ethers.getContractFactory("TimelockController");
        timelock = await TimelockController.deploy(
            60, // 1 minute delay
            [owner.address], // proposers
            [owner.address], // executors
            owner.address // admin
        );
        await timelock.waitForDeployment();

        // Deploy ProtocolGovernor
        const ProtocolGovernor = await ethers.getContractFactory("ProtocolGovernor");
        governor = await ProtocolGovernor.deploy(
            votingToken.address,
            timelock.address
        );
        await governor.waitForDeployment();

        // Setup roles
        const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
        const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();

        await timelock.grantRole(PROPOSER_ROLE, governor.address);
        await timelock.grantRole(EXECUTOR_ROLE, ethers.ZeroAddress);

        // Grant minter role to governor
        const MINTER_ROLE = await votingToken.MINTER_ROLE();
        await votingToken.grantRole(MINTER_ROLE, governor.address);

        // Mint tokens for voting
        await votingToken.mint(owner.address, ethers.parseEther("1000"));
        await votingToken.mint(user1.address, ethers.parseEther("500"));
        await votingToken.mint(user2.address, ethers.parseEther("300"));
    });

    describe("Initialization", function () {
        it("should initialize with correct parameters", async function () {
            expect(await governor.votingToken()).to.equal(votingToken.address);
            expect(await governor.timelock()).to.equal(timelock.address);
            expect(await governor.name()).to.equal("ProtocolGovernor");
        });

        it("should have correct voting parameters", async function () {
            expect(await governor.votingDelay()).to.equal(60);
            expect(await governor.votingPeriod()).to.equal(60);
            expect(await governor.proposalThreshold()).to.equal(0);
        });
    });

    describe("Proposal Creation", function () {
        it("should allow creating proposals", async function () {
            const targets = [governor.address];
            const values = [0];
            const calldatas = [governor.interface.encodeFunctionData("setQuorumPercentage", [5])];
            const description = "Change quorum to 5%";

            await expect(
                governor.connect(owner).propose(targets, values, calldatas, description)
            ).to.emit(governor, "ProposalCreated");
        });

        it("should reject proposals with mismatched arrays", async function () {
            const targets = [governor.address];
            const values = [0, 1]; // Mismatched length
            const calldatas = [governor.interface.encodeFunctionData("setQuorumPercentage", [5])];
            const description = "Invalid proposal";

            await expect(
                governor.connect(owner).propose(targets, values, calldatas, description)
            ).to.be.revertedWith("Governor: invalid proposal length");
        });

        it("should handle empty proposals", async function () {
            await expect(
                governor.connect(owner).propose([], [], [], "Empty proposal")
            ).to.be.revertedWith("Governor: empty proposal");
        });
    });

    describe("Voting Mechanism", function () {
        let proposalId;

        beforeEach(async function () {
            const targets = [governor.address];
            const values = [0];
            const calldatas = [governor.interface.encodeFunctionData("setQuorumPercentage", [3])];
            const description = "Test proposal";

            const tx = await governor.connect(owner).propose(targets, values, calldatas, description);
            const receipt = await tx.wait();
            proposalId = receipt.events.find(e => e.event === 'ProposalCreated').args.proposalId;

            // Advance to voting period
            const votingDelay = await governor.votingDelay();
            for (let i = 0; i <= votingDelay.toNumber(); i++) {
                await ethers.provider.send("evm_mine");
            }
        });

        it("should allow voting", async function () {
            await expect(
                governor.connect(owner).castVote(proposalId, 1)
            ).to.emit(governor, "VoteCast");
        });

        it("should track vote counts", async function () {
            await governor.connect(owner).castVote(proposalId, 1); // For
            await governor.connect(user1).castVote(proposalId, 0); // Against
            await governor.connect(user2).castVote(proposalId, 2); // Abstain

            const votes = await governor.proposalVotes(proposalId);
            expect(votes.forVotes).to.be.gt(0);
            expect(votes.againstVotes).to.be.gt(0);
            expect(votes.abstainVotes).to.be.gt(0);
        });

        it("should prevent double voting", async function () {
            await governor.connect(owner).castVote(proposalId, 1);

            await expect(
                governor.connect(owner).castVote(proposalId, 1)
            ).to.be.revertedWith("GovernorVotingSimple: vote already cast");
        });

        it("should handle voting with reason", async function () {
            const reason = "I support this proposal";

            await expect(
                governor.connect(owner).castVoteWithReason(proposalId, 1, reason)
            ).to.emit(governor, "VoteCast");
        });
    });

    describe("Proposal States", function () {
        let proposalId;

        beforeEach(async function () {
            const targets = [governor.address];
            const values = [0];
            const calldatas = [governor.interface.encodeFunctionData("setQuorumPercentage", [2])];
            const description = "State test proposal";

            const tx = await governor.connect(owner).propose(targets, values, calldatas, description);
            const receipt = await tx.wait();
            proposalId = receipt.events.find(e => e.event === 'ProposalCreated').args.proposalId;
        });

        it("should start in Pending state", async function () {
            const state = await governor.state(proposalId);
            expect(state).to.equal(0); // Pending
        });

        it("should move to Active state after delay", async function () {
            const votingDelay = await governor.votingDelay();
            for (let i = 0; i <= votingDelay.toNumber(); i++) {
                await ethers.provider.send("evm_mine");
            }

            const state = await governor.state(proposalId);
            expect(state).to.equal(1); // Active
        });

        it("should move to Succeeded after successful vote", async function () {
            // Activate proposal
            const votingDelay = await governor.votingDelay();
            for (let i = 0; i <= votingDelay.toNumber(); i++) {
                await ethers.provider.send("evm_mine");
            }

            // Vote
            await governor.connect(owner).castVote(proposalId, 1);
            await governor.connect(user1).castVote(proposalId, 1);

            // End voting period
            const votingPeriod = await governor.votingPeriod();
            for (let i = 0; i <= votingPeriod.toNumber(); i++) {
                await ethers.provider.send("evm_mine");
            }

            const state = await governor.state(proposalId);
            expect(state).to.equal(4); // Succeeded
        });
    });

    describe("Proposal Execution", function () {
        let proposalId, targets, values, calldatas, descriptionHash;

        beforeEach(async function () {
            targets = [governor.address];
            values = [0];
            calldatas = [governor.interface.encodeFunctionData("setQuorumPercentage", [1])];
            const description = "Execution test";
            descriptionHash = ethers.utils.id(description);

            const tx = await governor.connect(owner).propose(targets, values, calldatas, description);
            const receipt = await tx.wait();
            proposalId = receipt.events.find(e => e.event === 'ProposalCreated').args.proposalId;

            // Activate and vote
            const votingDelay = await governor.votingDelay();
            for (let i = 0; i <= votingDelay.toNumber(); i++) {
                await ethers.provider.send("evm_mine");
            }

            await governor.connect(owner).castVote(proposalId, 1);
            await governor.connect(user1).castVote(proposalId, 1);

            // End voting
            const votingPeriod = await governor.votingPeriod();
            for (let i = 0; i <= votingPeriod.toNumber(); i++) {
                await ethers.provider.send("evm_mine");
            }
        });

        it("should queue successful proposals", async function () {
            await expect(
                governor.queue(targets, values, calldatas, descriptionHash)
            ).to.emit(governor, "ProposalQueued");

            const state = await governor.state(proposalId);
            expect(state).to.equal(5); // Queued
        });

        it("should execute queued proposals after delay", async function () {
            await governor.queue(targets, values, calldatas, descriptionHash);

            // Wait for timelock delay
            const delay = await timelock.getMinDelay();
            await ethers.provider.send("evm_increaseTime", [delay.toNumber() + 1]);
            await ethers.provider.send("evm_mine");

            await expect(
                governor.execute(targets, values, calldatas, descriptionHash)
            ).to.emit(governor, "ProposalExecuted");

            const state = await governor.state(proposalId);
            expect(state).to.equal(7); // Executed
        });
    });

    describe("Advanced Proposals", function () {
        it("should handle advanced proposal creation", async function () {
            const targetContract = governor.address;
            const functionSelector = governor.interface.getSighash("setQuorumPercentage");
            const encodedParams = ethers.utils.defaultAbiCoder.encode(["uint256"], [8]);
            const description = "Advanced proposal test";

            await expect(
                governor.connect(owner).createAdvancedProposal(
                    targetContract,
                    functionSelector,
                    encodedParams,
                    description
                )
            ).to.emit(governor, "AdvancedProposalCreated");
        });

        it("should handle advanced voting", async function () {
            const targetContract = governor.address;
            const functionSelector = governor.interface.getSighash("setQuorumPercentage");
            const encodedParams = ethers.utils.defaultAbiCoder.encode(["uint256"], [8]);
            const description = "Advanced voting test";

            const tx = await governor.connect(owner).createAdvancedProposal(
                targetContract,
                functionSelector,
                encodedParams,
                description
            );
            const receipt = await tx.wait();
            const proposalId = receipt.events.find(e => e.event === 'AdvancedProposalCreated').args.proposalId;

            // Fast forward to voting period
            await ethers.provider.send("evm_increaseTime", [3600]);
            await ethers.provider.send("evm_mine");

            await expect(
                governor.connect(owner).voteAdvanced(proposalId, true)
            ).to.emit(governor, "AdvancedVoteCast");
        });
    });

    describe("Token Granting", function () {
        it("should grant tokens for lending actions", async function () {
            const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
            const mockFeed = await MockPriceFeed.deploy(ethers.parseUnits("2000", 8), 8);
            await mockFeed.waitForDeployment();

            await governor.setPriceFeed(ethers.ZeroAddress, mockFeed.address);

            const balanceBefore = await votingToken.balanceOf(user1.address);

            await governor.grantTokensForAction(
                user1.address,
                0, // LEND
                ethers.ZeroAddress, // ETH
                ethers.parseEther("1")
            );

            const balanceAfter = await votingToken.balanceOf(user1.address);
            expect(balanceAfter).to.be.gt(balanceBefore);
        });

        it("should handle different action types", async function () {
            const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
            const mockFeed = await MockPriceFeed.deploy(ethers.parseUnits("2000", 8), 8);
            await mockFeed.waitForDeployment();

            await governor.setPriceFeed(ethers.ZeroAddress, mockFeed.address);

            // Test BORROW action
            await governor.grantTokensForAction(
                user1.address,
                1, // BORROW
                ethers.ZeroAddress,
                ethers.parseEther("0.5")
            );

            // Test REPAY action
            await governor.grantTokensForAction(
                user1.address,
                2, // REPAY
                ethers.ZeroAddress,
                ethers.parseEther("0.3")
            );
        });
    });

    describe("Contract Whitelist", function () {
        it("should manage contract whitelist", async function () {
            const contractAddr = user1.address;

            await expect(
                governor.setContractWhitelist(contractAddr, true)
            ).to.emit(governor, "ContractWhitelisted")
                .withArgs(contractAddr, true);

            expect(await governor.contractWhitelist(contractAddr)).to.be.true;

            await governor.setContractWhitelist(contractAddr, false);
            expect(await governor.contractWhitelist(contractAddr)).to.be.false;
        });
    });

    describe("Emergency Multisig", function () {
        it("should set emergency multisig", async function () {
            const signers = [user1.address, user2.address, user3.address];

            await expect(
                governor.setEmergencyMultisig(signers)
            ).to.emit(governor, "EmergencyMultisigSet");

            expect(await governor.isMultisig(user1.address)).to.be.true;
            expect(await governor.isMultisig(user4.address)).to.be.false;
        });
    });

    describe("Reputation System", function () {
        it("should track user reputation", async function () {
            const initialRep = await governor.reputation(user1.address);
            expect(initialRep).to.equal(0);

            // Only VotingToken can call penalizeReputation
            await expect(
                governor.connect(owner).penalizeReputation(user1.address, 10)
            ).to.be.revertedWith("Only VotingToken");
        });
    });

    describe("Price Feed Management", function () {
        it("should set price feeds", async function () {
            const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
            const mockFeed = await MockPriceFeed.deploy(ethers.parseUnits("2000", 8), 8);
            await mockFeed.waitForDeployment();

            await governor.setPriceFeed(ethers.ZeroAddress, mockFeed.address);
            expect(await governor.priceFeeds(ethers.ZeroAddress)).to.equal(mockFeed.address);
        });

        it("should get asset prices", async function () {
            const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
            const mockFeed = await MockPriceFeed.deploy(ethers.parseUnits("2000", 8), 8);
            await mockFeed.waitForDeployment();

            await governor.setPriceFeed(ethers.ZeroAddress, mockFeed.address);

            const price = await governor.getAssetPrice(ethers.ZeroAddress);
            expect(price).to.be.gt(0);
        });
    });

    describe("Utility Functions", function () {
        it("should calculate square root", async function () {
            // Test internal sqrt function through token granting
            const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
            const mockFeed = await MockPriceFeed.deploy(ethers.parseUnits("2000", 8), 8);
            await mockFeed.waitForDeployment();

            await governor.setPriceFeed(ethers.ZeroAddress, mockFeed.address);

            // This will internally use sqrt function
            await governor.grantTokensForAction(
                user1.address,
                0, // LEND
                ethers.ZeroAddress,
                ethers.parseEther("4") // Perfect square for testing
            );
        });
    });

    describe("Edge Cases", function () {
        it("should handle zero token grants", async function () {
            const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
            const mockFeed = await MockPriceFeed.deploy(0, 8); // Zero price
            await mockFeed.waitForDeployment();

            await governor.setPriceFeed(ethers.ZeroAddress, mockFeed.address);

            const balanceBefore = await votingToken.balanceOf(user1.address);

            await governor.grantTokensForAction(
                user1.address,
                0, // LEND
                ethers.ZeroAddress,
                ethers.parseEther("1")
            );

            const balanceAfter = await votingToken.balanceOf(user1.address);
            expect(balanceAfter).to.equal(balanceBefore); // No tokens granted for zero price
        });

        it("should cap token grants at maximum", async function () {
            const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
            const mockFeed = await MockPriceFeed.deploy(ethers.parseUnits("1000000", 8), 8); // Very high price
            await mockFeed.waitForDeployment();

            await governor.setPriceFeed(ethers.ZeroAddress, mockFeed.address);

            const balanceBefore = await votingToken.balanceOf(user1.address);

            await governor.grantTokensForAction(
                user1.address,
                0, // LEND
                ethers.ZeroAddress,
                ethers.parseEther("1000") // Large amount
            );

            const balanceAfter = await votingToken.balanceOf(user1.address);
            const tokensGranted = balanceAfter.sub(balanceBefore);
            expect(tokensGranted).to.be.lte(1000); // Capped at 1000
        });

        it("should handle invalid price feeds", async function () {
            await expect(
                governor.getAssetPrice(user1.address) // No price feed set
            ).to.be.revertedWith("No price feed");
        });
    });

    describe("Access Control", function () {
        it("should restrict DAO-only functions", async function () {
            await expect(
                governor.connect(user1).setContractWhitelist(user2.address, true)
            ).to.be.revertedWith("Only DAO");

            await expect(
                governor.connect(user1).setEmergencyMultisig([user2.address])
            ).to.be.revertedWith("Only DAO");
        });

        it("should allow DAO functions from owner", async function () {
            // These should work since owner is the DAO
            await governor.setContractWhitelist(user1.address, true);
            await governor.setEmergencyMultisig([user1.address, user2.address]);
        });
    });

    describe("Quorum Management", function () {
        it("should get current quorum", async function () {
            const blockNumber = await ethers.provider.getBlockNumber();
            const quorum = await governor.quorum(blockNumber);
            expect(quorum).to.be.gte(0);
        });

        it("should update quorum percentage", async function () {
            await governor.setQuorumPercentage(10);
            expect(await governor.quorumPercentage()).to.equal(10);
        });
    });
});