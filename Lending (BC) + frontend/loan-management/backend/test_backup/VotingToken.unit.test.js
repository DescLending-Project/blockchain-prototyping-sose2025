const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("GovToken (VotingToken)", function () {
    let votingToken, owner, addr1;

    beforeEach(async function () {
        [owner, addr1] = await ethers.getSigners();
        const VotingToken = await ethers.getContractFactory("VotingToken");
        votingToken = await VotingToken.deploy(owner.address); // Pass DAO address
        await votingToken.waitForDeployment();
    });

    it("prevents non-minters from minting", async function () {
        let reverted = false;
        try {
            await votingToken.connect(addr1).mint(addr1.address, 100);
        } catch (err) {
            reverted = true;
            expect(err.message).to.match(/missing role|AccessControl|revert|VM Exception/i);
        }
        expect(reverted).to.be.true;
    });
}); 