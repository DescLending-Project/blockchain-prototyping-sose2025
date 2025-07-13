const fs = require('fs');
const path = require('path');

// TODO: Replace with your deployment logic or import addresses from deployment output
const addresses = {
    GovToken: "0xYourGovTokenAddress",
    ProtocolGovernor: "0xYourGovernorAddress"
};

const dest = path.join(__dirname, '../../frontend/src/addresses.json');
fs.writeFileSync(dest, JSON.stringify(addresses, null, 2));
console.log('Updated frontend addresses.json'); 