const fs = require('fs');
const path = require('path');

// Function to fix common patterns in test files
function fixTestFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;

    // Pattern 1: Fix .getAddress() calls on signers (should be .address)
    const signerGetAddressPattern = /(owner|deployer|user\d*|addr\d*|borrower\d*|lender\d*)\.getAddress\(\)/g;
    const newContent1 = content.replace(signerGetAddressPattern, '$1.address');
    if (newContent1 !== content) {
        content = newContent1;
        changed = true;
    }

    // Pattern 2: Fix BigNumber .eq() comparisons to use === or .equal()
    const eqPattern = /expect\(([^)]+)\.eq\(([^)]+)\)\)\.to\.be\.true/g;
    const newContent2 = content.replace(eqPattern, 'expect($1).to.equal($2)');
    if (newContent2 !== content) {
        content = newContent2;
        changed = true;
    }

    // Pattern 3: Fix .toNumber() calls on BigInt values
    const toNumberPattern = /\.toNumber\(\)/g;
    const newContent3 = content.replace(toNumberPattern, '');
    if (newContent3 !== content) {
        content = newContent3;
        changed = true;
    }

    // Pattern 4: Fix BigNumber .gt() comparisons
    const gtPattern = /expect\(([^)]+)\.gt\(([^)]+)\)\)\.to\.be\.true/g;
    const newContent4 = content.replace(gtPattern, 'expect($1 > $2).to.be.true');
    if (newContent4 !== content) {
        content = newContent4;
        changed = true;
    }

    // Pattern 5: Fix contract .getAddress() calls (add await) - more comprehensive
    const contractGetAddressPattern = /(await\s+)?([a-zA-Z][a-zA-Z0-9]*(?:Token|Manager|Pool|Model|System|Governor|Verifier|Mock\w*|oracle\w*|risc\w*|credit\w*|liquidity\w*|lending\w*|stablecoin\w*|voting\w*|interest\w*))\.getAddress\(\)/gi;
    const newContent5 = content.replace(contractGetAddressPattern, (match, awaitKeyword, contractName) => {
        if (awaitKeyword) {
            return match; // Already has await
        }
        return `await ${contractName}.getAddress()`;
    });
    if (newContent5 !== content) {
        content = newContent5;
        changed = true;
    }

    // Pattern 6: Fix numeric comparisons with BigInt literals
    const numericComparisonPattern = /expect\(([^)]+)\)\.to\.equal\((\d+)\)/g;
    const newContent6 = content.replace(numericComparisonPattern, 'expect($1).to.equal($2n)');
    if (newContent6 !== content) {
        content = newContent6;
        changed = true;
    }

    // Pattern 7: Fix .revertedWith to .revertedWithCustomError for custom errors
    const revertedWithPattern = /\.to\.be\.revertedWith\("([^"]+)"\)/g;
    const newContent7 = content.replace(revertedWithPattern, '.to.be.revertedWithCustomError("$1")');
    if (newContent7 !== content) {
        content = newContent7;
        changed = true;
    }

    // Pattern 8: Fix ethers.toBigInt().from() calls
    const toBigIntPattern = /ethers\.toBigInt\(\)\s*\.from\(([^)]+)\)/g;
    const newContent8 = content.replace(toBigIntPattern, 'BigInt($1)');
    if (newContent8 !== content) {
        content = newContent8;
        changed = true;
    }

    // Pattern 9: Fix .mul() and .div() BigNumber operations
    const mulDivPattern = /(\w+)\.mul\(([^)]+)\)\.div\(([^)]+)\)/g;
    const newContent9 = content.replace(mulDivPattern, '($1 * $2) / $3');
    if (newContent9 !== content) {
        content = newContent9;
        changed = true;
    }

    // Pattern 10: Fix .sub() and .add() BigNumber operations
    const subPattern = /(\w+)\.sub\(([^)]+)\)/g;
    const newContent10 = content.replace(subPattern, '$1 - $2');
    if (newContent10 !== content) {
        content = newContent10;
        changed = true;
    }

    const addPattern = /(\w+)\.add\(([^)]+)\)/g;
    const newContent11 = content.replace(addPattern, '$1 + $2');
    if (newContent11 !== content) {
        content = newContent11;
        changed = true;
    }

    // Pattern 11: Fix .gt() and .lt() comparisons
    const gtLtPattern = /(\w+)\.(gt|lt)\(([^)]+)\)/g;
    const newContent12 = content.replace(gtLtPattern, (match, variable, operator, value) => {
        const op = operator === 'gt' ? '>' : '<';
        return `${variable} ${op} ${value}`;
    });
    if (newContent12 !== content) {
        content = newContent12;
        changed = true;
    }

    if (changed) {
        fs.writeFileSync(filePath, content);
        console.log(`Fixed patterns in ${path.basename(filePath)}`);
        return true;
    }
    return false;
}

// Main function to process all test files
function main() {
    const testDir = path.join(__dirname, 'test');
    
    if (!fs.existsSync(testDir)) {
        console.error('Test directory not found!');
        process.exit(1);
    }

    const testFiles = fs.readdirSync(testDir)
        .filter(file => file.endsWith('.test.js'))
        .map(file => path.join(testDir, file));
    
    let fixedCount = 0;
    
    testFiles.forEach(filePath => {
        if (fixTestFile(filePath)) {
            fixedCount++;
        }
    });
    
    console.log(`\nDone! Fixed patterns in ${fixedCount} files out of ${testFiles.length} total files.`);
}

if (require.main === module) {
    main();
}

module.exports = { fixTestFile };
