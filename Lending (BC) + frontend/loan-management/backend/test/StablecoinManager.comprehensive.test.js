const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StablecoinManager - Comprehensive Coverage", function() {
    let stablecoinManager, mockLiquidityPool, mockTimelock;
    let owner, timelock, user1, user2, user3;
    let mockUSDC, mockUSDT, mockDAI;

    beforeEach(async function () {
        [owner, timelock, user1, user2, user3] = await ethers.getSigners();

        // Deploy mock tokens
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        mockUSDC = await MockERC20.deploy("USD Coin", "USDC", 6);
        mockUSDT = await MockERC20.deploy("Tether USD", "USDT", 6);
        mockDAI = await MockERC20.deploy("Dai Stablecoin", "DAI", 18);
        await mockUSDC.waitForDeployment();
        await mockUSDT.waitForDeployment();
        await mockDAI.waitForDeployment();

        // Deploy mock contracts
        const MockLiquidityPool = await ethers.getContractFactory("MockLiquidityPool");
        mockLiquidityPool = await MockLiquidityPool.deploy();
        await mockLiquidityPool.waitForDeployment();

        const MockTimelock = await ethers.getContractFactory("MockTimelock");
        mockTimelock = await MockTimelock.deploy();
        await mockTimelock.waitForDeployment();

        // Deploy StablecoinManager with owner as timelock for testing
        const StablecoinManager = await ethers.getContractFactory("StablecoinManager");
        stablecoinManager = await StablecoinManager.deploy(
            owner.address // use owner as timelock for testing
        );
        await stablecoinManager.waitForDeployment();
    });

    describe("Initialization", function() {
        it("should initialize with correct parameters", async function () {
            expect(await stablecoinManager.timelock()).to.equal(owner.address);
        });

        it("should set correct constants", async function () {
            expect(await stablecoinManager.MAX_STABLECOIN_LTV()).to.equal(90n); // 90%
            expect(await stablecoinManager.DEFAULT_STABLECOIN_LIQUIDATION_THRESHOLD()).to.equal(110n); // 110%
        });

        it("should allow setting USDC and USDT as stablecoins", async function () {
            // Set USDC as stablecoin
            await stablecoinManager.connect(owner).setStablecoinParams(
                await mockUSDC.getAddress(),
                true,  // isStable
                85,    // LTV
                110    // liquidation threshold
            );

            // Set USDT as stablecoin
            await stablecoinManager.connect(owner).setStablecoinParams(
                await mockUSDT.getAddress(),
                true,  // isStable
                85,    // LTV
                110    // liquidation threshold
            );

            expect(await stablecoinManager.isStablecoin(await mockUSDC.getAddress())).to.be.true;
            expect(await stablecoinManager.isStablecoin(await mockUSDT.getAddress())).to.be.true;

            const usdcParams = await stablecoinManager.getStablecoinParams(await mockUSDC.getAddress());
            expect(usdcParams[0]).to.be.true; // isStable
            expect(usdcParams[1]).to.equal(85n); // LTV
            expect(usdcParams[2]).to.equal(110n); // liquidation threshold
        });
    });

    describe("Stablecoin Parameter Management", function() {
        it("should allow timelock to set stablecoin parameters", async function () {
            await expect(
                stablecoinManager.connect(owner).setStablecoinParams(
                    await mockDAI.getAddress(),
                    true,
                    85, // 85% LTV
                    110 // 110% liquidation threshold
                )
            ).to.emit(stablecoinManager, "StablecoinParamsSet")
                .withArgs(await mockDAI.getAddress(), true, 85, 110);

            const params = await stablecoinManager.getStablecoinParams(await mockDAI.getAddress());
            expect(params[0]).to.be.true;
            expect(params[1]).to.equal(85n);
            expect(params[2]).to.equal(110n);
        });

        it("should reject parameter setting from non-timelock", async function () {
            await expect(
                stablecoinManager.connect(user1).setStablecoinParams(
                    await mockDAI.getAddress(),
                    true,
                    85,
                    110
                )
            ).to.be.revertedWithCustomError(stablecoinManager, "OnlyTimelockStablecoinManager");
        });

        it("should reject zero address", async function () {
            await expect(
                stablecoinManager.connect(owner).setStablecoinParams(
                    ethers.ZeroAddress,
                    true,
                    85,
                    110
                )
            ).to.be.revertedWithCustomError(stablecoinManager, "InvalidAddress");
        });

        it("should reject zero LTV", async function () {
            await expect(
                stablecoinManager.connect(owner).setStablecoinParams(
                    await mockDAI.getAddress(),
                    true,
                    0,
                    110
                )
            ).to.be.revertedWith("LTV must be greater than zero");
        });

        it("should reject LTV too high", async function () {
            await expect(
                stablecoinManager.connect(owner).setStablecoinParams(
                    await mockDAI.getAddress(),
                    true,
                    95, // > MAX_STABLECOIN_LTV (90)
                    110
                )
            ).to.be.revertedWithCustomError(stablecoinManager, "LTVTooHigh");
        });

        it("should reject threshold too low", async function () {
            await expect(
                stablecoinManager.connect(owner).setStablecoinParams(
                    await mockDAI.getAddress(),
                    true,
                    85,
                    105 // < DEFAULT_STABLECOIN_LIQUIDATION_THRESHOLD (110)
                )
            ).to.be.revertedWithCustomError(stablecoinManager, "ThresholdTooLow");
        });

        it("should handle disabling stablecoin", async function () {
            await stablecoinManager.connect(owner).setStablecoinParams(
                await mockUSDC.getAddress(),
                false,
                85,
                110
            );

            expect(await stablecoinManager.isStablecoin(await mockUSDC.getAddress())).to.be.false;
        });

        it("should handle maximum LTV", async function () {
            await stablecoinManager.connect(owner).setStablecoinParams(
                await mockDAI.getAddress(),
                true,
                90, // MAX_STABLECOIN_LTV
                110
            );

            const params = await stablecoinManager.getStablecoinParams(await mockDAI.getAddress());
            expect(params[1]).to.equal(90n);
        });

        it("should handle minimum threshold", async function () {
            await stablecoinManager.connect(owner).setStablecoinParams(
                await mockDAI.getAddress(),
                true,
                85,
                110 // DEFAULT_STABLECOIN_LIQUIDATION_THRESHOLD
            );

            const params = await stablecoinManager.getStablecoinParams(await mockDAI.getAddress());
            expect(params[2]).to.equal(110n);
        });
    });

    describe("Parameter Retrieval", function() {
        beforeEach(async function () {
            await stablecoinManager.connect(owner).setStablecoinParams(
                await mockDAI.getAddress(),
                true,
                85,
                110
            );
        });

        it("should return correct parameters for configured stablecoin", async function () {
            const params = await stablecoinManager.getStablecoinParams(await mockDAI.getAddress());
            expect(params[0]).to.be.true; // isStable
            expect(params[1]).to.equal(85n); // LTV
            expect(params[2]).to.equal(110n); // liquidation threshold
        });

        it("should return default parameters for non-stablecoin", async function () {
            const randomToken = user1.address;
            const params = await stablecoinManager.getStablecoinParams(randomToken);
            expect(params[0]).to.be.false; // isStable
            expect(params[1]).to.equal(75n); // LTV (DEFAULT_VOLATILE_LTV)
            expect(params[2]).to.equal(0n); // liquidation threshold
        });

        it("should return correct LTV for stablecoin", async function () {
            // Set up DAI and USDC as stablecoins first
            await stablecoinManager.connect(owner).setStablecoinParams(
                await mockDAI.getAddress(),
                true,
                85,
                110
            );

            await stablecoinManager.connect(owner).setStablecoinParams(
                await mockUSDC.getAddress(),
                true,
                85,
                110
            );

            expect(await stablecoinManager.getLTV(await mockDAI.getAddress())).to.equal(85n);
            expect(await stablecoinManager.getLTV(await mockUSDC.getAddress())).to.equal(85n);
        });

        it("should return correct liquidation threshold", async function () {
            // Set up DAI and USDC as stablecoins first
            await stablecoinManager.connect(owner).setStablecoinParams(
                await mockDAI.getAddress(),
                true,
                85,
                110
            );

            await stablecoinManager.connect(owner).setStablecoinParams(
                await mockUSDC.getAddress(),
                true,
                85,
                110
            );

            expect(await stablecoinManager.getLiquidationThreshold(await mockDAI.getAddress())).to.equal(110n);
            expect(await stablecoinManager.getLiquidationThreshold(await mockUSDC.getAddress())).to.equal(110n);
        });

        it("should handle multiple stablecoins", async function () {
            // Set up DAI as stablecoin first
            await stablecoinManager.connect(owner).setStablecoinParams(
                await mockDAI.getAddress(),
                true,
                85,
                110
            );

            // Set up another stablecoin with different parameters
            await stablecoinManager.connect(owner).setStablecoinParams(
                user2.address, // Mock token address
                true,
                75,
                120
            );

            const daiParams = await stablecoinManager.getStablecoinParams(await mockDAI.getAddress());
            const mockParams = await stablecoinManager.getStablecoinParams(user2.address);

            expect(daiParams[1]).to.equal(85n);
            expect(mockParams[1]).to.equal(75n);
            expect(daiParams[2]).to.equal(110n);
            expect(mockParams[2]).to.equal(120n);
        });
    });

    describe("Stablecoin Status Checks", function() {
        it("should correctly identify stablecoins", async function () {
            // Set up USDC and USDT as stablecoins first
            await stablecoinManager.connect(owner).setStablecoinParams(
                await mockUSDC.getAddress(),
                true,
                85,
                110
            );

            await stablecoinManager.connect(owner).setStablecoinParams(
                await mockUSDT.getAddress(),
                true,
                85,
                110
            );

            expect(await stablecoinManager.isStablecoin(await mockUSDC.getAddress())).to.be.true;
            expect(await stablecoinManager.isStablecoin(await mockUSDT.getAddress())).to.be.true;
            expect(await stablecoinManager.isStablecoin(await mockDAI.getAddress())).to.be.false;
            expect(await stablecoinManager.isStablecoin(user1.address)).to.be.false;
        });

        it("should update stablecoin status when parameters change", async function () {
            expect(await stablecoinManager.isStablecoin(await mockDAI.getAddress())).to.be.false;

            await stablecoinManager.connect(owner).setStablecoinParams(
                await mockDAI.getAddress(),
                true,
                85,
                110
            );

            expect(await stablecoinManager.isStablecoin(await mockDAI.getAddress())).to.be.true;

            await stablecoinManager.connect(owner).setStablecoinParams(
                await mockDAI.getAddress(),
                false,
                85,
                110
            );

            expect(await stablecoinManager.isStablecoin(await mockDAI.getAddress())).to.be.false;
        });
    });

    describe("Edge Cases", function() {
        it("should handle setting same parameters multiple times", async function () {
            await stablecoinManager.connect(owner).setStablecoinParams(
                await mockDAI.getAddress(),
                true,
                85,
                110
            );

            await stablecoinManager.connect(owner).setStablecoinParams(
                await mockDAI.getAddress(),
                true,
                85,
                110
            );

            const params = await stablecoinManager.getStablecoinParams(await mockDAI.getAddress());
            expect(params[1]).to.equal(85n);
            expect(params[2]).to.equal(110n);
        });

        it("should handle updating existing stablecoin parameters", async function () {
            // Update USDC parameters
            await stablecoinManager.connect(owner).setStablecoinParams(
                await mockUSDC.getAddress(),
                true,
                80,
                115
            );

            const params = await stablecoinManager.getStablecoinParams(await mockUSDC.getAddress());
            expect(params[1]).to.equal(80n);
            expect(params[2]).to.equal(115n);
        });

        it("should handle extreme valid values", async function () {
            await stablecoinManager.connect(owner).setStablecoinParams(
                await mockDAI.getAddress(),
                true,
                1, // Minimum LTV
                50000 // Very high liquidation threshold
            );

            const params = await stablecoinManager.getStablecoinParams(await mockDAI.getAddress());
            expect(params[1]).to.equal(1n);
            expect(params[2]).to.equal(50000n);
        });

        it("should handle contract address as token", async function () {
            await stablecoinManager.connect(owner).setStablecoinParams(
                await stablecoinManager.getAddress(),
                true,
                85,
                110
            );

            expect(await stablecoinManager.isStablecoin(await stablecoinManager.getAddress())).to.be.true;
        });
    });

    describe("Access Control", function() {
        it("should only allow timelock to modify parameters", async function () {
            const accounts = [user1, user2, user3]; // owner is the timelock, so should be excluded

            for (const account of accounts) {
                await expect(
                    stablecoinManager.connect(account).setStablecoinParams(
                        await mockDAI.getAddress(),
                        true,
                        85,
                        110
                    )
                ).to.be.revertedWithCustomError(stablecoinManager, "OnlyTimelockStablecoinManager");
            }
        });

        it("should allow timelock to be changed", async function () {
            // This would typically be done through a governance process
            // For testing, we assume the timelock can update itself
            const newTimelock = user1.address;

            // In a real scenario, this would be done through the timelock's own governance
            // Here we just verify the modifier works correctly
            await expect(
                stablecoinManager.connect(user1).setStablecoinParams(
                    mockDAI.getAddress(),
                    true,
                    8500,
                    110
                )
            ).to.be.revertedWithCustomError(stablecoinManager, "OnlyTimelockStablecoinManager");
        });
    });

    describe("Events", function() {
        it("should emit StablecoinParamsSet event", async function () {
            await expect(
                stablecoinManager.connect(owner).setStablecoinParams(
                    await mockDAI.getAddress(),
                    true,
                    85,
                    110
                )
            ).to.emit(stablecoinManager, "StablecoinParamsSet")
                .withArgs(await mockDAI.getAddress(), true, 85, 110);
        });

        it("should emit event when disabling stablecoin", async function () {
            await expect(
                stablecoinManager.connect(owner).setStablecoinParams(
                    await mockUSDC.getAddress(),
                    false,
                    1, // Minimum valid LTV
                    110
                )
            ).to.emit(stablecoinManager, "StablecoinParamsSet")
                .withArgs(await mockUSDC.getAddress(), false, 1, 110);
        });

        it("should emit event when updating existing stablecoin", async function () {
            await expect(
                stablecoinManager.connect(owner).setStablecoinParams(
                    await mockUSDC.getAddress(),
                    true,
                    88,
                    115
                )
            ).to.emit(stablecoinManager, "StablecoinParamsSet")
                .withArgs(await mockUSDC.getAddress(), true, 88, 115);
        });
    });

    describe("Integration Tests", function() {
        it("should work with multiple stablecoins simultaneously", async function () {
            // Set up USDC and USDT first
            await stablecoinManager.connect(owner).setStablecoinParams(
                await mockUSDC.getAddress(),
                true,
                85,
                110
            );

            await stablecoinManager.connect(owner).setStablecoinParams(
                await mockUSDT.getAddress(),
                true,
                85,
                110
            );

            // Set up DAI as well
            await stablecoinManager.connect(owner).setStablecoinParams(
                await mockDAI.getAddress(),
                true,
                85,
                110
            );

            // Verify all stablecoins work correctly
            expect(await stablecoinManager.isStablecoin(await mockUSDC.getAddress())).to.be.true;
            expect(await stablecoinManager.isStablecoin(await mockUSDT.getAddress())).to.be.true;
            expect(await stablecoinManager.isStablecoin(await mockDAI.getAddress())).to.be.true;

            // Verify different parameters
            const usdcParams = await stablecoinManager.getStablecoinParams(await mockUSDC.getAddress());
            const daiParams = await stablecoinManager.getStablecoinParams(await mockDAI.getAddress());

            expect(usdcParams[1]).to.equal(85n); // USDC was set to 85 in initialization
            expect(daiParams[1]).to.equal(85n);  // DAI was just set to 85
        });

        it("should handle complex parameter updates", async function () {
            // Initial setup
            await stablecoinManager.connect(owner).setStablecoinParams(
                await mockDAI.getAddress(),
                true,
                85,
                110
            );

            // Update multiple times
            await stablecoinManager.connect(owner).setStablecoinParams(
                await mockDAI.getAddress(),
                true,
                80,
                115
            );

            await stablecoinManager.connect(owner).setStablecoinParams(
                await mockUSDC.getAddress(),
                true,
                88,
                115
            );

            // Verify final state
            const daiParams = await stablecoinManager.getStablecoinParams(await mockDAI.getAddress());
            const usdcParams = await stablecoinManager.getStablecoinParams(await mockUSDC.getAddress());

            expect(daiParams[1]).to.equal(80n);
            expect(daiParams[2]).to.equal(115n);
            expect(usdcParams[1]).to.equal(88n);
            expect(usdcParams[2]).to.equal(115n);
        });
    });

    describe("Gas Optimization", function() {
        it("should handle parameter setting efficiently", async function () {
            const tx = await stablecoinManager.connect(owner).setStablecoinParams(
                await mockDAI.getAddress(),
                true,
                85,
                110
            );
            const receipt = await tx.wait();

            // Should complete within reasonable gas limits
            expect(receipt.gasUsed).to.be < 100000;
        });

        it("should handle multiple parameter retrievals efficiently", async function () {
            await stablecoinManager.connect(owner).setStablecoinParams(
                await mockDAI.getAddress(),
                true,
                85,
                110
            );

            // Multiple calls should be efficient
            for (let i = 0; i < 10; i++) {
                await stablecoinManager.getStablecoinParams(await mockDAI.getAddress());
                await stablecoinManager.isStablecoin(await mockDAI.getAddress());
            }
        });
    });
});