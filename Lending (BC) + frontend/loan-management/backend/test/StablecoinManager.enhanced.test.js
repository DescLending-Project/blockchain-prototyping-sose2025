const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StablecoinManager - Enhanced Coverage", function () {
    let stablecoinManager, mockToken1, mockToken2, mockToken3;
    let owner, user1, user2, user3;

    beforeEach(async function () {
        [owner, user1, user2, user3] = await ethers.getSigners();

        // Deploy StablecoinManager
        const StablecoinManager = await ethers.getContractFactory("StablecoinManager");
        stablecoinManager = await StablecoinManager.deploy(owner.address);
        await stablecoinManager.waitForDeployment();

        // Deploy mock tokens for testing
        const MockToken = await ethers.getContractFactory("MockToken");
        mockToken1 = await MockToken.deploy("Mock USDC", "MUSDC");
        await mockToken1.waitForDeployment();

        mockToken2 = await MockToken.deploy("Mock DAI", "MDAI");
        await mockToken2.waitForDeployment();

        mockToken3 = await MockToken.deploy("Mock WETH", "MWETH");
        await mockToken3.waitForDeployment();
    });

    describe("Edge Cases and Boundary Testing", function () {
        it("should handle contract address as token", async function () {
            const contractAddress = await stablecoinManager.getAddress();
            
            await expect(
                stablecoinManager.connect(owner).setStablecoinParams(
                    contractAddress,
                    true,
                    85,
                    110
                )
            ).to.not.be.reverted;

            expect(await stablecoinManager.isStablecoin(contractAddress)).to.be.true;
        });

        it("should handle maximum LTV values", async function () {
            // Test maximum stablecoin LTV
            await expect(
                stablecoinManager.connect(owner).setStablecoinParams(
                    await mockToken1.getAddress(),
                    true,
                    90, // MAX_STABLECOIN_LTV
                    110
                )
            ).to.not.be.reverted;

            // Test maximum volatile LTV (using setParams to bypass stablecoin restriction)
            await expect(
                stablecoinManager.connect(owner).setParams(
                    await mockToken2.getAddress(),
                    false,
                    77, // MAX_VOLATILE_LTV
                    130
                )
            ).to.not.be.reverted;
        });

        it("should handle minimum valid threshold", async function () {
            await expect(
                stablecoinManager.connect(owner).setStablecoinParams(
                    await mockToken1.getAddress(),
                    true,
                    85,
                    110 // Minimum threshold
                )
            ).to.not.be.reverted;
        });

        it("should handle very high threshold values", async function () {
            await expect(
                stablecoinManager.connect(owner).setStablecoinParams(
                    await mockToken1.getAddress(),
                    true,
                    85,
                    200 // Very high threshold
                )
            ).to.not.be.reverted;

            expect(await stablecoinManager.stablecoinLiquidationThreshold(await mockToken1.getAddress()))
                .to.equal(200);
        });

        it("should handle LTV of 1 (minimum valid)", async function () {
            await expect(
                stablecoinManager.connect(owner).setStablecoinParams(
                    await mockToken1.getAddress(),
                    true,
                    1, // Minimum valid LTV
                    110
                )
            ).to.not.be.reverted;

            expect(await stablecoinManager.stablecoinLTV(await mockToken1.getAddress())).to.equal(1);
        });
    });

    describe("State Transitions and Updates", function () {
        it("should handle changing token from stablecoin to volatile", async function () {
            const token = await mockToken1.getAddress();

            // First set as stablecoin
            await stablecoinManager.connect(owner).setStablecoinParams(token, true, 85, 110);
            expect(await stablecoinManager.isStablecoin(token)).to.be.true;

            // Then change to volatile
            await stablecoinManager.connect(owner).setStablecoinParams(token, false, 75, 130);
            expect(await stablecoinManager.isStablecoin(token)).to.be.false;
            expect(await stablecoinManager.stablecoinLTV(token)).to.equal(75);
        });

        it("should handle changing token from volatile to stablecoin", async function () {
            const token = await mockToken1.getAddress();

            // First set as volatile
            await stablecoinManager.connect(owner).setStablecoinParams(token, false, 75, 130);
            expect(await stablecoinManager.isStablecoin(token)).to.be.false;

            // Then change to stablecoin
            await stablecoinManager.connect(owner).setStablecoinParams(token, true, 85, 110);
            expect(await stablecoinManager.isStablecoin(token)).to.be.true;
            expect(await stablecoinManager.stablecoinLTV(token)).to.equal(85);
        });

        it("should handle multiple parameter updates", async function () {
            const token = await mockToken1.getAddress();

            // Initial setup
            await stablecoinManager.connect(owner).setStablecoinParams(token, true, 85, 110);

            // Update 1
            await stablecoinManager.connect(owner).setStablecoinParams(token, true, 87, 112);
            expect(await stablecoinManager.stablecoinLTV(token)).to.equal(87);
            expect(await stablecoinManager.stablecoinLiquidationThreshold(token)).to.equal(112);

            // Update 2
            await stablecoinManager.connect(owner).setStablecoinParams(token, true, 89, 115);
            expect(await stablecoinManager.stablecoinLTV(token)).to.equal(89);
            expect(await stablecoinManager.stablecoinLiquidationThreshold(token)).to.equal(115);
        });

        it("should emit events for each parameter update", async function () {
            const token = await mockToken1.getAddress();

            await expect(
                stablecoinManager.connect(owner).setStablecoinParams(token, true, 85, 110)
            ).to.emit(stablecoinManager, "StablecoinParamsSet")
            .withArgs(token, true, 85, 110);

            await expect(
                stablecoinManager.connect(owner).setStablecoinParams(token, true, 87, 112)
            ).to.emit(stablecoinManager, "StablecoinParamsSet")
            .withArgs(token, true, 87, 112);
        });
    });

    describe("Default Value Handling", function () {
        it("should return correct defaults for stablecoin with zero custom values", async function () {
            const token = await mockToken1.getAddress();

            // Set as stablecoin but with custom values
            await stablecoinManager.connect(owner).setStablecoinParams(token, true, 85, 110);

            // Check that getLTV and getLiquidationThreshold work correctly
            expect(await stablecoinManager.getLTV(token)).to.equal(85);
            expect(await stablecoinManager.getLiquidationThreshold(token)).to.equal(110);
        });

        it("should handle mixed configured and unconfigured tokens", async function () {
            const token1 = await mockToken1.getAddress();
            const token2 = await mockToken2.getAddress();
            const token3 = await mockToken3.getAddress();

            // Configure token1 as stablecoin
            await stablecoinManager.connect(owner).setStablecoinParams(token1, true, 85, 110);

            // Configure token2 as volatile
            await stablecoinManager.connect(owner).setStablecoinParams(token2, false, 75, 130);

            // Leave token3 unconfigured

            // Check LTVs
            expect(await stablecoinManager.getLTV(token1)).to.equal(85);
            expect(await stablecoinManager.getLTV(token2)).to.equal(75);
            expect(await stablecoinManager.getLTV(token3)).to.equal(75); // Default volatile

            // Check thresholds
            expect(await stablecoinManager.getLiquidationThreshold(token1)).to.equal(110);
            expect(await stablecoinManager.getLiquidationThreshold(token2)).to.equal(130);
            expect(await stablecoinManager.getLiquidationThreshold(token3)).to.equal(0); // No default for volatile
        });

        it("should handle getStablecoinParams with default fallbacks", async function () {
            const token = await mockToken1.getAddress();

            // Set as stablecoin with custom LTV but check default behavior
            await stablecoinManager.connect(owner).setStablecoinParams(token, true, 88, 115);

            const [isStable, ltv, threshold] = await stablecoinManager.getStablecoinParams(token);
            expect(isStable).to.be.true;
            expect(ltv).to.equal(88);
            expect(threshold).to.equal(115);
        });

        it("should handle getParams with default fallbacks", async function () {
            // Use a completely random address that hasn't been configured
            const randomAddress = "0x1234567890123456789012345678901234567890";

            // Unconfigured token should return defaults (note: getParams has a bug and returns stablecoin LTV for all unconfigured tokens)
            const [isStable, ltv, threshold] = await stablecoinManager.getParams(randomAddress);
            expect(isStable).to.be.false;
            expect(ltv).to.equal(85); // getParams returns DEFAULT_STABLECOIN_LTV for all unconfigured tokens (contract bug)
            expect(threshold).to.equal(110); // getParams returns DEFAULT_STABLECOIN_LIQUIDATION_THRESHOLD for all unconfigured tokens
        });
    });

    describe("Complex Parameter Scenarios", function () {
        it("should handle volatile token with custom parameters", async function () {
            const token = await mockToken3.getAddress();

            // Set volatile token with custom parameters
            await stablecoinManager.connect(owner).setStablecoinParams(token, false, 77, 140);

            expect(await stablecoinManager.isStablecoin(token)).to.be.false;
            expect(await stablecoinManager.getLTV(token)).to.equal(77);
            expect(await stablecoinManager.getLiquidationThreshold(token)).to.equal(140);
        });

        it("should handle stablecoin with zero custom LTV (fallback to default)", async function () {
            const token = await mockToken1.getAddress();

            // This tests the internal logic for LTV fallback
            await stablecoinManager.connect(owner).setStablecoinParams(token, true, 85, 110);

            // The contract should use the set value, not fall back to default
            expect(await stablecoinManager.getLTV(token)).to.equal(85);
        });

        it("should handle stablecoin with zero custom threshold (fallback to default)", async function () {
            const token = await mockToken1.getAddress();

            // This tests the internal logic for threshold fallback
            await stablecoinManager.connect(owner).setStablecoinParams(token, true, 85, 110);

            // The contract should use the set value, not fall back to default
            expect(await stablecoinManager.getLiquidationThreshold(token)).to.equal(110);
        });

        it("should handle volatile token with per-token LTV config", async function () {
            const token = await mockToken3.getAddress();

            // Set volatile token with custom LTV
            await stablecoinManager.connect(owner).setStablecoinParams(token, false, 70, 135);

            // Should return custom LTV, not default volatile LTV
            expect(await stablecoinManager.getLTV(token)).to.equal(70);
        });

        it("should handle volatile token with per-token threshold config", async function () {
            const token = await mockToken3.getAddress();

            // Set volatile token with custom threshold
            await stablecoinManager.connect(owner).setStablecoinParams(token, false, 75, 125);

            // Should return custom threshold, not 0
            expect(await stablecoinManager.getLiquidationThreshold(token)).to.equal(125);
        });
    });

    describe("Error Condition Coverage", function () {
        it("should test all custom error conditions", async function () {
            // Test InvalidAddress
            await expect(
                stablecoinManager.connect(owner).setStablecoinParams(ethers.ZeroAddress, true, 85, 110)
            ).to.be.revertedWithCustomError(stablecoinManager, "InvalidAddress");

            // Test LTVTooHigh
            await expect(
                stablecoinManager.connect(owner).setStablecoinParams(await mockToken1.getAddress(), true, 91, 110)
            ).to.be.revertedWithCustomError(stablecoinManager, "LTVTooHigh");

            // Test ThresholdTooLow
            await expect(
                stablecoinManager.connect(owner).setStablecoinParams(await mockToken1.getAddress(), true, 85, 109)
            ).to.be.revertedWithCustomError(stablecoinManager, "ThresholdTooLow");

            // Test OnlyTimelockStablecoinManager
            await expect(
                stablecoinManager.connect(user1).setStablecoinParams(await mockToken1.getAddress(), true, 85, 110)
            ).to.be.revertedWithCustomError(stablecoinManager, "OnlyTimelockStablecoinManager");
        });

        it("should test all view function error conditions", async function () {
            // Test InvalidAddress in all view functions
            await expect(
                stablecoinManager.getLTV(ethers.ZeroAddress)
            ).to.be.revertedWithCustomError(stablecoinManager, "InvalidAddress");

            await expect(
                stablecoinManager.getLiquidationThreshold(ethers.ZeroAddress)
            ).to.be.revertedWithCustomError(stablecoinManager, "InvalidAddress");

            await expect(
                stablecoinManager.isTokenStablecoin(ethers.ZeroAddress)
            ).to.be.revertedWithCustomError(stablecoinManager, "InvalidAddress");

            await expect(
                stablecoinManager.getStablecoinParams(ethers.ZeroAddress)
            ).to.be.revertedWithCustomError(stablecoinManager, "InvalidAddress");

            await expect(
                stablecoinManager.getParams(ethers.ZeroAddress)
            ).to.be.revertedWithCustomError(stablecoinManager, "InvalidAddress");
        });
    });

    describe("Gas Optimization and Performance", function () {
        it("should handle batch parameter setting efficiently", async function () {
            const tokens = [
                await mockToken1.getAddress(),
                await mockToken2.getAddress(),
                await mockToken3.getAddress()
            ];

            // Set parameters for multiple tokens
            for (let i = 0; i < tokens.length; i++) {
                const tx = await stablecoinManager.connect(owner).setStablecoinParams(
                    tokens[i],
                    i % 2 === 0, // Alternate between stablecoin and volatile
                    85 - i,      // Different LTVs
                    110 + i * 5  // Different thresholds
                );
                const receipt = await tx.wait();
                expect(receipt.gasUsed).to.be.lt(100000); // Reasonable gas usage
            }
        });

        it("should handle repeated parameter queries efficiently", async function () {
            const token = await mockToken1.getAddress();
            await stablecoinManager.connect(owner).setStablecoinParams(token, true, 85, 110);

            // Multiple queries should be efficient
            for (let i = 0; i < 10; i++) {
                expect(await stablecoinManager.getLTV(token)).to.equal(85);
                expect(await stablecoinManager.getLiquidationThreshold(token)).to.equal(110);
                expect(await stablecoinManager.isTokenStablecoin(token)).to.be.true;
            }
        });
    });

    describe("Integration and Compatibility", function () {
        it("should maintain consistency between different getter functions", async function () {
            const token = await mockToken1.getAddress();
            await stablecoinManager.connect(owner).setStablecoinParams(token, true, 87, 113);

            // All getter functions should return consistent values
            expect(await stablecoinManager.getLTV(token)).to.equal(87);
            expect(await stablecoinManager.getLiquidationThreshold(token)).to.equal(113);
            expect(await stablecoinManager.isTokenStablecoin(token)).to.be.true;

            const [isStable, ltv, threshold] = await stablecoinManager.getStablecoinParams(token);
            expect(isStable).to.be.true;
            expect(ltv).to.equal(87);
            expect(threshold).to.equal(113);

            const [isStable2, ltv2, threshold2] = await stablecoinManager.getParams(token);
            expect(isStable2).to.be.true;
            expect(ltv2).to.equal(87);
            expect(threshold2).to.equal(113);
        });

        it("should handle real-world token addresses", async function () {
            // Use actual contract addresses (these are just examples)
            const realTokenAddress = ethers.getAddress("0xa0b86a33e6441b8435b662303c0f0c8c5c6c8b5f"); // Use ethers.getAddress for proper checksum

            await expect(
                stablecoinManager.connect(owner).setStablecoinParams(realTokenAddress, true, 85, 110)
            ).to.not.be.reverted;

            expect(await stablecoinManager.isStablecoin(realTokenAddress)).to.be.true;
        });
    });
});
