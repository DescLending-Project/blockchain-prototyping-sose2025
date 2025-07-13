import { useEffect, useState } from "react";
import { ethers } from "ethers";
import GovTokenABI from "@/abis/GovToken.json";
import GovernorABI from "@/abis/ProtocolGovernor.json";
import addresses from "@/addresses.json";

const GOVTOKEN_ADDRESS = addresses.GovToken;
const GOVERNOR_ADDRESS = addresses.ProtocolGovernor;

function ProposalForm({ governor, account, provider, onProposal }) {
    const [target, setTarget] = useState("");
    const [calldata, setCalldata] = useState("");
    const [description, setDescription] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    async function submitProposal(e) {
        e.preventDefault();
        setLoading(true);
        setError("");
        try {
            const signer = await provider.getSigner();
            const tx = await governor.connect(signer).propose(
                [target], [0], [calldata], description
            );
            await tx.wait();
            setTarget(""); setCalldata(""); setDescription("");
            onProposal && onProposal();
            alert("Proposal submitted!");
        } catch (err) {
            setError(err.message || "Failed to submit proposal");
        }
        setLoading(false);
    }

    return (
        <form onSubmit={submitProposal} className="mb-6 p-4 border rounded bg-white/80">
            <h4 className="font-semibold mb-2">Create Proposal</h4>
            <div className="mb-2">
                <input className="border p-1 rounded w-full" value={target} onChange={e => setTarget(e.target.value)} placeholder="Target contract address" required />
            </div>
            <div className="mb-2">
                <input className="border p-1 rounded w-full" value={calldata} onChange={e => setCalldata(e.target.value)} placeholder="Calldata (hex)" required />
            </div>
            <div className="mb-2">
                <input className="border p-1 rounded w-full" value={description} onChange={e => setDescription(e.target.value)} placeholder="Proposal description" required />
            </div>
            <button type="submit" className="bg-blue-600 text-white px-3 py-1 rounded" disabled={loading}>Submit Proposal</button>
            {error && <div className="text-red-500 mt-2">{error}</div>}
        </form>
    );
}

export function GovernancePanel({ account, provider }) {
    const [govBalance, setGovBalance] = useState("0");
    const [votingPower, setVotingPower] = useState("0");
    const [proposals, setProposals] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [governor, setGovernor] = useState(null);

    useEffect(() => {
        if (!provider || !account) return;
        const govToken = new ethers.Contract(GOVTOKEN_ADDRESS, GovTokenABI.abi, provider);
        const governorInstance = new ethers.Contract(GOVERNOR_ADDRESS, GovernorABI.abi, provider);
        setGovernor(governorInstance);

        async function fetchData() {
            setLoading(true);
            setError("");
            try {
                setGovBalance((await govToken.balanceOf(account)).toString());
                const block = await provider.getBlockNumber();
                setVotingPower((await governorInstance.getVotes(account, block)).toString());
                // Fetch proposals (using events for more robust tracking)
                const filter = governorInstance.filters.ProposalCreated();
                const events = await governorInstance.queryFilter(filter, 0, "latest");
                let props = [];
                for (const ev of events) {
                    const { proposalId, description, targets, calldatas } = ev.args;
                    const state = await governorInstance.state(proposalId);
                    const proposal = await governorInstance.proposals(proposalId);
                    const forVotes = proposal.forVotes?.toString() || "0";
                    const againstVotes = proposal.againstVotes?.toString() || "0";
                    const abstainVotes = proposal.abstainVotes?.toString() || "0";
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
                setProposals(props.reverse());
            } catch (err) {
                setError(err.message || "Failed to fetch governance data");
            } finally {
                setLoading(false);
            }
        }
        fetchData();
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
            await governorInstance.execute(targets, values, calldatas, ethers.utils.id(description));
            alert("Proposal executed!");
        } catch (err) {
            setError(err.message || "Failed to execute proposal");
        } finally {
            setLoading(false);
        }
    }

    function getStateLabel(state) {
        // See OpenZeppelin Governor ProposalState enum
        const states = [
            "Pending", "Active", "Canceled", "Defeated", "Succeeded", "Queued", "Expired", "Executed"
        ];
        return states[state] || state;
    }

    return (
        <div>
            <h2 className="text-xl font-bold mb-4">Governance</h2>
            {error && <div className="text-red-500 mb-2">{error}</div>}
            <div className="mb-4 flex gap-8">
                <div>
                    <div className="text-sm text-muted-foreground">GovToken Balance</div>
                    <div className="font-mono text-lg">{govBalance}</div>
                </div>
                <div>
                    <div className="text-sm text-muted-foreground">Voting Power</div>
                    <div className="font-mono text-lg">{votingPower}</div>
                </div>
            </div>
            {governor && <ProposalForm governor={governor} account={account} provider={provider} onProposal={() => window.location.reload()} />}
            <h3 className="text-lg font-semibold mb-2">Active & Past Proposals</h3>
            {loading ? (
                <div>Loading...</div>
            ) : (
                <ul className="space-y-4">
                    {proposals.length === 0 && <li>No proposals found.</li>}
                    {proposals.map((p) => (
                        <li key={p.id} className="border rounded p-4 bg-white/80">
                            <div className="mb-2 font-medium">Proposal #{p.id}</div>
                            <div className="mb-1 text-sm text-gray-700">{p.description}</div>
                            <div className="mb-1 text-xs">State: <span className="font-mono">{getStateLabel(p.state)}</span></div>
                            <div className="mb-1 text-xs">For: {p.forVotes} | Against: {p.againstVotes} | Abstain: {p.abstainVotes}</div>
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