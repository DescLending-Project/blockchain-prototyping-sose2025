const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

async function runScript(scriptName) {
    return new Promise((resolve, reject) => {
        console.log(`\n🚀 Running ${scriptName}...`);
        exec(`npx hardhat run scripts/${scriptName}`, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error running ${scriptName}:`, error);
                reject(error);
                return;
            }
            console.log(stdout);
            if (stderr) console.error(stderr);
            resolve(stdout);
        });
    });
}

async function generateComprehensiveReport() {
    console.log("📊 COMPREHENSIVE GAS ANALYSIS REPORT");
    console.log("=" .repeat(50));
    console.log("This analysis will measure:");
    console.log("1. 💰 Total deployment costs");
    console.log("2. ⚡ Individual method gas costs");
    console.log("3. 🔄 Complete lending cycle costs");
    console.log("4. 📈 Cost projections at different gas prices");
    console.log("=" .repeat(50));

    try {
        // Run all analysis scripts
        await runScript('deploymentCostAnalysis.js');
        await runScript('lendingCycleAnalysis.js');
        await runScript('gasAnalysis.js');

        // Read all result files
        const deploymentResults = JSON.parse(fs.readFileSync('deployment-cost-analysis.json', 'utf8'));
        const cycleResults = JSON.parse(fs.readFileSync('lending-cycle-analysis.json', 'utf8'));
        const gasResults = JSON.parse(fs.readFileSync('gas-analysis-results.json', 'utf8'));

        // Generate comprehensive report
        const report = {
            timestamp: new Date().toISOString(),
            summary: {
                totalDeploymentGas: deploymentResults.breakdown.totalGas,
                fullLendingCycleGas: cycleResults.summary.grandTotal,
                mostExpensiveMethod: gasResults.summary.mostExpensiveMethod,
                leastExpensiveMethod: gasResults.summary.leastExpensiveMethod
            },
            deployment: deploymentResults,
            lendingCycle: cycleResults,
            methods: gasResults.methods,
            costProjections: generateCostProjections(deploymentResults, cycleResults, gasResults)
        };

        // Save comprehensive report
        fs.writeFileSync('comprehensive-gas-report.json', JSON.stringify(report, null, 2));

        // Generate markdown report
        generateMarkdownReport(report);

        console.log("\n✅ ANALYSIS COMPLETE!");
        console.log("📄 Files generated:");
        console.log("   - comprehensive-gas-report.json");
        console.log("   - gas-analysis-report.md");
        console.log("   - deployment-cost-analysis.json");
        console.log("   - lending-cycle-analysis.json");
        console.log("   - gas-analysis-results.json");

        // Display key findings
        displayKeyFindings(report);

    } catch (error) {
        console.error("❌ Error during analysis:", error);
        process.exit(1);
    }
}

function generateCostProjections(deployment, cycle, gas) {
    const gasPrices = [
        { name: "Low (10 gwei)", gwei: 10 },
        { name: "Medium (25 gwei)", gwei: 25 },
        { name: "High (50 gwei)", gwei: 50 },
        { name: "Extreme (100 gwei)", gwei: 100 }
    ];

    const projections = {};

    for (const gasPrice of gasPrices) {
        const gweiInWei = BigInt(gasPrice.gwei) * BigInt(10 ** 9);
        
        projections[gasPrice.name] = {
            deployment: {
                gasUsed: deployment.breakdown.totalGas,
                costETH: (BigInt(deployment.breakdown.totalGas) * gweiInWei / BigInt(10 ** 18)).toString(),
                costUSD: "TBD" // Would need ETH price
            },
            fullCycle: {
                gasUsed: cycle.summary.grandTotal,
                costETH: (BigInt(cycle.summary.grandTotal) * gweiInWei / BigInt(10 ** 18)).toString(),
                costUSD: "TBD"
            },
            singleBorrow: {
                gasUsed: gas.methods.borrow,
                costETH: (BigInt(gas.methods.borrow) * gweiInWei / BigInt(10 ** 18)).toString(),
                costUSD: "TBD"
            }
        };
    }

    return projections;
}

function generateMarkdownReport(report) {
    const markdown = `# Gas Analysis Report

Generated: ${report.timestamp}

## Executive Summary

- **Total Deployment Gas**: ${Number(report.summary.totalDeploymentGas).toLocaleString()} gas
- **Full Lending Cycle Gas**: ${Number(report.summary.fullLendingCycleGas).toLocaleString()} gas
- **Most Expensive Method**: ${report.summary.mostExpensiveMethod[0]} (${Number(report.summary.mostExpensiveMethod[1]).toLocaleString()} gas)
- **Least Expensive Method**: ${report.summary.leastExpensiveMethod[0]} (${Number(report.summary.leastExpensiveMethod[1]).toLocaleString()} gas)

## Deployment Costs

| Contract | Gas Used | Percentage |
|----------|----------|------------|
${Object.entries(report.deployment.contracts)
    .sort(([,a], [,b]) => Number(b.gas) - Number(a.gas))
    .map(([name, data]) => {
        const percentage = (Number(data.gas) / Number(report.deployment.breakdown.deploymentGas) * 100).toFixed(1);
        return `| ${name} | ${Number(data.gas).toLocaleString()} | ${percentage}% |`;
    }).join('\n')}

## Method Gas Costs

| Method | Gas Used |
|--------|----------|
${Object.entries(report.methods)
    .sort(([,a], [,b]) => Number(b) - Number(a))
    .map(([method, gas]) => `| ${method} | ${Number(gas).toLocaleString()} |`)
    .join('\n')}

## Lending Cycle Breakdown

### Borrower Journey
- **Deposit**: ${Number(report.lendingCycle.borrowerJourney.deposit).toLocaleString()} gas
- **Borrow**: ${Number(report.lendingCycle.borrowerJourney.borrow).toLocaleString()} gas
- **Partial Repay**: ${Number(report.lendingCycle.borrowerJourney.partialRepay).toLocaleString()} gas
- **Final Repay**: ${Number(report.lendingCycle.borrowerJourney.finalRepay).toLocaleString()} gas
- **Withdraw**: ${Number(report.lendingCycle.borrowerJourney.withdraw).toLocaleString()} gas
- **Total**: ${Number(report.lendingCycle.borrowerJourney.total).toLocaleString()} gas

### Lender Journey
- **Provide Liquidity**: ${Number(report.lendingCycle.lenderJourney.provideLiquidity).toLocaleString()} gas
- **Withdraw Liquidity**: ${Number(report.lendingCycle.lenderJourney.withdrawLiquidity).toLocaleString()} gas
- **Total**: ${Number(report.lendingCycle.lenderJourney.total).toLocaleString()} gas

## Cost Projections

| Gas Price | Deployment Cost | Full Cycle Cost | Single Borrow Cost |
|-----------|----------------|-----------------|-------------------|
${Object.entries(report.costProjections)
    .map(([price, costs]) => `| ${price} | ${costs.deployment.costETH} ETH | ${costs.fullCycle.costETH} ETH | ${costs.singleBorrow.costETH} ETH |`)
    .join('\n')}

## Methodology

This analysis was conducted using Hardhat on a local network with the following approach:

1. **Deployment Analysis**: Measured gas costs for deploying all system contracts
2. **Method Analysis**: Measured individual function call costs
3. **Cycle Analysis**: Measured complete user journeys from start to finish
4. **Cost Projections**: Calculated costs at various gas price levels

All measurements include actual transaction execution and state changes.
`;

    fs.writeFileSync('gas-analysis-report.md', markdown);
}

function displayKeyFindings(report) {
    console.log("\n🔍 KEY FINDINGS");
    console.log("-".repeat(20));
    
    const deploymentGas = Number(report.summary.totalDeploymentGas);
    const cycleGas = Number(report.summary.fullLendingCycleGas);
    
    console.log(`📊 System requires ${deploymentGas.toLocaleString()} gas to deploy`);
    console.log(`🔄 Complete lending cycle uses ${cycleGas.toLocaleString()} gas`);
    console.log(`⚡ Most expensive operation: ${report.summary.mostExpensiveMethod[0]}`);
    console.log(`💡 Least expensive operation: ${report.summary.leastExpensiveMethod[0]}`);
    
    // Cost at 25 gwei
    const gasPrice25 = 25n * 10n ** 9n;
    const deploymentCost = (BigInt(deploymentGas) * gasPrice25) / BigInt(10 ** 18);
    const cycleCost = (BigInt(cycleGas) * gasPrice25) / BigInt(10 ** 18);
    
    console.log(`\n💰 At 25 gwei gas price:`);
    console.log(`   Deployment: ${deploymentCost} ETH`);
    console.log(`   Full cycle: ${cycleCost} ETH`);
    
    console.log(`\n📈 Efficiency ratio: ${(deploymentGas / cycleGas).toFixed(1)}x`);
    console.log(`   (Deployment cost vs cycle cost)`);
}

// Run the comprehensive analysis
generateComprehensiveReport();
