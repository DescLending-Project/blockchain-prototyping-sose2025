// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockInterestRateModel {
    function getCurrentRates(
        uint256,
        uint256
    ) external pure returns (uint256, uint256) {
        return (1e18, 1000130400000000000); // borrowRate, supplyRate: ~5% APY daily
    }
}
