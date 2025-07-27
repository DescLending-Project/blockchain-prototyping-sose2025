module.exports = {
    skipFiles: [
        "mocks/",
        "interfaces/",
        "test/",
        "libraries/",
        "verifiers/",
        "ProtocolGovernor.sol",
        "DemoTester.sol",
        "SimpleRISC0Test.sol",
        "MockRiscZeroVerifier.sol"
    ],
    silent: false,
    istanbulReporter: ['text', 'html'],
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
    measureStatementCoverage: true,
    measureFunctionCoverage: true,
    configureYulOptimizer: true,
    solcOptimizerDetails: {
        enabled: true,
        runs: 200,
        details: {
            yul: true
        }
    }
}; 
