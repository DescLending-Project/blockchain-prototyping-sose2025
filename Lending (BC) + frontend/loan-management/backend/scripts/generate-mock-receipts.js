const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const DEMO_TESTER_ADDRESS = "0x202CCe504e04bEd6fC0521238dDf04Bc9E8E15aB";
const CREDIT_SYSTEM_ADDRESS = "0x8198f5d8F8CfFE8f9C413d98a0A55aEB8ab9FbB7";

async function generateMockReceipts() {
    console.log(" Generating Mock Receipt.bin Files for Frontend Testing");
    console.log("=" .repeat(60));
    
    const [deployer, user] = await ethers.getSigners();
    console.log("User address:", user.address);
    
    // receipt.bin directory
    const receiptsDir = path.join(__dirname, "../receipts");
    const mockDir = path.join(receiptsDir, "mock");
    
    if (!fs.existsSync(receiptsDir)) fs.mkdirSync(receiptsDir);
    if (!fs.existsSync(mockDir)) fs.mkdirSync(mockDir);
    
    // Get DemoTester contract
    const demoTester = await ethers.getContractAt("DemoTester", DEMO_TESTER_ADDRESS);
    
    console.log("\n Generating mock proofs...");
    
    // Generate Account Proof
    console.log("\n Generating Account Proof Receipt...");
    try {
        const [accountSeal, accountJournal] = await demoTester.connect(user).generateAccountProof();
        
        const accountReceipt = {
            seal: Array.from(accountSeal), // Convert bytes to array
            journal: Array.from(accountJournal),
            metadata: {
                proofType: "account",
                imageId: "0xb083f461f1de589187ceac04a9eb2c0fd7c99b8c80f4ed3f3d45963c8b9606bf",
                user: user.address,
                timestamp: Date.now(),
                note: "Mock account proof for frontend testing"
            }
        };
        
        // Save as .bin file (binary format)
        const accountBinPath = path.join(mockDir, "account_receipt.bin");
        fs.writeFileSync(accountBinPath, Buffer.from(accountSeal));
        
        // Save as .json for debugging
        const accountJsonPath = path.join(mockDir, "account_receipt.json");
        fs.writeFileSync(accountJsonPath, JSON.stringify(accountReceipt, null, 2));
        
        console.log(" Account receipt saved:");
        console.log(`    Binary: ${accountBinPath}`);
        console.log(`    JSON:   ${accountJsonPath}`);
        console.log(`    Size:   ${accountSeal.length} bytes`);
        
    } catch (error) {
        console.log(" Account proof generation failed:", error.message);
    }
    
    // Generate TradFi Proof
    console.log("\n Generating TradFi Proof Receipt...");
    try {
        const creditScore = 750;
        const [tradfiSeal, tradfiJournal] = await demoTester.connect(user).generateTradFiProof(creditScore);
        
        const tradfiReceipt = {
            seal: Array.from(tradfiSeal),
            journal: Array.from(tradfiJournal),
            metadata: {
                proofType: "tradfi",
                imageId: "0x81c6f5d0702b3a373ce771febb63581ed62fbd6ff427e4182bb827144e4a4c4c",
                creditScore: creditScore,
                user: user.address,
                timestamp: Date.now(),
                note: "Mock TradFi proof for frontend testing"
            }
        };
        
        const tradfiBinPath = path.join(mockDir, "tradfi_receipt.bin");
        fs.writeFileSync(tradfiBinPath, Buffer.from(tradfiSeal));
        
        const tradfiJsonPath = path.join(mockDir, "tradfi_receipt.json");
        fs.writeFileSync(tradfiJsonPath, JSON.stringify(tradfiReceipt, null, 2));
        
        console.log(" TradFi receipt saved:");
        console.log(`    Binary: ${tradfiBinPath}`);
        console.log(`    JSON:   ${tradfiJsonPath}`);
        console.log(`    Size:   ${tradfiSeal.length} bytes`);
        
    } catch (error) {
        console.log(" TradFi proof generation failed:", error.message);
    }
    
    // Generate Nesting Proof
    console.log("\n Generating Nesting Proof Receipt...");
    try {
        const creditScore = 750;
        const [nestingSeal, nestingJournal] = await demoTester.connect(user).generateNestingProof(creditScore);
        
        const nestingReceipt = {
            seal: Array.from(nestingSeal),
            journal: Array.from(nestingJournal),
            metadata: {
                proofType: "nesting",
                imageId: "0xc5f84dae4b65b7ddd4591d0a119bcfb84fec97156216be7014ff03e1ff8f380e",
                creditScore: creditScore,
                user: user.address,
                timestamp: Date.now(),
                note: "Mock nesting proof for frontend testing"
            }
        };
        
        const nestingBinPath = path.join(mockDir, "nesting_receipt.bin");
        fs.writeFileSync(nestingBinPath, Buffer.from(nestingSeal));
        
        const nestingJsonPath = path.join(mockDir, "nesting_receipt.json");
        fs.writeFileSync(nestingJsonPath, JSON.stringify(nestingReceipt, null, 2));
        
        console.log(" Nesting receipt saved:");
        console.log(`    Binary: ${nestingBinPath}`);
        console.log(`    JSON:   ${nestingJsonPath}`);
        console.log(`    Size:   ${nestingSeal.length} bytes`);
        
    } catch (error) {
        console.log("Nesting proof generation failed:", error.message);
    }
    
    // Generate sample journal data files
    console.log("\n Generating Sample Journal Data...");
    
    const sampleJournalData = {
        account: {
            account: user.address,
            nonce: 150,
            balance: "2500000000000000000", // 2.5 ETH in wei
            storageRoot: "0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421",
            codeHash: "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
            blockNumber: 123456,
            stateRoot: "0xe717d168d366b01f6edddc3554333c5b63afaedb34edd210f425b7334c251764"
        },
        tradfi: {
            creditScore: "750",
            dataSource: "experian.com",
            reportDate: "2024-01-15",
            accountAge: "5",
            paymentHistory: "excellent"
        },
        nesting: {
            account: user.address,
            defiScore: 85,
            tradfiScore: 750,
            hybridScore: 82,
            timestamp: Math.floor(Date.now() / 1000)
        }
    };
    
    const journalPath = path.join(mockDir, "sample_journal_data.json");
    fs.writeFileSync(journalPath, JSON.stringify(sampleJournalData, null, 2));
    console.log(`Sample journal data saved: ${journalPath}`);
    
    // Create a README file
    const readmePath = path.join(mockDir, "README.md");
    const readmeContent = `# Mock RISC0 Receipt Files


- Generated for user: ${user.address}
- Generated at: ${new Date().toISOString()}


`;
    
    fs.writeFileSync(readmePath, readmeContent);
    //console.log(` README created: ${readmePath}`);
    
    console.log("\n Mock Receipt Generation Complete!");
    console.log("=" .repeat(60));
    console.log(" All files saved in:", mockDir);
    console.log("\n  --- Next Steps: ---");
    console.log("receipt.bin files go to frontend public/receipts folder");
    console.log("demo mode must be enabled!!");
    
    console.log("\n Frontend Integration:");
    console.log("use journal data from sample_journal_data.json");
    
    return {
        receiptsGenerated: 3,
        mockDirectory: mockDir,
        userAddress: user.address
    };
}

// Helper function to copy files to frontend
async function copyToFrontend() {
    const frontendPublicPath = path.join(__dirname, "../../frontend/public/receipts");
    const mockDir = path.join(__dirname, "../receipts/mock");
    
    if (fs.existsSync(frontendPublicPath)) {
        console.log(" Copying mock receipts to frontend...");
        
        // Copy .bin files
        const files = ['account_receipt.bin', 'tradfi_receipt.bin', 'nesting_receipt.bin', 'sample_journal_data.json'];
        
        for (const file of files) {
            const srcPath = path.join(mockDir, file);
            const destPath = path.join(frontendPublicPath, file);
            
            if (fs.existsSync(srcPath)) {
                fs.copyFileSync(srcPath, destPath);
                console.log(`✅ Copied ${file} to frontend`);
            }
        }
        
        console.log(" Frontend files ready for testing!");
    } else {
        console.log("  Frontend public/receipts directory not found");
        console.log("   Create it manually and copy the files from receipts/mock/");
    }
}

async function main() {
    try {
        const result = await generateMockReceipts();
        
        // Optionally copy to frontend
        await copyToFrontend();
        
        console.log("\n Mock receipt generation completed successfully!");
        return result;
        
    } catch (error) {
        console.error("❌ Mock receipt generation failed:", error.message);
        throw error;
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { generateMockReceipts, copyToFrontend };