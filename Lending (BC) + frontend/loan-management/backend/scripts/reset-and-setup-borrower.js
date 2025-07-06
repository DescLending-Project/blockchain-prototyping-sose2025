const { spawn } = require('child_process');
const path = require('path');

// Borrower private key and address (from setup-borrower-activity.js)
const borrowerPrivateKey = '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6';
const borrowerAddress = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';

function runScript(scriptPath) {
    return new Promise((resolve, reject) => {
        const script = spawn('node', [scriptPath], { stdio: 'inherit' });
        script.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`${scriptPath} exited with code ${code}`));
            } else {
                resolve();
            }
        });
    });
}

async function main() {
    console.log('\n==============================');
    console.log('Resetting Hardhat node and redeploying contracts...');
    console.log('==============================\n');
    await runScript(path.join(__dirname, 'automate-localhost-reset.js'));

    console.log('\n==============================');
    console.log('Setting up borrower activity...');
    console.log('==============================\n');
    await runScript(path.join(__dirname, 'setup-borrower-activity.js'));

    console.log('\n==============================');
    console.log('All done! Use the following account in MetaMask for borrower activity:');
    console.log('Address:   ' + borrowerAddress);
    console.log('Private Key:');
    console.log(borrowerPrivateKey);
    console.log('\n1. In MetaMask, import the above private key.');
    console.log('2. Make sure you are connected to the Hardhat localhost network.');
    console.log('3. Refresh the frontend.');
    console.log('You should now see borrower dashboard data!');
    console.log('==============================\n');
}

main().catch((err) => {
    console.error('❌ Automation failed:', err);
    process.exit(1);
}); 