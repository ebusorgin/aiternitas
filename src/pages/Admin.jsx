import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

function Admin() {
    const { user } = useAuth();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [newAdminEmail, setNewAdminEmail] = useState('');
    const [actionMessage, setActionMessage] = useState(null);

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            const response = await fetch('/api/admin/users');
            if (!response.ok) {
                throw new Error('Failed to fetch users');
            }
            const data = await response.json();
            setUsers(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleAddAdmin = async (e) => {
        e.preventDefault();
        setActionMessage(null);
        try {
            const response = await fetch('/api/admin/add', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email: newAdminEmail }),
            });

            const data = await response.json();

            if (response.ok) {
                setActionMessage({ type: 'success', text: data.message });
                setNewAdminEmail('');
            } else {
                setActionMessage({ type: 'error', text: data.error });
            }
        } catch (err) {
            setActionMessage({ type: 'error', text: 'Ошибка сети' });
        }
    };

    if (loading) return <div className="p-8 text-white">Загрузка...</div>;
    if (error) return <div className="p-8 text-red-500">Ошибка: {error}</div>;

    return (
        <div className="min-h-screen bg-gray-900 text-white p-8">
            <div className="max-w-6xl mx-auto">
                <h1 className="text-3xl font-bold mb-8">Панель администратора</h1>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Список пользователей */}
                    <div className="bg-gray-800 rounded-lg p-6 shadow-lg">
                        <h2 className="text-xl font-semibold mb-4">Пользователи ({users.length})</h2>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-gray-700">
                                        <th className="p-2">Имя</th>
                                        <th className="p-2">Email</th>
                                        <th className="p-2">Дата регистрации</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map((u) => (
                                        <tr key={u.id} className="border-b border-gray-700 hover:bg-gray-750">
                                            <td className="p-2">{u.name}</td>
                                            <td className="p-2">{u.email}</td>
                                            <td className="p-2">{new Date(u.created_at).toLocaleDateString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Управление админами */}
                    <div className="bg-gray-800 rounded-lg p-6 shadow-lg h-fit">
                        <h2 className="text-xl font-semibold mb-4">Добавить администратора</h2>
                        <form onSubmit={handleAddAdmin} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Email пользователя</label>
                                <input
                                    type="email"
                                    value={newAdminEmail}
                                    onChange={(e) => setNewAdminEmail(e.target.value)}
                                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                                    placeholder="user@example.com"
                                    required
                                />
                            </div>
                            <button
                                type="submit"
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded transition-colors"
                            >
                                Назначить администратором
                            </button>
                        </form>

                        {actionMessage && (
                            <div className={`mt-4 p-3 rounded ${actionMessage.type === 'success' ? 'bg-green-900/50 text-green-200' : 'bg-red-900/50 text-red-200'}`}>
                                {actionMessage.text}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Admin;
