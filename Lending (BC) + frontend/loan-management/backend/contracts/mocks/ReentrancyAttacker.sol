// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ILiquidityPoolV3 {
    function depositCollateral(address token, uint256 amount) external;
}

contract ReentrancyAttacker {
    ILiquidityPoolV3 public pool;
    address public token;
    bool public attackInProgress;

    constructor(address _pool, address _token) {
        pool = ILiquidityPoolV3(_pool);
        token = _token;
    }

    function attackDeposit(uint256 amount) external {
        attackInProgress = true;
        pool.depositCollateral(token, amount);
        attackInProgress = false;
    }

    // Fallback to attempt reentrancy
    fallback() external payable {
        if (attackInProgress) {
            // Try to reenter
            pool.depositCollateral(token, 1);
        }
    }

    receive() external payable {
        if (attackInProgress) {
            pool.depositCollateral(token, 1);
        }
    }
}
