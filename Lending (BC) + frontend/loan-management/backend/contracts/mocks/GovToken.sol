// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../VotingToken.sol";

contract GovToken is VotingToken {
    constructor(address dao) VotingToken(dao) {}
}
