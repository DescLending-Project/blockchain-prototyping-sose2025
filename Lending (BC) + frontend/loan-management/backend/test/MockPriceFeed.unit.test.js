const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MockPriceFeed - Unit", function () {
    let feed;
    beforeEach(async function () {
        const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
        feed = await MockPriceFeed.deploy(12345, 8);
        await feed.waitForDeployment();
    });
    it("should return correct decimals", async function () {
        expect(await feed.decimals()).to.equal(8);
    });
    it("should return correct description", async function () {
        expect(await feed.description()).to.equal("MockPriceFeed");
    });
    it("should return correct version", async function () {
        expect(await feed.version()).to.equal(1);
    });
    it("should return correct latestRoundData", async function () {
        const data = await feed.latestRoundData();
        expect(data[1]).to.equal(12345);
    });
    it("should return correct getRoundData", async function () {
        const data = await feed.getRoundData(0);
        expect(data[1]).to.equal(12345);
    });
    it("should allow setPrice and reflect in latestRoundData", async function () {
        await feed.setPrice(54321);
        const data = await feed.latestRoundData();
        expect(data[1]).to.equal(54321);
    });
}); 