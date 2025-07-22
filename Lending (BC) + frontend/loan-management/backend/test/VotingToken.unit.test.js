const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("GovToken (VotingToken)", function () {
    let govToken, owner, addr1, addr2;
    beforeEach(async function () {
        [owner, addr1, addr2] = await ethers.getSigners();
        const GovToken = await ethers.getContractFactory("GovToken");
        govToken = await GovToken.deploy(owner.address);
        await govToken.deployed();
    });
    it("deploys with correct DAO address", async function () {
        expect(await govToken.dao()).to.equal(owner.address);
        expect((await govToken.nextTokenId()).eq(1)).to.be.true;
    });
    it("allows MINTER_ROLE to mint tokens", async function () {
        await govToken.mint(addr1.address, 2);
        expect((await govToken.balanceOf(addr1.address)).eq(2)).to.be.true;
        expect((await govToken.nextTokenId()).eq(3)).to.be.true;
    });
    it("prevents non-minters from minting", async function () {
        let reverted = false;
        try {
            await govToken.connect(addr1).mint(addr2.address, 1);
        } catch (err) {
            reverted = true;
            // Print actual error for debugging
            if (!/missing role|AccessControl/i.test(err.message)) {
                console.error('Unexpected error message:', err.message);
            }
            expect(err.message).to.match(/missing role|AccessControl/i);
        }
        expect(reverted).to.be.true;
    });
    it("prevents transfer of tokens (soulbound)", async function () {
        await govToken.mint(addr1.address, 1);
        let reverted = false;
        try {
            await govToken.connect(addr1).transferFrom(addr1.address, addr2.address, 1);
        } catch (err) {
            reverted = true;
            expect(err.message).to.match(/soulbound/i);
        }
        expect(reverted).to.be.true;
    });
    it("getVotes returns correct balance", async function () {
        await govToken.mint(addr1.address, 3);
        expect((await govToken.getVotes(addr1.address)).eq(3)).to.be.true;
    });
    it("should only allow admin to setDAO", async function () {
        let reverted = false;
        try {
            await govToken.connect(addr1).setDAO(addr2.address);
        } catch (err) {
            reverted = true;
            expect(err.message).to.match(/revert/i);
        }
        expect(reverted).to.be.true;
        const tx = await govToken.setDAO(addr2.address);
        const receipt = await tx.wait();
        const found = receipt.events && receipt.events.some(e => e.event && e.event.toLowerCase().includes("dao"));
        expect(found).to.be.true;
        expect(await govToken.dao()).to.equal(addr2.address);
    });
    it("should support ERC721 and AccessControl interfaces", async function () {
        const erc721 = "0x80ac58cd";
        const access = "0x7965db0b";
        expect(await govToken.supportsInterface(erc721)).to.be.true;
        expect(await govToken.supportsInterface(access)).to.be.true;
    });
    it("should revert on transferFrom even by admin", async function () {
        await govToken.mint(addr1.address, 1);
        let reverted = false;
        try {
            await govToken.transferFrom(addr1.address, addr2.address, 1);
        } catch (err) {
            reverted = true;
            expect(err.message).to.match(/soulbound/i);
        }
        expect(reverted).to.be.true;
    });
    it("should revert on mint to zero address", async function () {
        let reverted = false;
        try {
            await govToken.mint(ethers.constants.AddressZero, 1);
        } catch (err) {
            reverted = true;
            expect(err.message).to.match(/invalid address/i);
        }
        expect(reverted).to.be.true;
    });
}); 