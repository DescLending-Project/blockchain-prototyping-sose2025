// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockPool {
    address private _irm;

    function setInterestRateModel(address irm) external {
        _irm = irm;
    }

    function withdrawForLendingManager(uint256) external pure returns (bool) {
        return true;
    }

    // Add all view functions LendingManager expects
    function totalLent() external pure returns (uint256) {
        return 100 ether;
    }

    function totalBorrowedAllTime() external pure returns (uint256) {
        return 50 ether;
    }

    function totalRepaidAllTime() external pure returns (uint256) {
        return 25 ether;
    }

    function interestRateModel() external view returns (address) {
        return _irm;
    }

    receive() external payable {}
}
