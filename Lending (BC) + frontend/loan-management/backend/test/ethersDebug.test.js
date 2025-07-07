const { ethers } = require("hardhat");
describe("Ethers Debug", function () {
    it("should have ethers.parseUnits defined", function () {
        if (!ethers.parseUnits) {
            throw new Error("ethers.parseUnits is undefined");
        }
    });
}); 