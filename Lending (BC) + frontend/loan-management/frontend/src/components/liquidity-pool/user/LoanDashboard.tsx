import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';

interface LoanDetails {
    principal: string;
    outstanding: string;
    interestRate: string;
    nextDueDate: string;
    installmentAmount: string;
    penaltyBps: string;
    active: boolean;
    daysUntilDue: string;
    latePenaltyIfPaidNow: string;
    totalInstallmentsRemaining: string;
}

interface LoanDashboardProps {
    contract: ethers.Contract;
    account: string;
}

const LoanDashboard: React.FC<LoanDashboardProps> = ({ contract, account }) => {
    const [loanDetails, setLoanDetails] = useState<LoanDetails | null>(null);
    const [loading, setLoading] = useState(false);
    const [notifications, setNotifications] = useState<string[]>([]);

    const fetchLoanDetails = async (): Promise<void> => {
        if (!account || !contract) return;

        setLoading(true);
        try {
            const details = await contract.getLoanDetails(account);
            setLoanDetails({
                principal: ethers.formatEther(details.principal),
                outstanding: ethers.formatEther(details.outstanding),
                interestRate: ethers.formatUnits(details.interestRate, 18),
                nextDueDate: new Date(Number(details.nextDueDate) * 1000).toLocaleDateString(),
                installmentAmount: ethers.formatEther(details.installmentAmount),
                penaltyBps: details.penaltyBps.toString(),
                active: details.active,
                daysUntilDue: details.daysUntilDue.toString(),
                latePenaltyIfPaidNow: ethers.formatEther(details.latePenaltyIfPaidNow),
                totalInstallmentsRemaining: details.totalInstallmentsRemaining.toString()
            });
        } catch (error) {
            console.error('Error fetching loan details:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleRepayInstallment = async (): Promise<void> => {
        if (!contract || !loanDetails) return;

        try {
            const installmentAmount = ethers.parseEther(loanDetails.installmentAmount);
            const tx = await contract.repayInstallment({ value: installmentAmount });
            await tx.wait();

            setNotifications(prev => [...prev, 'Payment successful!']);
            fetchLoanDetails();
        } catch (error) {
            console.error('Error repaying installment:', error);
            setNotifications(prev => [...prev, 'Payment failed. Please try again.']);
        }
    };

    useEffect(() => {
        fetchLoanDetails();
        const interval = setInterval(fetchLoanDetails, 30000);
        return () => clearInterval(interval);
    }, [account, contract]);

    if (loading) {
        return <div className="text-center p-4">Loading loan details...</div>;
    }

    if (!loanDetails || !loanDetails.active) {
        return (
            <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-2xl font-bold mb-4">Loan Dashboard</h2>
                <p className="text-gray-600">No active loan found.</p>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-2xl font-bold mb-6">Loan Dashboard</h2>

            {notifications.length > 0 && (
                <div className="mb-4">
                    {notifications.map((notification, index) => (
                        <div key={index} className="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded mb-2">
                            {notification}
                        </div>
                    ))}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className="bg-gray-50 p-4 rounded-lg">
                    <h3 className="font-semibold text-lg mb-3">Loan Status</h3>
                    <div className="space-y-2">
                        <div className="flex justify-between">
                            <span>Principal:</span>
                            <span className="font-medium">{loanDetails.principal} ETH</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Outstanding:</span>
                            <span className="font-medium">{loanDetails.outstanding} ETH</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Interest Rate:</span>
                            <span className="font-medium">{(Number(loanDetails.interestRate) * 100).toFixed(2)}%</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Next Due Date:</span>
                            <span className="font-medium">{loanDetails.nextDueDate}</span>
                        </div>
                    </div>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg">
                    <h3 className="font-semibold text-lg mb-3">Payment Schedule</h3>
                    <div className="space-y-2">
                        <div className="flex justify-between">
                            <span>Installment Amount:</span>
                            <span className="font-medium">{loanDetails.installmentAmount} ETH</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Days Until Due:</span>
                            <span className={`font-medium ${Number(loanDetails.daysUntilDue) <= 3 ? 'text-red-600' : 'text-green-600'}`}>
                                {loanDetails.daysUntilDue} days
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span>Remaining Installments:</span>
                            <span className="font-medium">{loanDetails.totalInstallmentsRemaining}</span>
                        </div>
                        {Number(loanDetails.latePenaltyIfPaidNow) > 0 && (
                            <div className="flex justify-between">
                                <span>Late Penalty:</span>
                                <span className="font-medium text-red-600">{loanDetails.latePenaltyIfPaidNow} ETH</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
                <button
                    onClick={handleRepayInstallment}
                    disabled={Number(loanDetails.daysUntilDue) > 0}
                    className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                    Pay Installment ({loanDetails.installmentAmount} ETH)
                </button>

                <button
                    onClick={fetchLoanDetails}
                    className="bg-gray-600 text-white px-6 py-2 rounded-lg hover:bg-gray-700"
                >
                    Refresh
                </button>
            </div>

            {Number(loanDetails.daysUntilDue) <= 3 && Number(loanDetails.daysUntilDue) > 0 && (
                <div className="mt-4 bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded">
                    ⚠️ Payment due soon! Please make your payment to avoid late fees.
                </div>
            )}

            {Number(loanDetails.daysUntilDue) === 0 && (
                <div className="mt-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                    ⚠️ Payment is overdue! Late penalties may apply.
                </div>
            )}

            {Number(loanDetails.latePenaltyIfPaidNow) > 0 && (
                <div className="mt-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                    ⚠️ Late penalty of {loanDetails.latePenaltyIfPaidNow} ETH will be added to your payment.
                </div>
            )}
        </div>
    );
};

export default LoanDashboard; 
