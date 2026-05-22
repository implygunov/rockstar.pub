const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDatabase } = require('../database/db.js');

router.post('/login', async (req, res) => {
    try {
        const { login, password } = req.body;

        if (!login || !password) {
            return res.status(400).json({
                allowed: false,
                error: 'Login and password required'
            });
        }

        const db = getDatabase();

        db.get(
            `SELECT id, login, password, email, role, group_name, ram, sub_until, version, banned, status
             FROM users WHERE login = ? LIMIT 1`,
            [login],
            async (err, user) => {
                if (err) {
                    return res.status(500).json({ allowed: false, error: 'Database error' });
                }

                if (!user) {
                    return res.status(403).json({ allowed: false, error: 'User not found' });
                }

                // Проверка пароля
                const validPassword = await bcrypt.compare(password, user.password);
                if (!validPassword) {
                    return res.status(403).json({ allowed: false, error: 'Wrong password' });
                }

                // Проверка бана
                if (Number(user.banned) === 1) {
                    return res.status(403).json({ allowed: false, error: 'User is banned' });
                }

                // Проверка подписки
                const role = user.role || 'user';
                const isAdmin = ['admin', 'owner', 'moderator'].includes(role);
                const hasActiveSub = isSubscriptionActive(user.sub_until);
                const allowed = isAdmin || hasActiveSub;

                if (!allowed) {
                    return res.status(403).json({
                        allowed: false,
                        error: 'Subscription expired',
                        username: user.login,
                        role: role
                    });
                }

                return res.json({
                    allowed: true,
                    username: user.login,
                    role: role,
                    uid: String(user.id),
                    subTime: formatSubTime(user.sub_until),
                    ram: user.ram ? String(user.ram) : '4096',
                    version: user.version || 'default',
                    group: user.group_name || 'Default'
                });
            }
        );
    } catch (error) {
        return res.status(500).json({ allowed: false, error: 'Server error' });
    }
});

function formatSubTime(value) {
    if (!value) return 'null';
    if (value instanceof Date) return value.toISOString();
    return String(value);
}

function isSubscriptionActive(subUntil) {
    if (!subUntil) return false;
    const value = String(subUntil).trim();
    if (['lifetime', 'forever', 'never'].includes(value.toLowerCase())) return true;
    const time = new Date(value).getTime();
    if (Number.isNaN(time)) return false;
    return time > Date.now();
}

module.exports = router;
