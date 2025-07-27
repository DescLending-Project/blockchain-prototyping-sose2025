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
        timeout: 600000
    },
    providerOptions: {
        default_balance_ether: 10000,
        gasLimit: 0xfffffffffff,
        gasPrice: 0x01
    },
    measureStatementCoverage: true,
    measureFunctionCoverage: true,
    testfiles: "./test/simple.coverage.test.js"
}; 
