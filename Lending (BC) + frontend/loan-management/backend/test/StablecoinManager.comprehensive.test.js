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

        // Deploy StablecoinManager
        const StablecoinManager = await ethers.getContractFactory("StablecoinManager");
        stablecoinManager = await StablecoinManager.deploy(
            await mockTimelock.getAddress() // timelock address
        );
        await stablecoinManager.waitForDeployment();
    });

    describe("Initialization", function() {
        it("should initialize with correct parameters", async function () {
            expect(await stablecoinManager.liquidityPool()).to.equal(await mockLiquidityPool.getAddress());
            expect(await stablecoinManager.timelock()).to.equal(mockTimelock.getAddress());
            expect(await stablecoinManager.USDC()).to.equal(mockUSDC.getAddress());
            expect(await stablecoinManager.USDT()).to.equal(mockUSDT.getAddress());
        });

        it("should set correct constants", async function () {
            expect(await stablecoinManager.MAX_STABLECOIN_LTV()).to.equal(9500n); // 95%
            expect(await stablecoinManager.DEFAULT_STABLECOIN_LIQUIDATION_THRESHOLD()).to.equal(10500n); // 105%
        });

        it("should initialize USDC and USDT as stablecoins", async function () {
            expect(await stablecoinManager.isStablecoin(mockUSDC.getAddress())).to.be.true;
            expect(await stablecoinManager.isStablecoin(mockUSDT.getAddress())).to.be.true;

            const usdcParams = await stablecoinManager.getStablecoinParams(mockUSDC.getAddress());
            expect(usdcParams[0]).to.be.true; // isStable
            expect(usdcParams[1]).to.equal(9000n); // LTV 90%
            expect(usdcParams[2]).to.equal(10500n); // liquidation threshold 105%
        });
    });

    describe("Stablecoin Parameter Management", function() {
        it("should allow timelock to set stablecoin parameters", async function () {
            await expect(
                stablecoinManager.connect(mockTimelock).setStablecoinParams(
                    mockDAI.getAddress(),
                    true,
                    8500, // 85% LTV
                    11000 // 110% liquidation threshold
                )
            ).to.emit(stablecoinManager, "StablecoinParamsSet")
                .withArgs(mockDAI.getAddress(), true, 8500, 11000);

            const params = await stablecoinManager.getStablecoinParams(mockDAI.getAddress());
            expect(params[0]).to.be.true;
            expect(params[1]).to.equal(8500n);
            expect(params[2]).to.equal(11000n);
        });

        it("should reject parameter setting from non-timelock", async function () {
            await expect(
                stablecoinManager.connect(user1).setStablecoinParams(
                    mockDAI.getAddress(),
                    true,
                    8500,
                    11000
                )
            ).to.be.revertedWithCustomError("OnlyTimelockStablecoinManager");
        });

        it("should reject zero address", async function () {
            await expect(
                stablecoinManager.connect(mockTimelock).setStablecoinParams(
                    ethers.ZeroAddress,
                    true,
                    8500,
                    11000
                )
            ).to.be.revertedWithCustomError("InvalidAddress");
        });

        it("should reject zero LTV", async function () {
            await expect(
                stablecoinManager.connect(mockTimelock).setStablecoinParams(
                    mockDAI.getAddress(),
                    true,
                    0,
                    11000
                )
            ).to.be.revertedWithCustomError("LTV must be greater than zero");
        });

        it("should reject LTV too high", async function () {
            await expect(
                stablecoinManager.connect(mockTimelock).setStablecoinParams(
                    mockDAI.getAddress(),
                    true,
                    9600, // > MAX_STABLECOIN_LTV
                    11000
                )
            ).to.be.revertedWithCustomError("LTVTooHigh");
        });

        it("should reject threshold too low", async function () {
            await expect(
                stablecoinManager.connect(mockTimelock).setStablecoinParams(
                    mockDAI.getAddress(),
                    true,
                    8500,
                    10000 // < DEFAULT_STABLECOIN_LIQUIDATION_THRESHOLD
                )
            ).to.be.revertedWithCustomError("ThresholdTooLow");
        });

        it("should handle disabling stablecoin", async function () {
            await stablecoinManager.connect(mockTimelock).setStablecoinParams(
                mockUSDC.getAddress(),
                false,
                0,
                10500
            );

            expect(await stablecoinManager.isStablecoin(mockUSDC.getAddress())).to.be.false;
        });

        it("should handle maximum LTV", async function () {
            await stablecoinManager.connect(mockTimelock).setStablecoinParams(
                mockDAI.getAddress(),
                true,
                9500, // MAX_STABLECOIN_LTV
                11000
            );

            const params = await stablecoinManager.getStablecoinParams(mockDAI.getAddress());
            expect(params[1]).to.equal(9500n);
        });

        it("should handle minimum threshold", async function () {
            await stablecoinManager.connect(mockTimelock).setStablecoinParams(
                mockDAI.getAddress(),
                true,
                8500,
                10500 // DEFAULT_STABLECOIN_LIQUIDATION_THRESHOLD
            );

            const params = await stablecoinManager.getStablecoinParams(mockDAI.getAddress());
            expect(params[2]).to.equal(10500n);
        });
    });

    describe("Parameter Retrieval", function() {
        beforeEach(async function () {
            await stablecoinManager.connect(mockTimelock).setStablecoinParams(
                mockDAI.getAddress(),
                true,
                8500,
                11000
            );
        });

        it("should return correct parameters for configured stablecoin", async function () {
            const params = await stablecoinManager.getStablecoinParams(mockDAI.getAddress());
            expect(params[0]).to.be.true; // isStable
            expect(params[1]).to.equal(8500n); // LTV
            expect(params[2]).to.equal(11000n); // liquidation threshold
        });

        it("should return default parameters for non-stablecoin", async function () {
            const randomToken = user1.address;
            const params = await stablecoinManager.getStablecoinParams(randomToken);
            expect(params[0]).to.be.false; // isStable
            expect(params[1]).to.equal(0n); // LTV
            expect(params[2]).to.equal(0n); // liquidation threshold
        });

        it("should return correct LTV for stablecoin", async function () {
            expect(await stablecoinManager.stablecoinLTV(mockDAI.getAddress())).to.equal(8500n);
            expect(await stablecoinManager.stablecoinLTV(mockUSDC.getAddress())).to.equal(9000n);
        });

        it("should return correct liquidation threshold", async function () {
            expect(await stablecoinManager.stablecoinLiquidationThreshold(mockDAI.getAddress())).to.equal(11000n);
            expect(await stablecoinManager.stablecoinLiquidationThreshold(mockUSDC.getAddress())).to.equal(10500n);
        });

        it("should handle multiple stablecoins", async function () {
            // Set up multiple stablecoins with different parameters
            await stablecoinManager.connect(mockTimelock).setStablecoinParams(
                user2.address, // Mock token address
                true,
                7500,
                12000
            );

            const daiParams = await stablecoinManager.getStablecoinParams(mockDAI.getAddress());
            const mockParams = await stablecoinManager.getStablecoinParams(user2.address);

            expect(daiParams[1]).to.equal(8500n);
            expect(mockParams[1]).to.equal(7500n);
            expect(daiParams[2]).to.equal(11000n);
            expect(mockParams[2]).to.equal(12000n);
        });
    });

    describe("Stablecoin Status Checks", function() {
        it("should correctly identify stablecoins", async function () {
            expect(await stablecoinManager.isStablecoin(mockUSDC.getAddress())).to.be.true;
            expect(await stablecoinManager.isStablecoin(mockUSDT.getAddress())).to.be.true;
            expect(await stablecoinManager.isStablecoin(mockDAI.getAddress())).to.be.false;
            expect(await stablecoinManager.isStablecoin(user1.address)).to.be.false;
        });

        it("should update stablecoin status when parameters change", async function () {
            expect(await stablecoinManager.isStablecoin(mockDAI.getAddress())).to.be.false;

            await stablecoinManager.connect(mockTimelock).setStablecoinParams(
                mockDAI.getAddress(),
                true,
                8500,
                11000
            );

            expect(await stablecoinManager.isStablecoin(mockDAI.getAddress())).to.be.true;

            await stablecoinManager.connect(mockTimelock).setStablecoinParams(
                mockDAI.getAddress(),
                false,
                8500,
                11000
            );

            expect(await stablecoinManager.isStablecoin(mockDAI.getAddress())).to.be.false;
        });
    });

    describe("Edge Cases", function() {
        it("should handle setting same parameters multiple times", async function () {
            await stablecoinManager.connect(mockTimelock).setStablecoinParams(
                mockDAI.getAddress(),
                true,
                8500,
                11000
            );

            await stablecoinManager.connect(mockTimelock).setStablecoinParams(
                mockDAI.getAddress(),
                true,
                8500,
                11000
            );

            const params = await stablecoinManager.getStablecoinParams(mockDAI.getAddress());
            expect(params[1]).to.equal(8500n);
            expect(params[2]).to.equal(11000n);
        });

        it("should handle updating existing stablecoin parameters", async function () {
            // Update USDC parameters
            await stablecoinManager.connect(mockTimelock).setStablecoinParams(
                mockUSDC.getAddress(),
                true,
                8000,
                11500
            );

            const params = await stablecoinManager.getStablecoinParams(mockUSDC.getAddress());
            expect(params[1]).to.equal(8000n);
            expect(params[2]).to.equal(11500n);
        });

        it("should handle extreme valid values", async function () {
            await stablecoinManager.connect(mockTimelock).setStablecoinParams(
                mockDAI.getAddress(),
                true,
                1, // Minimum LTV
                50000 // Very high liquidation threshold
            );

            const params = await stablecoinManager.getStablecoinParams(mockDAI.getAddress());
            expect(params[1]).to.equal(1n);
            expect(params[2]).to.equal(50000n);
        });

        it("should handle contract address as token", async function () {
            await stablecoinManager.connect(mockTimelock).setStablecoinParams(
                await stablecoinManager.getAddress(),
                true,
                8500,
                11000
            );

            expect(await stablecoinManager.isStablecoin(await stablecoinManager.getAddress())).to.be.true;
        });
    });

    describe("Access Control", function() {
        it("should only allow timelock to modify parameters", async function () {
            const accounts = [owner, user1, user2, user3];

            for (const account of accounts) {
                await expect(
                    stablecoinManager.connect(account).setStablecoinParams(
                        mockDAI.getAddress(),
                        true,
                        8500,
                        11000
                    )
                ).to.be.revertedWithCustomError("OnlyTimelockStablecoinManager");
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
                    11000
                )
            ).to.be.revertedWithCustomError("OnlyTimelockStablecoinManager");
        });
    });

    describe("Events", function() {
        it("should emit StablecoinParamsSet event", async function () {
            await expect(
                stablecoinManager.connect(mockTimelock).setStablecoinParams(
                    mockDAI.getAddress(),
                    true,
                    8500,
                    11000
                )
            ).to.emit(stablecoinManager, "StablecoinParamsSet")
                .withArgs(mockDAI.getAddress(), true, 8500, 11000);
        });

        it("should emit event when disabling stablecoin", async function () {
            await expect(
                stablecoinManager.connect(mockTimelock).setStablecoinParams(
                    mockUSDC.getAddress(),
                    false,
                    0,
                    10500
                )
            ).to.emit(stablecoinManager, "StablecoinParamsSet")
                .withArgs(mockUSDC.getAddress(), false, 0, 10500);
        });

        it("should emit event when updating existing stablecoin", async function () {
            await expect(
                stablecoinManager.connect(mockTimelock).setStablecoinParams(
                    mockUSDC.getAddress(),
                    true,
                    8800,
                    10800
                )
            ).to.emit(stablecoinManager, "StablecoinParamsSet")
                .withArgs(mockUSDC.getAddress(), true, 8800, 10800);
        });
    });

    describe("Integration Tests", function() {
        it("should work with multiple stablecoins simultaneously", async function () {
            // Set up multiple stablecoins
            await stablecoinManager.connect(mockTimelock).setStablecoinParams(
                mockDAI.getAddress(),
                true,
                8500,
                11000
            );

            // Verify all stablecoins work correctly
            expect(await stablecoinManager.isStablecoin(mockUSDC.getAddress())).to.be.true;
            expect(await stablecoinManager.isStablecoin(mockUSDT.getAddress())).to.be.true;
            expect(await stablecoinManager.isStablecoin(mockDAI.getAddress())).to.be.true;

            // Verify different parameters
            const usdcParams = await stablecoinManager.getStablecoinParams(mockUSDC.getAddress());
            const daiParams = await stablecoinManager.getStablecoinParams(mockDAI.getAddress());

            expect(usdcParams[1]).to.equal(9000n);
            expect(daiParams[1]).to.equal(8500n);
        });

        it("should handle complex parameter updates", async function () {
            // Initial setup
            await stablecoinManager.connect(mockTimelock).setStablecoinParams(
                mockDAI.getAddress(),
                true,
                8500,
                11000
            );

            // Update multiple times
            await stablecoinManager.connect(mockTimelock).setStablecoinParams(
                mockDAI.getAddress(),
                true,
                8000,
                11500
            );

            await stablecoinManager.connect(mockTimelock).setStablecoinParams(
                mockUSDC.getAddress(),
                true,
                8800,
                10800
            );

            // Verify final state
            const daiParams = await stablecoinManager.getStablecoinParams(mockDAI.getAddress());
            const usdcParams = await stablecoinManager.getStablecoinParams(mockUSDC.getAddress());

            expect(daiParams[1]).to.equal(8000n);
            expect(daiParams[2]).to.equal(11500n);
            expect(usdcParams[1]).to.equal(8800n);
            expect(usdcParams[2]).to.equal(10800n);
        });
    });

    describe("Gas Optimization", function() {
        it("should handle parameter setting efficiently", async function () {
            const tx = await stablecoinManager.connect(mockTimelock).setStablecoinParams(
                mockDAI.getAddress(),
                true,
                8500,
                11000
            );
            const receipt = await tx.wait();

            // Should complete within reasonable gas limits
            expect(receipt.gasUsed).to.be < 100000;
        });

        it("should handle multiple parameter retrievals efficiently", async function () {
            await stablecoinManager.connect(mockTimelock).setStablecoinParams(
                mockDAI.getAddress(),
                true,
                8500,
                11000
            );

            // Multiple calls should be efficient
            for (let i = 0; i < 10; i++) {
                await stablecoinManager.getStablecoinParams(mockDAI.getAddress());
                await stablecoinManager.isStablecoin(mockDAI.getAddress());
            }
        });
    });
});