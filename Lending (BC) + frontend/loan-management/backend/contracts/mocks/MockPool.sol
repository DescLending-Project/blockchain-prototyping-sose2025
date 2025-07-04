// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockPool {
    function withdrawForLendingManager(uint256) external pure returns (bool) {
        return true;
    }

    receive() external payable {}
}
