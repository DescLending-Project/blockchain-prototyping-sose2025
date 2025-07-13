const fs = require('fs');
const path = require('path');

const contracts = ['GovToken', 'ProtocolGovernor'];
const srcDir = path.join(__dirname, '../../artifacts/backend/contracts');
const destDir = path.join(__dirname, '../../frontend/src/abis');

if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

contracts.forEach(name => {
    const artifact = path.join(srcDir, `${name}.sol/${name}.json`);
    if (fs.existsSync(artifact)) {
        fs.copyFileSync(artifact, path.join(destDir, `${name}.json`));
        console.log(`Copied ${name} ABI`);
    } else {
        console.warn(`Artifact not found: ${artifact}`);
    }
}); 