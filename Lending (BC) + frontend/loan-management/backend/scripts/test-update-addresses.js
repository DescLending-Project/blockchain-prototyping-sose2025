const { updateAppAddresses } = require('./update-app-addresses.js');

// Test data
const testDeploymentData = {
    liquidityPoolV3Address: '0x1234567890123456789012345678901234567890',
    glintTokenAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    usdcTokenAddress: '0x1111111111111111111111111111111111111111',
    usdtTokenAddress: '0x2222222222222222222222222222222222222222'
};

console.log('Testing address update functionality...');

const success = updateAppAddresses(testDeploymentData, 'sepolia');

if (success) {
    console.log('Test completed successfully!');
    console.log('App.jsx has been updated with test addresses');
    console.log('Remember to revert the changes if this was just a test');
} else {
    console.log('Test failed!');
} 