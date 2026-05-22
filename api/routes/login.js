const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDatabase } = require('../database/db.js');

function formatSubTime(value) {
    if (!value) return 'null';
    if (value instanceof Date) return value.toISOString();
    return String(value);
}

function isSubscriptionActive(subUntil) {
    if (!subUntil) return false;
    const value = String(subUntil).trim();
    if (value === '') return false;
    if (['lifetime', 'forever', 'never'].includes(value.toLowerCase())) return true;
    const time = new Date(value).getTime();
    if (Number.isNaN(time)) return false;
    return time > Date.now();
}

router.post('/login', async (req, res) => {
    try {
        const { login, password, hwid } = req.body;
        console.log('[Login] Request from:', login, 'HWID:', hwid ? hwid.substring(0, 16) + '...' : 'none');

        if (!login || !password) {
            return res.status(400).json({
                allowed: false,
                error: 'Login and password required'
            });
        }

        const db = getDatabase();

        db.get(
            `SELECT id, login, password, role, hwid, ram, sub_until, banned
             FROM users WHERE login = ? LIMIT 1`,
            [login],
            async (err, user) => {
                if (err) {
                    console.error('[Login] DB error:', err);
                    return res.status(500).json({ allowed: false, error: 'Database error' });
                }

                if (!user) {
                    return res.status(403).json({ allowed: false, error: 'User not found' });
                }

                // Проверка пароля
                let validPassword = false;
                try {
                    validPassword = await bcrypt.compare(password, user.password);
                } catch (e) {
                    // Может plain text
                    validPassword = (password === user.password);
                }

                if (!validPassword) {
                    return res.status(403).json({ allowed: false, error: 'Wrong password' });
                }

                if (Number(user.banned) === 1) {
                    return res.status(403).json({ allowed: false, error: 'User is banned' });
                }

                // Сохранить HWID
                if (hwid && typeof hwid === 'string' && hwid !== 'unknown') {
                    db.run(
                        'UPDATE users SET hwid = ? WHERE id = ?',
                        [hwid, user.id],
                        (err2) => {
                            if (err2) console.error('[Login] HWID update error:', err2);
                            else console.log('[Login] HWID saved for', user.login, ':', hwid.substring(0, 16) + '...');
                        }
                    );
                }

                const role = user.role || 'user';
                const isAdmin = ['admin', 'owner', 'moderator'].includes(role);
                const hasActiveSub = isSubscriptionActive(user.sub_until);

                if (!isAdmin && !hasActiveSub) {
                    return res.status(403).json({
                        allowed: false,
                        error: 'Subscription expired',
                        username: user.login,
                        role: role
                    });
                }

                console.log('[Login] Success:', user.login, 'role:', role);

                return res.json({
                    allowed: true,
                    username: user.login,
                    hwid: hwid || user.hwid || '',
                    role: role,
                    uid: String(user.id),
                    subTime: formatSubTime(user.sub_until),
                    ram: user.ram ? String(user.ram) : '4096'
                });
            }
        );
    } catch (error) {
        console.error('[Login] Exception:', error);
        return res.status(500).json({ allowed: false, error: 'Server error' });
    }
});

module.exports = router;
