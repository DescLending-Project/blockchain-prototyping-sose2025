// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockInterestRateModel {
    function getInterestRate() external pure returns (uint256) {
        return 1000150000000000000;
    }
}
