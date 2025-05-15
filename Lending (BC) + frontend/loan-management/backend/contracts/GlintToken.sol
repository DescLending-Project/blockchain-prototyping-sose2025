// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// a simple ERC20 token that can be used to deposit as collateral

contract GlintToken is ERC20 {
    constructor(uint256 initialSupply) ERC20("Glint Token", "GLINT") {
        _mint(msg.sender, initialSupply);
    }
}
