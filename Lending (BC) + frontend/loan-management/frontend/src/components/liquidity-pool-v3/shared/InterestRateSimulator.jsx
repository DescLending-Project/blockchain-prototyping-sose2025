import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Card } from '../../ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../ui/tooltip';
import { LineChart, Line, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';
import { Info } from 'lucide-react';
import { Button } from '../../ui/button';

// Kink model parameters
const BASE_RATE = 0.02; // 2%
const KINK = 0.8; // 80%
const SLOPE1 = 0.20; // 20%
const SLOPE2 = 1.0; // 100%
const RESERVE_FACTOR = 0.1; // 10%

// Borrow rate calculation (kink model)
function getBorrowRate(utilization) {
    if (utilization <= KINK) {
        return BASE_RATE + SLOPE1 * (utilization / KINK);
    } else {
        return BASE_RATE + SLOPE1 + SLOPE2 * ((utilization - KINK) / (1 - KINK));
    }
}

// Supply rate calculation (for lenders)
function getSupplyRate(utilization, borrowRate) {
    return utilization * borrowRate * (1 - RESERVE_FACTOR);
}

// Format as percent string
function percent(val, decimals = 2) {
    return (val * 100).toFixed(decimals) + '%';
}

// Generate chart data for 0-100% utilization, highlighting the current utilization
function generateChartData(currentUtilization, steps = 50) {
    const data = [];
    let closestIdx = 0;
    let minDiff = 1;
    for (let i = 0; i <= steps; i++) {
        const utilization = i / steps;
        const borrowRate = getBorrowRate(utilization);
        const supplyRate = getSupplyRate(utilization, borrowRate);
        const diff = Math.abs(utilization - currentUtilization);
        if (diff < minDiff) {
            minDiff = diff;
            closestIdx = i;
        }
        data.push({
            utilization: utilization * 100,
            borrowRate: borrowRate * 100,
            supplyRate: supplyRate * 100,
            isCurrent: false
        });
    }
    if (data[closestIdx]) data[closestIdx].isCurrent = true;
    return data;
}

export const LendingRateSimulator = ({ initialUtilization = 0.67, showChart = true, onRateChange }) => {
    const [utilization, setUtilization] = useState(initialUtilization);
    const [reserveFactor, setReserveFactor] = useState(0.1);
    const [kink, setKink] = useState(0.8);
    const [baseRate] = useState(0.02);
    const [slope1] = useState(0.20);
    const [slope2] = useState(1.0);
    const defaultParams = { utilization: initialUtilization, reserveFactor: 0.1, kink: 0.8 };

    // Updated rate functions to use state
    function getBorrowRate(util) {
        if (util <= kink) {
            return baseRate + slope1 * (util / kink);
        } else {
            return baseRate + slope1 + slope2 * ((util - kink) / (1 - kink));
        }
    }
    function getSupplyRate(util, borrowRate) {
        return util * borrowRate * (1 - reserveFactor);
    }
    const borrowRate = useMemo(() => getBorrowRate(utilization), [utilization, kink, baseRate, slope1, slope2]);
    const supplyRate = useMemo(() => getSupplyRate(utilization, borrowRate), [utilization, borrowRate, reserveFactor]);
    const chartData = useMemo(() => {
        const data = [];
        let closestIdx = 0;
        let minDiff = 1;
        for (let i = 0; i <= 50; i++) {
            const util = i / 50;
            const br = getBorrowRate(util);
            const sr = getSupplyRate(util, br);
            const diff = Math.abs(util - utilization);
            if (diff < minDiff) {
                minDiff = diff;
                closestIdx = i;
            }
            data.push({
                utilization: util * 100,
                borrowRate: br * 100,
                supplyRate: sr * 100,
                isCurrent: false
            });
        }
        if (data[closestIdx]) data[closestIdx].isCurrent = true;
        return data;
    }, [utilization, reserveFactor, kink, baseRate, slope1, slope2]);

    useEffect(() => {
        if (onRateChange) {
            onRateChange({ utilization, supplyRate, borrowRate });
        }
    }, [utilization, supplyRate, borrowRate, onRateChange]);

    const CustomDot = useCallback((props) => {
        const { cx, cy, payload } = props;
        if (!payload.isCurrent) return null;
        return (
            <circle
                cx={cx}
                cy={cy}
                r={8}
                fill="#f59e42"
                stroke="#fff"
                strokeWidth={2}
                style={{ pointerEvents: 'none' }}
            />
        );
    }, []);

    // Reset handler
    const handleReset = () => {
        setUtilization(defaultParams.utilization);
        setReserveFactor(defaultParams.reserveFactor);
        setKink(defaultParams.kink);
    };

    return (
        <Card className="max-w-2xl mx-auto p-4 bg-white shadow-lg rounded-lg">
            <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold text-blue-900">How Lending & Borrowing Rates Work</h2>
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span className="cursor-pointer text-blue-500"><Info className="h-5 w-5" /></span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs text-xs">
                                <b>Kink Model Formula:</b><br />
                                <span>Borrow Rate = base + slope1 × (utilization / kink) [if utilization ≤ kink]</span><br />
                                <span>Borrow Rate = base + slope1 + slope2 × ((utilization - kink) / (1 - kink)) [if utilization &gt; kink]</span><br /><br />
                                <span>Supply Rate = utilization × Borrow Rate × (1 - reserve factor)</span><br /><br />
                                <span><b>base:</b> {baseRate * 100}%<br /><b>slope1:</b> {slope1 * 100}%<br /><b>slope2:</b> {slope2 * 100}%<br /><b>kink:</b> {Math.round(kink * 100)}%<br /><b>reserve factor:</b> {Math.round(reserveFactor * 100)}%</span>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
                <Button size="sm" variant="outline" onClick={handleReset}>Reset</Button>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-3 text-sm text-blue-900">
                <p className="mb-1">
                    This tool helps you understand how <b>interest rates for lending and borrowing</b> change as the pool's utilization (how much is borrowed vs. supplied) increases.
                </p>
                <ul className="list-disc list-inside mb-1">
                    <li><b>Borrow Rate:</b> The interest borrowers <b>would</b> pay, which rises as more of the pool is used. <span className="text-yellow-700 font-semibold">(Note: In this prototype, borrowers currently only repay principal, no interest is charged on-chain.)</span></li>
                    <li><b>Supply Rate:</b> The interest lenders earn, which depends on utilization and a reserve factor.</li>
                </ul>
                <p className="text-blue-800">Move the slider to see how rates change as the pool gets used. At high utilization, borrowing becomes much more expensive to protect liquidity for lenders.</p>
            </div>
            <div className="flex flex-row flex-wrap gap-6 mb-3 items-center w-full">
                <div className="flex items-center gap-2 min-w-[220px]">
                    <label htmlFor="utilization-slider" className="text-sm font-medium text-gray-700 whitespace-nowrap">
                        Utilization: <span className="font-bold">{Math.round(utilization * 100)}%</span>
                    </label>
                    <input
                        id="utilization-slider"
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={utilization}
                        onChange={e => setUtilization(Number(e.target.value))}
                        className="w-40 accent-blue-600 mx-2"
                    />
                </div>
                <div className="flex items-center gap-1 min-w-[150px]">
                    <label className="text-xs text-gray-500">Reserve Factor:</label>
                    <input
                        type="number"
                        min={0}
                        max={0.5}
                        step={0.01}
                        value={reserveFactor}
                        onChange={e => setReserveFactor(Math.max(0, Math.min(0.5, Number(e.target.value))))}
                        className="w-14 px-1 py-0.5 border rounded text-xs"
                    />
                </div>
                <div className="flex items-center gap-1 min-w-[120px]">
                    <label className="text-xs text-gray-500">Kink:</label>
                    <input
                        type="number"
                        min={0.5}
                        max={0.99}
                        step={0.01}
                        value={kink}
                        onChange={e => setKink(Math.max(0.5, Math.min(0.99, Number(e.target.value))))}
                        className="w-14 px-1 py-0.5 border rounded text-xs"
                    />
                </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="bg-blue-50 p-3 rounded flex flex-col items-center">
                    <div className="text-xs text-gray-500">Borrow Rate (for borrowers)</div>
                    <div className="text-lg font-bold text-blue-700">{percent(borrowRate, 2)}</div>
                    <div className="text-xs text-gray-400">(changes with usage)</div>
                </div>
                <div className="bg-green-50 p-3 rounded flex flex-col items-center">
                    <div className="text-xs text-gray-500">Supply Rate (for lenders)</div>
                    <div className="text-lg font-bold text-green-700">{percent(supplyRate, 2)}</div>
                    <div className="text-xs text-gray-400">(after reserve factor)</div>
                </div>
            </div>
            {showChart && (
                <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 10, right: 40, left: 40, bottom: 40 }}>
                            <XAxis dataKey="utilization" tickFormatter={v => percent(v / 100, 0)} domain={[0, 100]} label={{ value: 'Utilization (%)', position: 'insideBottom', offset: 30, dy: 30, fill: '#334155', fontSize: 14 }} />
                            <YAxis tickFormatter={v => percent(v / 100, 0)} domain={[0, 'auto']} label={{ value: 'Rate (%)', angle: -90, position: 'insideLeft', dx: -40, fill: '#334155', fontSize: 14 }} />
                            <RechartsTooltip formatter={v => percent(v / 100, 2)} labelFormatter={v => `Utilization: ${percent(v / 100, 0)}`} />
                            <Legend verticalAlign="top" height={36} />
                            <Line type="monotone" dataKey="borrowRate" stroke="#2563eb" strokeWidth={2} name="Borrow Rate" dot={false} />
                            <Line type="monotone" dataKey="supplyRate" stroke="#16a34a" strokeWidth={2} name="Supply Rate" dot={CustomDot} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            )}
        </Card>
    );
};

export default LendingRateSimulator; 