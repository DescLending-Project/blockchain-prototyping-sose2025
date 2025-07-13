// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IGovToken {
    function mint(address to, uint256 amount) external;

    function balanceOf(address account) external view returns (uint256);
}
