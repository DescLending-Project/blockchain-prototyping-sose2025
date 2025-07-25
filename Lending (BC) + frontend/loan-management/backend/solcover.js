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
    istanbulReporter: ['text'],
    mocha: {
        timeout: 600000
    }
}; 
