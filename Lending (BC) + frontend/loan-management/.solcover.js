module.exports = {
    skipFiles: [
        "backend/contracts/mocks/",
        "backend/contracts/interfaces/",
        "backend/contracts/test/",
        "backend/contracts/libraries/",
        "backend/contracts/verifiers/",
        "backend/contracts/ProtocolGovernor.sol",
        "backend/contracts/DemoTester.sol",
        "backend/contracts/SimpleRISC0Test.sol",
        "backend/contracts/MockRiscZeroVerifier.sol"
    ],
    mocha: {
        timeout: 600000,
        grep: "ProtocolGovernor|Integration|Coverage Expansion",
        invert: true
    },
    providerOptions: {
        default_balance_ether: 10000,
        gasLimit: 0xfffffffffff,
        gasPrice: 0x01
    },
    measureStatementCoverage: false,
    measureFunctionCoverage: true
};
