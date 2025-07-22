import { useState } from 'react';

export default function EmailNotificationForm({ account }) {
    const [email, setEmail] = useState('');
    const [status, setStatus] = useState('idle'); // idle | loading | success | error
    const [error, setError] = useState('');

    const validateEmail = (email) => {
        // Simple email regex
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setStatus('loading');
        setError('');
        try {
            const res = await fetch('/api/notify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address: account, email }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to register email');
            }
            setStatus('success');
        } catch (err) {
            setError(err.message || 'Failed to register email');
            setStatus('error');
        }
    };

    return (
        <form onSubmit={handleSubmit} className="max-w-md mx-auto p-4 border rounded bg-white shadow">
            <h2 className="text-lg font-semibold mb-2">Register for Email Notifications</h2>
            <div className="mb-2">
                <label className="block text-sm font-medium mb-1">Wallet Address</label>
                <input
                    type="text"
                    value={account || ''}
                    disabled
                    className="w-full px-2 py-1 border rounded bg-gray-100 text-gray-700"
                />
            </div>
            <div className="mb-2">
                <label className="block text-sm font-medium mb-1">Email Address</label>
                <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full px-2 py-1 border rounded"
                    placeholder="your@email.com"
                    required
                />
            </div>
            <button
                type="submit"
                className="mt-2 px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
                disabled={!account || !validateEmail(email) || status === 'loading'}
            >
                {status === 'loading' ? 'Registering...' : 'Register Email'}
            </button>
            {status === 'success' && (
                <div className="mt-2 text-green-600">Successfully registered for notifications!</div>
            )}
            {status === 'error' && (
                <div className="mt-2 text-red-600">{error}</div>
            )}
        </form>
    );
} 