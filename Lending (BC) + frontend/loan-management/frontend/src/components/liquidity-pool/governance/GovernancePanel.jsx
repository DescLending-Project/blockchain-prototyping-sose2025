import { useEffect, useState, useMemo } from "react";
import { ethers, id } from "ethers";
import { formatUnits } from 'ethers';
import VotingTokenABI from "@/abis/VotingToken.json";
import GovernorABI from "@/abis/ProtocolGovernor.json";
import addresses from "@/addresses.json";
import { Tooltip } from "@radix-ui/react-tooltip";
import { Info } from "lucide-react";
import { useRef } from "react";

const VotingToken_ADDRESS = addresses.VotingToken;
const GOVERNOR_ADDRESS = addresses.ProtocolGovernor;

function formatMultiplier(x) {
    return (Number(formatUnits(x, 18))).toFixed(2) + "x";
}

// Info tooltip for delegation
function InfoTooltip({ text }) {
    return (
        <Tooltip>
            <span className="inline-block align-middle ml-1 cursor-pointer text-blue-500">
                <Info size={16} />
                <span className="absolute z-10 bg-white border rounded shadow p-2 text-xs w-64 left-1/2 -translate-x-1/2 mt-2 hidden group-hover:block">{text}</span>
            </span>
        </Tooltip>
    );
}

function DelegateSection({ account, provider }) {
    const [delegatee, setDelegatee] = useState("");
    const [currentDelegate, setCurrentDelegate] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [showInfo, setShowInfo] = useState(false);

    useEffect(() => {
        if (!provider || !account) return;
        const VotingToken = new ethers.Contract(VotingToken_ADDRESS, VotingTokenABI.abi, provider);
        async function fetchDelegate() {
            try {
                const delegate = await VotingToken.delegates(account);
                setCurrentDelegate(delegate);
            } catch (err) {
                setCurrentDelegate("");
            }
        }
        fetchDelegate();
    }, [provider, account]);

    async function handleDelegate(e) {
        e.preventDefault();
        setLoading(true);
        setError("");
        setSuccess("");
        try {
            const signer = await provider.getSigner();
            const VotingToken = new ethers.Contract(VotingToken_ADDRESS, VotingTokenABI.abi, signer);
            const tx = await VotingToken.delegate(delegatee);
            await tx.wait();
            setSuccess("Delegation successful!");
            setCurrentDelegate(delegatee);
            setDelegatee("");
        } catch (err) {
            setError(err.message || "Delegation failed");
        }
        setLoading(false);
    }

    return (
        <form onSubmit={handleDelegate} className="mb-6 p-4 border rounded bg-white/80 relative">
            <h4 className="font-semibold mb-2 flex items-center gap-2">
                Delegate Voting Power
                <span
                    className="group relative"
                    onMouseEnter={() => setShowInfo(true)}
                    onMouseLeave={() => setShowInfo(false)}
                >
                    <Info size={16} className="text-blue-500 cursor-pointer" />
                    {showInfo && (
                        <span className="absolute z-10 bg-white border rounded shadow p-2 text-xs w-64 left-1/2 -translate-x-1/2 mt-2">
                            Delegating your voting power means you allow another address to vote on your behalf in governance proposals. You still keep your tokens, but your voting influence is counted with the delegatee’s votes. This is useful if you trust someone to represent your interests or if you can’t participate actively.
                        </span>
                    )}
                </span>
            </h4>
            <div className="mb-2">
                <input className="border p-1 rounded w-full" value={delegatee} onChange={e => setDelegatee(e.target.value)} placeholder="Delegatee address" required />
            </div>
            <button type="submit" className="bg-green-600 text-white px-3 py-1 rounded" disabled={loading}>Delegate</button>
            {currentDelegate && <div className="text-xs mt-2">Current Delegate: <span className="font-mono">{currentDelegate}</span></div>}
            {success && <div className="text-green-600 mt-2">{success}</div>}
            {error && <div className="text-red-500 mt-2">{error}</div>}
        </form>
    );
}

// Helper to get function selector from signature
function getSelector(signature) {
    return id(signature).slice(0, 10);
}

// Fill in selectors for each function
const PROPOSAL_OPTIONS = [
    {
        label: "Interest Rate Model",
        contract: addresses.InterestRateModel,
        functions: [
            {
                label: "Set All Parameters",
                selector: getSelector("setParameters(uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256)"),
                params: [
                    { name: "baseRate", type: "uint256", tooltip: "Base interest rate (18 decimals)" },
                    { name: "kink", type: "uint256", tooltip: "Utilization kink point (18 decimals)" },
                    { name: "slope1", type: "uint256", tooltip: "Slope below kink (18 decimals)" },
                    { name: "slope2", type: "uint256", tooltip: "Slope above kink (18 decimals)" },
                    { name: "reserveFactor", type: "uint256", tooltip: "Reserve factor (18 decimals)" },
                    { name: "maxBorrowRate", type: "uint256", tooltip: "Maximum borrow rate (18 decimals)" },
                    { name: "maxRateChange", type: "uint256", tooltip: "Maximum rate change per update (18 decimals)" },
                    { name: "ethPriceRiskPremium", type: "uint256", tooltip: "ETH price risk premium (18 decimals)" },
                    { name: "ethVolatilityThreshold", type: "uint256", tooltip: "ETH volatility threshold (18 decimals)" },
                    { name: "oracleStalenessWindow", type: "uint256", tooltip: "Oracle staleness window (seconds)" },
                ]
            },
            {
                label: "Set Oracle",
                selector: getSelector("setOracle(address)"),
                params: [
                    { name: "newOracle", type: "address", tooltip: "New Chainlink oracle address" }
                ]
            },
            {
                label: "Set Protocol Risk Adjustment",
                selector: getSelector("setProtocolRiskAdjustment(int256)"),
                params: [
                    { name: "adjustment", type: "int256", tooltip: "Risk adjustment (positive or negative, 18 decimals)" }
                ]
            }
        ]
    },
    {
        label: "Lending Manager",
        contract: addresses.LendingManager,
        functions: [
            {
                label: "Set Interest Tier",
                selector: getSelector("setInterestTier(uint256,uint256,uint256)"),
                params: [
                    { name: "index", type: "uint256", tooltip: "Tier index (0 = highest)" },
                    { name: "minAmount", type: "uint256", tooltip: "Minimum deposit for this tier (wei)" },
                    { name: "rate", type: "uint256", tooltip: "Interest rate (18 decimals)" }
                ]
            },
            {
                label: "Set Fee Parameters",
                selector: getSelector("setFeeParameters(uint256,uint256)"),
                params: [
                    { name: "originationFee", type: "uint256", tooltip: "Origination fee (basis points)" },
                    { name: "lateFee", type: "uint256", tooltip: "Late fee (basis points)" }
                ]
            },
            {
                label: "Set Early Withdrawal Penalty",
                selector: getSelector("setEarlyWithdrawalPenalty(uint256)"),
                params: [
                    { name: "newPenalty", type: "uint256", tooltip: "Penalty percent (0-100)" }
                ]
            },
            {
                label: "Set Current Daily Rate",
                selector: getSelector("setCurrentDailyRate(uint256)"),
                params: [
                    { name: "newRate", type: "uint256", tooltip: "Daily interest rate (18 decimals)" }
                ]
            },
            {
                label: "Set Reserve Address",
                selector: getSelector("setReserveAddress(address)"),
                params: [
                    { name: "_reserve", type: "address", tooltip: "Reserve address for protocol fees" }
                ]
            }
        ]
    },
    {
        label: "Liquidity Pool",
        contract: addresses.LiquidityPool,
        functions: [
            {
                label: "Set Allowed Collateral",
                selector: getSelector("setAllowedCollateral(address,bool)"),
                params: [
                    { name: "token", type: "address", tooltip: "Token address" },
                    { name: "allowed", type: "bool", tooltip: "Allow as collateral? (true/false)" }
                ]
            },
            {
                label: "Update Borrow Tier",
                selector: getSelector("updateBorrowTier(uint256,uint256,uint256,uint256,int256,uint256)"),
                params: [
                    { name: "tierIndex", type: "uint256", tooltip: "Tier index" },
                    { name: "minScore", type: "uint256", tooltip: "Minimum credit score" },
                    { name: "maxScore", type: "uint256", tooltip: "Maximum credit score" },
                    { name: "collateralRatio", type: "uint256", tooltip: "Collateral ratio (%)" },
                    { name: "interestRateModifier", type: "int256", tooltip: "Interest rate modifier (bps)" },
                    { name: "maxLoanAmount", type: "uint256", tooltip: "Max loan as % of pool" }
                ]
            },
            {
                label: "Set Price Feed",
                selector: getSelector("setPriceFeed(address,address)"),
                params: [
                    { name: "token", type: "address", tooltip: "Token address" },
                    { name: "feed", type: "address", tooltip: "Price feed address" }
                ]
            },
            {
                label: "Set Tier Fee",
                selector: getSelector("setTierFee(uint256,uint256,uint256)"),
                params: [
                    { name: "tier", type: "uint256", tooltip: "Tier index" },
                    { name: "originationFee", type: "uint256", tooltip: "Origination fee (bps)" },
                    { name: "lateFeeAPR", type: "uint256", tooltip: "Late fee APR (bps)" }
                ]
            },
            {
                label: "Set Min Partial Liquidation Amount",
                selector: getSelector("setMinPartialLiquidationAmount(uint256)"),
                params: [
                    { name: "amount", type: "uint256", tooltip: "Minimum amount (wei)" }
                ]
            },
            {
                label: "Set Reserve Address",
                selector: getSelector("setReserveAddress(address)"),
                params: [
                    { name: "_reserve", type: "address", tooltip: "Reserve address for protocol fees" }
                ]
            },
            {
                label: "Protocol Governor (Advanced)",
                contract: addresses.ProtocolGovernor,
                functions: [
                    {
                        label: "Set Contract Whitelist",
                        selector: getSelector("setContractWhitelist(address,bool)"),
                        params: [
                            { name: "contractAddr", type: "address", tooltip: "Contract address to whitelist or remove" },
                            { name: "allowed", type: "bool", tooltip: "Allow this contract? (true/false)" }
                        ]
                    },
                    {
                        label: "Set Emergency Multisig",
                        selector: getSelector("setEmergencyMultisig(address[]"),
                        params: [
                            { name: "signers", type: "address[]", tooltip: "Array of multisig signer addresses (comma-separated)" }
                        ]
                    }
                ]
            },
            {
                label: "Set Credit System",
                selector: getSelector("setCreditSystem(address)"),
                params: [
                    { name: "_creditSystem", type: "address", tooltip: "Address of the new IntegratedCreditSystem contract" }
                ]
            },
            {
                label: "Set ZK Proof Requirement",
                selector: getSelector("setZKProofRequirement(bool)"),
                params: [
                    { name: "required", type: "bool", tooltip: "Require ZK proof for borrowing? (true/false)" }
                ]
            }
        ]
    },
    {
        label: "Stablecoin Manager",
        contract: addresses.StablecoinManager,
        functions: [
            {
                label: "Set Stablecoin Params",
                selector: getSelector("setStablecoinParams(address,bool,uint256,uint256)"),
                params: [
                    { name: "token", type: "address", tooltip: "Token address" },
                    { name: "isStable", type: "bool", tooltip: "Is stablecoin? (true/false)" },
                    { name: "ltv", type: "uint256", tooltip: "Loan-to-value (percent)" },
                    { name: "newThreshold", type: "uint256", tooltip: "Liquidation threshold (percent)" }
                ]
            }
        ]
    }
];

// --- Proposal Review Modal ---
function ProposalReviewModal({ open, onClose, onConfirm, summary, calldata, loading, error, success }) {
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
            <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-lg relative animate-fade-in">
                <h3 className="text-lg font-semibold mb-2">Review Proposal</h3>
                <div className="mb-2 text-sm">{summary}</div>
                <div className="mb-2">
                    <label className="block text-xs font-medium mb-1">Encoded Calldata</label>
                    <div className="bg-gray-100 rounded p-2 text-xs font-mono break-all">{calldata}</div>
                </div>
                {error && <div className="text-red-500 mb-2">{error}</div>}
                {success && <div className="text-green-600 mb-2">{success}</div>}
                <div className="flex gap-2 mt-4">
                    <button className="bg-gray-300 px-4 py-2 rounded" onClick={onClose} disabled={loading}>Back</button>
                    <button className="bg-blue-600 text-white px-4 py-2 rounded" onClick={onConfirm} disabled={loading}>
                        {loading ? "Submitting..." : "Confirm & Submit"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// --- Proposal creation form with review modal ---
function ProposalForm({ governor, account, provider, onProposal }) {
    const [contractIdx, setContractIdx] = useState(0);
    const [funcIdx, setFuncIdx] = useState(0);
    const [inputs, setInputs] = useState({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [review, setReview] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [modalError, setModalError] = useState("");
    const [modalSuccess, setModalSuccess] = useState("");
    const [modalLoading, setModalLoading] = useState(false);

    const contract = PROPOSAL_OPTIONS[contractIdx];
    const func = contract.functions[funcIdx];

    useEffect(() => { setFuncIdx(0); setInputs({}); setReview(false); }, [contractIdx]);

    function handleInputChange(name, value, type) {
        let v = value;
        if (type === "bool") v = value === "true";
        setInputs(inputs => ({ ...inputs, [name]: v }));
    }

    const encodedParams = useMemo(() => {
        if (!func) return "0x";
        const types = func.params.map(p => p.type);
        const values = func.params.map(p => {
            let v = inputs[p.name];
            if (p.type === "uint256" || p.type === "int256") {
                if (typeof v === "string" && v.trim() !== "") return v;
                return "0";
            }
            if (p.type === "bool") return !!v;
            if (p.type === "address") return v || ethers.ZeroAddress;
            return v;
        });
        try {
            return ethers.AbiCoder.defaultAbiCoder().encode(types, values);
        } catch {
            return "0x";
        }
    }, [func, inputs]);

    const summary = useMemo(() => {
        if (!func) return "";
        return `${func.label} on ${contract.label} with params: ` + func.params.map(p => `${p.name}=${inputs[p.name]}`).join(", ");
    }, [func, contract, inputs]);

    async function handleSubmit(e) {
        e.preventDefault();
        setReview(true);
        setShowModal(true);
        setModalError("");
        setModalSuccess("");
    }

    async function handleModalConfirm() {
        setModalLoading(true);
        setModalError("");
        setModalSuccess("");
        try {
            const signer = await provider.getSigner();
            const gov = governor.connect(signer);
            await gov.proposeAdvanced(
                contract.contract,
                func.selector,
                encodedParams,
                1 // minVotesNeeded
            );
            setModalSuccess("Proposal submitted! It will appear in the list after confirmation.");
            setInputs({});
            setReview(false);
            setShowModal(false);
            if (onProposal) onProposal();
        } catch (err) {
            setModalError(err.message || "Failed to submit proposal");
        } finally {
            setModalLoading(false);
        }
    }

    return (
        <>
            <form onSubmit={handleSubmit} className="mb-6 p-4 border rounded bg-white/90 shadow">
                <h3 className="font-semibold mb-2">Create New Proposal</h3>
                <div className="flex flex-wrap gap-4 mb-2">
                    <div>
                        <label className="block text-xs font-medium mb-1">Contract</label>
                        <select className="border rounded p-1" value={contractIdx} onChange={e => setContractIdx(Number(e.target.value))}>
                            {PROPOSAL_OPTIONS.map((c, i) => <option key={c.label} value={i}>{c.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-medium mb-1">Function</label>
                        <select className="border rounded p-1" value={funcIdx} onChange={e => setFuncIdx(Number(e.target.value))}>
                            {contract.functions.map((f, i) => <option key={f.label} value={i}>{f.label}</option>)}
                        </select>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-2">
                    {func.params.map((p, i) => (
                        <div key={p.name} className="flex flex-col">
                            <label className="text-xs font-medium mb-1 flex items-center gap-1">
                                {p.name}
                                <span className="text-gray-400" title={p.tooltip}><Info size={12} /></span>
                            </label>
                            {p.type === "bool" ? (
                                <select className="border rounded p-1" value={inputs[p.name] ?? "false"} onChange={e => handleInputChange(p.name, e.target.value, p.type)}>
                                    <option value="true">true</option>
                                    <option value="false">false</option>
                                </select>
                            ) : (
                                <input
                                    className="border rounded p-1"
                                    type={p.type === "address" ? "text" : "number"}
                                    value={inputs[p.name] ?? ""}
                                    onChange={e => handleInputChange(p.name, e.target.value, p.type)}
                                    placeholder={p.tooltip}
                                    required
                                />
                            )}
                        </div>
                    ))}
                </div>
                <div className="mb-2">
                    <label className="block text-xs font-medium mb-1">Proposal Summary</label>
                    <div className="bg-gray-100 rounded p-2 text-xs font-mono">{summary}</div>
                </div>
                {error && <div className="text-red-500 mb-2">{error}</div>}
                {success && <div className="text-green-600 mb-2">{success}</div>}
                <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded" disabled={loading}>
                    Review Proposal
                </button>
            </form>
            <ProposalReviewModal
                open={showModal}
                onClose={() => setShowModal(false)}
                onConfirm={handleModalConfirm}
                summary={summary}
                calldata={encodedParams}
                loading={modalLoading}
                error={modalError}
                success={modalSuccess}
            />
        </>
    );
}

// --- Voting Analytics ---
function ProposalAnalytics({ forVotes, againstVotes, abstainVotes, quorum, totalVotes, state, timeLeft }) {
    // Pie/bar chart for votes
    const total = Number(forVotes) + Number(againstVotes) + Number(abstainVotes);
    const forPct = total ? (Number(forVotes) / total) * 100 : 0;
    const againstPct = total ? (Number(againstVotes) / total) * 100 : 0;
    const abstainPct = total ? (Number(abstainVotes) / total) * 100 : 0;
    // Quorum progress
    const quorumPct = totalVotes && quorum ? Math.min((total / quorum) * 100, 100) : 0;
    return (
        <div className="flex flex-col gap-2 mt-2">
            <div className="flex items-center gap-2">
                <span className="text-xs">Quorum Progress</span>
                <span className="text-xs text-gray-400" title="Quorum is the minimum number of votes required for a proposal to be valid."><Info size={12} /></span>
            </div>
            <div className="w-full bg-gray-200 rounded h-3 overflow-hidden">
                <div className="bg-blue-500 h-3 rounded" style={{ width: `${quorumPct}%` }}></div>
            </div>
            <div className="flex gap-2 text-xs">
                <span>Votes: {total} / {quorum}</span>
                <span>({quorumPct.toFixed(1)}%)</span>
            </div>
            <div className="flex items-center gap-2 mt-2">
                <span className="text-xs">Vote Breakdown</span>
                <span className="text-xs text-gray-400" title="Shows the proportion of For, Against, and Abstain votes."><Info size={12} /></span>
            </div>
            <div className="flex w-full h-4 rounded overflow-hidden">
                <div className="bg-green-500 h-4" style={{ width: `${forPct}%` }} title="For"></div>
                <div className="bg-red-500 h-4" style={{ width: `${againstPct}%` }} title="Against"></div>
                <div className="bg-gray-400 h-4" style={{ width: `${abstainPct}%` }} title="Abstain"></div>
            </div>
            <div className="flex gap-2 text-xs">
                <span className="text-green-700">For: {forVotes}</span>
                <span className="text-red-700">Against: {againstVotes}</span>
                <span className="text-gray-700">Abstain: {abstainVotes}</span>
            </div>
            {typeof timeLeft === "string" && (
                <div className="text-xs text-blue-700 mt-1">Time left: {timeLeft}</div>
            )}
        </div>
    );
}

export function GovernancePanel({ account, provider }) {
    const [govBalance, setGovBalance] = useState("0");
    const [votingPower, setVotingPower] = useState("0");
    const [proposals, setProposals] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [governor, setGovernor] = useState(null);
    const [multipliers, setMultipliers] = useState({ lend: "0", borrow: "0", repay: "0" });
    const [rewardEvents, setRewardEvents] = useState([]);
    const [allowedContracts, setAllowedContracts] = useState([]);
    const [priceFeeds, setPriceFeeds] = useState([]);
    const [filter, setFilter] = useState("All");
    const [updating, setUpdating] = useState(false);
    const intervalRef = useRef(null);

    // Proposal state labels
    const stateLabels = [
        "Pending", "Active", "Canceled", "Defeated", "Succeeded", "Queued", "Expired", "Executed"
    ];

    // Real-time polling for proposals and analytics
    useEffect(() => {
        if (!provider || !account) return;
        const VotingToken = new ethers.Contract(VotingToken_ADDRESS, VotingTokenABI.abi, provider);
        const governorInstance = new ethers.Contract(GOVERNOR_ADDRESS, GovernorABI.abi, provider);
        setGovernor(governorInstance);

        let mounted = true;
        async function fetchData() {
            setUpdating(true);
            setError("");
            try {
                setGovBalance((await VotingToken.balanceOf(account)).toString());
                setVotingPower((await governorInstance.getVotingPower(account)).toString());
                const lend = await governorInstance.lendMultiplier();
                const borrow = await governorInstance.borrowMultiplier();
                const repay = await governorInstance.repayMultiplier();
                setMultipliers({ lend, borrow, repay });
                const filter = governorInstance.filters.TokensGranted(account);
                const events = await governorInstance.queryFilter(filter, 0, "latest");
                setRewardEvents(events.map(ev => ({
                    action: ev.args.action,
                    asset: ev.args.asset,
                    amount: ev.args.amount.toString(),
                    usdValue: ev.args.usdValue.toString(),
                    tokens: ev.args.tokens.toString(),
                    blockNumber: ev.blockNumber
                })).reverse());
                const allowedSet = new Set();
                const allowedFilter = governorInstance.filters.AllowedContractSet();
                const allowedEvents = await governorInstance.queryFilter(allowedFilter, 0, "latest");
                allowedEvents.forEach(ev => {
                    if (ev.args.allowed) allowedSet.add(ev.args.contractAddr);
                    else allowedSet.delete(ev.args.contractAddr);
                });
                setAllowedContracts(Array.from(allowedSet));
                const feedMap = new Map();
                const feedFilter = governorInstance.filters.PriceFeedSet();
                const feedEvents = await governorInstance.queryFilter(feedFilter, 0, "latest");
                feedEvents.forEach(ev => {
                    feedMap.set(ev.args.asset, ev.args.feed);
                });
                setPriceFeeds(Array.from(feedMap.entries()));
                // Proposals
                const propFilter = governorInstance.filters.ProposalCreated();
                const propEvents = await governorInstance.queryFilter(propFilter, 0, "latest");
                let props = [];
                for (const ev of propEvents) {
                    const { proposalId, description, targets, calldatas } = ev.args;
                    const state = await governorInstance.state(proposalId);
                    let forVotes = "0", againstVotes = "0", abstainVotes = "0";
                    try {
                        const proposal = await governorInstance.proposals(proposalId);
                        forVotes = proposal.forVotes?.toString() || "0";
                        againstVotes = proposal.againstVotes?.toString() || "0";
                        abstainVotes = proposal.abstainVotes?.toString() || "0";
                    } catch { }
                    props.push({
                        id: proposalId.toString(),
                        description,
                        targets,
                        calldatas,
                        state,
                        forVotes,
                        againstVotes,
                        abstainVotes
                    });
                }
                if (mounted) setProposals(props.reverse());
            } catch (err) {
                if (mounted) setError(err.message || "Failed to fetch governance data");
            } finally {
                if (mounted) setUpdating(false);
            }
        }
        fetchData();
        // Poll every 10 seconds
        intervalRef.current = setInterval(fetchData, 10000);
        return () => {
            mounted = false;
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [provider, account]);

    async function vote(proposalId, support) {
        if (!provider) return;
        try {
            setLoading(true);
            setError("");
            const signer = await provider.getSigner();
            const governorInstance = new ethers.Contract(GOVERNOR_ADDRESS, GovernorABI.abi, signer);
            await governorInstance.castVote(proposalId, support); // 0=Against, 1=For, 2=Abstain
            alert("Vote submitted!");
        } catch (err) {
            setError(err.message || "Failed to submit vote");
        } finally {
            setLoading(false);
        }
    }

    async function execute(proposalId, targets, values, calldatas, description) {
        if (!provider) return;
        try {
            setLoading(true);
            setError("");
            const signer = await provider.getSigner();
            const governorInstance = new ethers.Contract(GOVERNOR_ADDRESS, GovernorABI.abi, signer);
            await governorInstance.execute(targets, values, calldatas, id(description));
            alert("Proposal executed!");
        } catch (err) {
            setError(err.message || "Failed to execute proposal");
        } finally {
            setLoading(false);
        }
    }

    function getStateLabel(state) {
        return stateLabels[state] || state;
    }

    // Proposal filtering logic
    const filteredProposals = useMemo(() => {
        if (filter === "All") return proposals;
        return proposals.filter(p => getStateLabel(p.state) === filter);
    }, [proposals, filter]);

    return (
        <div>
            <h2 className="text-xl font-bold mb-4">Governance</h2>
            {error && <div className="text-red-500 mb-2">{error}</div>}
            <DelegateSection account={account} provider={provider} />
            <div className="mb-4 flex gap-8">
                <div>
                    <div className="text-sm text-muted-foreground">VotingToken Balance</div>
                    <div className="font-mono text-lg">{govBalance}</div>
                </div>
                <div>
                    <div className="text-sm text-muted-foreground">Voting Power</div>
                    <div className="font-mono text-lg">{votingPower}</div>
                </div>
            </div>
            <div className="mb-4 p-4 border rounded bg-white/80">
                <h4 className="font-semibold mb-2">Current Reward Multipliers</h4>
                <div className="flex gap-6">
                    <div>Lending: <span className="font-mono">{formatMultiplier(multipliers.lend)}</span></div>
                    <div>Borrowing: <span className="font-mono">{formatMultiplier(multipliers.borrow)}</span></div>
                    <div>On-Time Repayment: <span className="font-mono">{formatMultiplier(multipliers.repay)}</span></div>
                </div>
            </div>
            <div className="mb-4 p-4 border rounded bg-white/80">
                <h4 className="font-semibold mb-2">Your Recent Voting Token Rewards</h4>
                {rewardEvents.length === 0 ? <div>No rewards yet.</div> : (
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="border-b"><th>Action</th><th>Asset</th><th>Amount</th><th>USD Value</th><th>Tokens</th><th>Block</th></tr>
                        </thead>
                        <tbody>
                            {rewardEvents.map((ev, i) => (
                                <tr key={i} className="border-b">
                                    <td>{["Lend", "Borrow", "Repay"][ev.action]}</td>
                                    <td className="font-mono">{ev.asset.slice(0, 6)}...{ev.asset.slice(-4)}</td>
                                    <td>{ethers.formatEther(ev.amount)}</td>
                                    <td>${Number(ev.usdValue).toLocaleString()}</td>
                                    <td>{ev.tokens}</td>
                                    <td>{ev.blockNumber}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
            <div className="mb-4 p-4 border rounded bg-white/80">
                <h4 className="font-semibold mb-2">Allowed Contracts</h4>
                <ul className="list-disc ml-6">
                    {allowedContracts.length === 0 ? <li>None</li> : allowedContracts.map(addr => <li key={addr} className="font-mono">{addr}</li>)}
                </ul>
                <h4 className="font-semibold mt-4 mb-2">Price Feeds</h4>
                <ul className="list-disc ml-6">
                    {priceFeeds.length === 0 ? <li>None</li> : priceFeeds.map(([asset, feed]) => <li key={asset} className="font-mono">{asset} → {feed}</li>)}
                </ul>
            </div>
            {governor && <ProposalForm governor={governor} account={account} provider={provider} onProposal={() => { }} />}
            {/* Proposal Filter Bar */}
            <div className="mb-4 flex flex-wrap gap-2 items-center">
                <span className="text-sm font-medium">Filter:</span>
                {['All', ...stateLabels].map(label => (
                    <button
                        key={label}
                        className={`px-3 py-1 rounded ${filter === label ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'} transition`}
                        onClick={() => setFilter(label)}
                    >
                        {label}
                    </button>
                ))}
                {updating && <span className="ml-2 text-xs text-blue-500 animate-pulse">Updating...</span>}
            </div>
            <h3 className="text-lg font-semibold mb-2">Active & Past Proposals</h3>
            {loading ? (
                <div>Loading...</div>
            ) : (
                <ul className="space-y-4">
                    {filteredProposals.length === 0 && <li>No proposals found.</li>}
                    {filteredProposals.map((p) => (
                        <li key={p.id} className="border rounded p-4 bg-white/80">
                            <div className="mb-2 font-medium">Proposal #{p.id}</div>
                            <div className="mb-1 text-sm text-gray-700">{p.description}</div>
                            <div className="mb-1 text-xs">State: <span className="font-mono">{getStateLabel(p.state)}</span></div>
                            <div className="mb-1 text-xs">For: {p.forVotes} | Against: {p.againstVotes} | Abstain: {p.abstainVotes}</div>
                            <ProposalAnalytics
                                forVotes={p.forVotes}
                                againstVotes={p.againstVotes}
                                abstainVotes={p.abstainVotes}
                                quorum={100} // Replace with actual quorum if available
                                totalVotes={filteredProposals.length}
                                state={p.state}
                                timeLeft={null} // Add time left logic if available
                            />
                            <div className="flex gap-2 mt-2">
                                <button className="bg-green-500 text-white px-3 py-1 rounded" onClick={() => vote(p.id, 1)}>Vote For</button>
                                <button className="bg-red-500 text-white px-3 py-1 rounded" onClick={() => vote(p.id, 0)}>Vote Against</button>
                                <button className="bg-gray-400 text-white px-3 py-1 rounded" onClick={() => vote(p.id, 2)}>Abstain</button>
                                {getStateLabel(p.state) === "Succeeded" && (
                                    <button className="bg-blue-600 text-white px-3 py-1 rounded" onClick={() => execute(p.targets, [0], p.calldatas, p.description)}>Execute</button>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}