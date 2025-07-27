// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockTimelock {
    address public admin;

    constructor() {
        admin = msg.sender;
    }

    function execute(
        address target,
        uint256 value,
        bytes calldata data,
        bytes32 predecessor,
        bytes32 salt
    ) external payable {
        (bool success, ) = target.call{value: value}(data);
        require(success, "MockTimelock: execution failed");
    }

    function schedule(
        address target,
        uint256 value,
        bytes calldata data,
        bytes32 predecessor,
        bytes32 salt,
        uint256 delay
    ) external {
        // Mock implementation - just emit an event or do nothing
    }

    function cancel(bytes32 id) external {
        // Mock implementation
    }

    function getMinDelay() external pure returns (uint256) {
        return 0;
    }

    function isOperation(bytes32 id) external pure returns (bool) {
        return true;
    }

    function isOperationPending(bytes32 id) external pure returns (bool) {
        return false;
    }

    function isOperationReady(bytes32 id) external pure returns (bool) {
        return true;
    }

    function isOperationDone(bytes32 id) external pure returns (bool) {
        return false;
    }

    function getTimestamp(bytes32 id) external view returns (uint256) {
        return block.timestamp;
    }

    function hashOperation(
        address target,
        uint256 value,
        bytes calldata data,
        bytes32 predecessor,
        bytes32 salt
    ) external pure returns (bytes32) {
        return keccak256(abi.encode(target, value, data, predecessor, salt));
    }

    function hashOperationBatch(
        address[] calldata targets,
        uint256[] calldata values,
        bytes[] calldata payloads,
        bytes32 predecessor,
        bytes32 salt
    ) external pure returns (bytes32) {
        return
            keccak256(abi.encode(targets, values, payloads, predecessor, salt));
    }
}
