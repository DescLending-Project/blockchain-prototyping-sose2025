const { ethers } = require('ethers');
const nodemailer = require('nodemailer');
const twilio = require('twilio');
require('dotenv').config();

// Configuration
const RPC_URL = process.env.RPC_URL || 'http://localhost:8545';
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;

// Initialize providers and services
const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

// Email transporter
const emailTransporter = nodemailer.createTransporter({
    service: 'gmail',
    auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS
    }
});

// Twilio client
const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

// Contract ABI (simplified for events we care about)
const CONTRACT_ABI = [
    "event LoanDisbursed(address indexed borrower, uint256 amount, uint256 rate)",
    "event LoanInstallmentPaid(address indexed borrower, uint256 amount, uint256 remaining)",
    "event LoanLatePenaltyApplied(address indexed borrower, uint256 penalty)",
    "event LoanFullyRepaid(address indexed borrower)",
    "event LiquidationStarted(address indexed user)",
    "event Borrowed(address indexed user, uint256 amount)",
    "event Repaid(address indexed user, uint256 amount)",
    "event FeeCollected(address indexed user, uint256 amount, string feeType, uint256 tier)"
];

const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

// User contact information (in production, this would come from a database)
const userContacts = new Map();

// Event handlers
async function handleLoanDisbursed(borrower, amount, rate) {
    console.log(`Loan disbursed to ${borrower}: ${ethers.formatEther(amount)} ETH at ${rate}%`);

    const email = userContacts.get(borrower)?.email;
    const phone = userContacts.get(borrower)?.phone;

    if (email) {
        await sendEmail(email, 'Loan Disbursed', `
            Your loan of ${ethers.formatEther(amount)} ETH has been disbursed.
            Interest rate: ${rate}%
            Please check your wallet for the funds.
        `);
    }

    if (phone) {
        await sendSMS(phone, `Your loan of ${ethers.formatEther(amount)} ETH has been disbursed.`);
    }
}

async function handleLoanInstallmentPaid(borrower, amount, remaining) {
    console.log(`Installment paid by ${borrower}: ${ethers.formatEther(amount)} ETH, remaining: ${ethers.formatEther(remaining)} ETH`);

    const email = userContacts.get(borrower)?.email;
    const phone = userContacts.get(borrower)?.phone;

    if (email) {
        await sendEmail(email, 'Payment Received', `
            Your payment of ${ethers.formatEther(amount)} ETH has been received.
            Remaining balance: ${ethers.formatEther(remaining)} ETH
        `);
    }

    if (phone) {
        await sendSMS(phone, `Payment of ${ethers.formatEther(amount)} ETH received. Remaining: ${ethers.formatEther(remaining)} ETH`);
    }
}

async function handleLoanLatePenaltyApplied(borrower, penalty) {
    console.log(`Late penalty applied to ${borrower}: ${ethers.formatEther(penalty)} ETH`);

    const email = userContacts.get(borrower)?.email;
    const phone = userContacts.get(borrower)?.phone;

    if (email) {
        await sendEmail(email, 'Late Payment Penalty', `
            A late payment penalty of ${ethers.formatEther(penalty)} ETH has been applied to your loan.
            Please make your payment as soon as possible to avoid additional penalties.
        `);
    }

    if (phone) {
        await sendSMS(phone, `Late payment penalty of ${ethers.formatEther(penalty)} ETH applied. Please pay immediately.`);
    }
}

async function handleLoanFullyRepaid(borrower) {
    console.log(`Loan fully repaid by ${borrower}`);

    const email = userContacts.get(borrower)?.email;
    const phone = userContacts.get(borrower)?.phone;

    if (email) {
        await sendEmail(email, 'Loan Fully Repaid', `
            Congratulations! Your loan has been fully repaid.
            Thank you for using our lending service.
        `);
    }

    if (phone) {
        await sendSMS(phone, 'Congratulations! Your loan has been fully repaid.');
    }
}

async function handleLiquidationStarted(user) {
    console.log(`Liquidation started for ${user}`);

    const email = userContacts.get(user)?.email;
    const phone = userContacts.get(user)?.phone;

    if (email) {
        await sendEmail(email, 'Liquidation Warning', `
            Your position has been marked for liquidation due to insufficient collateral.
            Please add more collateral or repay your debt immediately to avoid liquidation.
        `);
    }

    if (phone) {
        await sendSMS(phone, 'URGENT: Your position is marked for liquidation. Add collateral or repay immediately.');
    }
}

// Notification functions
async function sendEmail(to, subject, text) {
    try {
        const mailOptions = {
            from: EMAIL_USER,
            to: to,
            subject: subject,
            text: text
        };

        await emailTransporter.sendMail(mailOptions);
        console.log(`Email sent to ${to}`);
    } catch (error) {
        console.error('Email sending failed:', error);
    }
}

async function sendSMS(to, message) {
    try {
        await twilioClient.messages.create({
            body: message,
            from: TWILIO_PHONE_NUMBER,
            to: to
        });
        console.log(`SMS sent to ${to}`);
    } catch (error) {
        console.error('SMS sending failed:', error);
    }
}

// Payment reminder function
async function checkPaymentReminders() {
    try {
        // This would query the blockchain for loans due soon
        // For now, we'll just log that we're checking
        console.log('Checking for payment reminders...');

        // In a real implementation, you would:
        // 1. Query all active loans
        // 2. Check which ones are due within 3 days
        // 3. Send reminder notifications
    } catch (error) {
        console.error('Payment reminder check failed:', error);
    }
}

// Event listeners
contract.on('LoanDisbursed', handleLoanDisbursed);
contract.on('LoanInstallmentPaid', handleLoanInstallmentPaid);
contract.on('LoanLatePenaltyApplied', handleLoanLatePenaltyApplied);
contract.on('LoanFullyRepaid', handleLoanFullyRepaid);
contract.on('LiquidationStarted', handleLiquidationStarted);

// Start the service
console.log('Notification service starting...');
console.log(`Listening to contract: ${CONTRACT_ADDRESS}`);

// Check for payment reminders every hour
setInterval(checkPaymentReminders, 60 * 60 * 1000);

// Keep the service running
process.on('SIGINT', () => {
    console.log('Shutting down notification service...');
    process.exit(0);
}); 