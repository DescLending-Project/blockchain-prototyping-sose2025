// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract OracleMock {
    int256 public answer;
    uint256 public updatedAt;

    function setLatestRoundData(int256 _answer, uint256 _updatedAt) external {
        answer = _answer;
        updatedAt = _updatedAt;
    }

    function latestRoundData()
        external
        view
        returns (uint80, int256, uint256, uint256, uint80)
    {
        return (0, answer, 0, updatedAt, 0);
    }
}
