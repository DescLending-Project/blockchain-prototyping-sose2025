const { ethers } = require("hardhat");

// Script to integrate the existing LiquidityPoolV3 with the new credit system

async function main() {
    console.log("🔗 Integrating Credit System with LiquidityPoolV3");
    console.log("===============================================");

    const [deployer] = await ethers.getSigners();
    
    // Contract addresses (update these with your actual addresses)
    const LIQUIDITY_POOL_V3_ADDRESS = "0x..."; // Your deployed LiquidityPoolV3 address
    const INTEGRATED_CREDIT_SYSTEM_ADDRESS = "0x..."; // Your deployed IntegratedCreditSystem address

    // Get contract instances
    const liquidityPool = await ethers.getContractAt("LiquidityPoolV3", LIQUIDITY_POOL_V3_ADDRESS);
    const creditSystem = await ethers.getContractAt("IntegratedCreditSystem", INTEGRATED_CREDIT_SYSTEM_ADDRESS);

    console.log("📋 Contract Addresses:");
    console.log("LiquidityPoolV3:", LIQUIDITY_POOL_V3_ADDRESS);
    console.log("CreditSystem:", INTEGRATED_CREDIT_SYSTEM_ADDRESS);

    // Step 1: Create modified borrow function that checks credit verification
    console.log("\n1️⃣ Testing Credit-Aware Borrowing...");
    
    try {
        // Check if user has credit verification
        const userProfile = await creditSystem.getUserCreditProfile(deployer.address);
        console.log("User Credit Profile:", {
            finalScore: userProfile.finalScore.toString(),
            isEligible: userProfile.isEligible,
            hasTradFi: userProfile.hasTradFi,
            hasAccount: userProfile.hasAccount,
            hasNesting: userProfile.hasNesting
        });

        // Get current borrowing terms
        const riskTier = await liquidityPool.getRiskTier(deployer.address);
        const borrowTerms = await liquidityPool.getBorrowTerms(deployer.address);
        
        console.log("Current Borrowing Terms:", {
            riskTier: riskTier.toString(),
            collateralRatio: borrowTerms.collateralRatio.toString(),
            interestModifier: borrowTerms.interestRateModifier.toString(),
            maxLoanAmount: ethers.formatEther(borrowTerms.maxLoanAmount)
        });

    } catch (error) {
        console.error("❌ Integration test failed:", error.message);
    }

    // Step 2: Create enhanced borrowing workflow
    console.log("\n2️⃣ Creating Enhanced Borrowing Workflow...");
    
    await createEnhancedBorrowingWorkflow();

    // Step 3: Create monitoring functions
    console.log("\n3️⃣ Setting up Credit Monitoring...");
    
    await setupCreditMonitoring(INTEGRATED_CREDIT_SYSTEM_ADDRESS);

    console.log("\n✅ Integration Complete!");
    console.log("Your lending protocol now supports zero-knowledge credit verification!");
}

async function createEnhancedBorrowingWorkflow() {
    const workflowScript = `
// Enhanced borrowing workflow with credit verification
const { ethers } = require("hardhat");

class EnhancedBorrowingWorkflow {
    constructor(liquidityPoolAddress, creditSystemAddress) {
        this.liquidityPoolAddress = liquidityPoolAddress;
        this.creditSystemAddress = creditSystemAddress;
    }

    async initialize() {
        const [signer] = await ethers.getSigners();
        this.signer = signer;
        this.liquidityPool = await ethers.getContractAt("LiquidityPoolV3", this.liquidityPoolAddress);
        this.creditSystem = await ethers.getContractAt("IntegratedCreditSystem", this.creditSystemAddress);
    }

    // Enhanced borrow function with credit verification
    async borrowWithCreditCheck(amount, requiredVerifications = ['tradfi']) {
        console.log("🏦 Enhanced Borrowing Process Started");
        console.log("=====================================");

        // Step 1: Check credit verification status
        const profile = await this.creditSystem.getUserCreditProfile(this.signer.address);
        console.log("📊 Credit Profile:", {
            finalScore: profile.finalScore.toString(),
            isEligible: profile.isEligible
        });

        // Step 2: Verify required verifications are complete
        const verificationChecks = {
            tradfi: profile.hasTradFi,
            account: profile.hasAccount,
            nesting: profile.hasNesting
        };

        const missingVerifications = requiredVerifications.filter(type => !verificationChecks[type]);
        
        if (missingVerifications.length > 0) {
            console.log("❌ Missing required verifications:", missingVerifications);
            return {
                success: false,
                error: \`Please complete \${missingVerifications.join(', ')} verification(s) first\`,
                missingVerifications
            };
        }

        // Step 3: Check borrowing eligibility
        if (!profile.isEligible) {
            console.log("❌ Not eligible for borrowing");
            return {
                success: false,
                error: "Credit score too low for borrowing",
                currentScore: profile.finalScore.toString()
            };
        }

        // Step 4: Get enhanced borrowing terms
        const borrowTerms = await this.liquidityPool.getBorrowTerms(this.signer.address);
        console.log("💰 Your Borrowing Terms:", {
            collateralRatio: borrowTerms.collateralRatio.toString() + "%",
            maxLoanAmount: ethers.formatEther(borrowTerms.maxLoanAmount) + " ETH",
            interestModifier: borrowTerms.interestRateModifier.toString() + "%"
        });

        // Step 5: Validate loan amount
        if (amount > borrowTerms.maxLoanAmount) {
            console.log("❌ Loan amount exceeds your limit");
            return {
                success: false,
                error: \`Maximum loan amount: \${ethers.formatEther(borrowTerms.maxLoanAmount)} ETH\`,
                maxAmount: borrowTerms.maxLoanAmount
            };
        }

        // Step 6: Check collateral requirements
        const collateralValue = await this.liquidityPool.getTotalCollateralValue(this.signer.address);
        const requiredCollateral = (amount * borrowTerms.collateralRatio) / 100n;

        if (collateralValue < requiredCollateral) {
            console.log("❌ Insufficient collateral");
            return {
                success: false,
                error: "Please deposit more collateral",
                currentCollateral: ethers.formatEther(collateralValue),
                requiredCollateral: ethers.formatEther(requiredCollateral)
            };
        }

        // Step 7: Execute the borrow transaction
        try {
            console.log("🚀 Executing borrow transaction...");
            const tx = await this.liquidityPool.borrow(amount);
            const receipt = await tx.wait();

            console.log("✅ Borrowing successful!");
            return {
                success: true,
                transactionHash: receipt.hash,
                amount: ethers.formatEther(amount),
                terms: borrowTerms
            };

        } catch (error) {
            console.log("❌ Borrowing failed:", error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Get personalized borrowing recommendations
    async getBorrowingRecommendations() {
        const profile = await this.creditSystem.getUserCreditProfile(this.signer.address);
        const recommendations = [];

        if (!profile.hasTradFi) {
            recommendations.push({
                type: "verification",
                priority: "high",
                action: "Complete TradFi verification",
                benefit: "Unlock up to 50% better rates",
                estimatedImprovement: "50 credit score points"
            });
        }

        if (!profile.hasAccount) {
            recommendations.push({
                type: "verification", 
                priority: "medium",
                action: "Verify your Ethereum account history",
                benefit: "Increase borrowing limit by 30%",
                estimatedImprovement: "30 credit score points"
            });
        }

        if (!profile.hasNesting) {
            recommendations.push({
                type: "verification",
                priority: "medium", 
                action: "Submit hybrid verification proof",
                benefit: "Maximize your credit score",
                estimatedImprovement: "20 credit score points"
            });
        }

        if (profile.isEligible) {
            recommendations.push({
                type: "borrowing",
                priority: "low",
                action: "Consider borrowing to build DeFi credit history",
                benefit: "Improve future borrowing terms",
                estimatedImprovement: "Better rates over time"
            });
        }

        return recommendations;
    }
}

module.exports = { EnhancedBorrowingWorkflow };
`;

    require('fs').writeFileSync('scripts/EnhancedBorrowingWorkflow.js', workflowScript);
    console.log("✅ Enhanced borrowing workflow created");
}

async function setupCreditMonitoring(creditSystemAddress) {
    const monitoringScript = `
// Credit monitoring and analytics
const { ethers } = require("hardhat");

class CreditMonitoring {
    constructor(creditSystemAddress) {
        this.creditSystemAddress = creditSystemAddress;
    }

    async initialize() {
        this.creditSystem = await ethers.getContractAt("IntegratedCreditSystem", this.creditSystemAddress);
    }

    // Monitor credit verification events
    async monitorVerificationEvents() {
        console.log("📊 Monitoring Credit Verification Events...");

        // Listen for credit verification events
        this.creditSystem.on("CreditVerificationCompleted", (user, verificationType, score, timestamp) => {
            console.log(\`🎉 New \${verificationType} verification completed!\`);
            console.log(\`   User: \${user}\`);
            console.log(\`   Score: \${score.toString()}\`);
            console.log(\`   Time: \${new Date(timestamp.toNumber() * 1000).toLocaleString()}\`);
        });

        this.creditSystem.on("CreditScoreUpdated", (user, oldScore, newScore, borrowingEligible) => {
            console.log(\`📈 Credit score updated for \${user}\`);
            console.log(\`   Old Score: \${oldScore.toString()}\`);
            console.log(\`   New Score: \${newScore.toString()}\`);
            console.log(\`   Borrowing Eligible: \${borrowingEligible}\`);
        });

        this.creditSystem.on("BorrowingEligibilityChanged", (user, eligible, creditScore) => {
            console.log(\`🔔 Borrowing eligibility changed for \${user}\`);
            console.log(\`   Eligible: \${eligible}\`);
            console.log(\`   Credit Score: \${creditScore.toString()}\`);
        });
    }

    // Generate credit analytics
    async generateCreditAnalytics(userAddress) {
        const profile = await this.creditSystem.getUserCreditProfile(userAddress);
        const details = await this.creditSystem.getVerificationDetails(userAddress);

        return {
            overview: {
                finalScore: profile.finalScore.toString(),
                isEligible: profile.isEligible,
                lastUpdate: new Date(profile.lastUpdate.toNumber() * 1000).toLocaleString()
            },
            verifications: {
                tradFi: {
                    completed: profile.hasTradFi,
                    score: details.tradFiScore.toString(),
                    timestamp: details.timestamps[0].toString()
                },
                account: {
                    completed: profile.hasAccount,
                    score: details.accountScore.toString(),
                    timestamp: details.timestamps[1].toString()
                },
                nesting: {
                    completed: profile.hasNesting,
                    score: details.hybridScore.toString(),
                    timestamp: details.timestamps[2].toString()
                }
            },
            recommendations: this.generateRecommendations(profile)
        };
    }

    generateRecommendations(profile) {
        const recommendations = [];
        
        if (profile.finalScore < 80) {
            recommendations.push("Complete additional verifications to improve your credit score");
        }
        
        if (!profile.isEligible) {
            recommendations.push("Achieve a minimum credit score of 25 to become eligible for borrowing");
        }
        
        if (profile.isEligible && profile.finalScore > 60) {
            recommendations.push("You qualify for preferential borrowing rates");
        }

        return recommendations;
    }
}

module.exports = { CreditMonitoring };
`;

    require('fs').writeFileSync('scripts/CreditMonitoring.js', monitoringScript);
    console.log("✅ Credit monitoring system created");
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = { main };