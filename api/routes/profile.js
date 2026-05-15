const express = require('express');
const router = express.Router();

const { getDatabase } = require('../database/db.js');

function formatSubTime(value) {
    if (!value) {
        return 'null';
    }

    if (value instanceof Date) {
        return value.toISOString();
    }

    return String(value);
}

function isSubscriptionActive(subUntil) {
    if (!subUntil) {
        return false;
    }

    const value = String(subUntil).trim();

    if (value === '') {
        return false;
    }

    if (
        value.toLowerCase() === 'lifetime' ||
        value.toLowerCase() === 'forever' ||
        value.toLowerCase() === 'never'
    ) {
        return true;
    }

    const time = new Date(value).getTime();

    if (Number.isNaN(time)) {
        return false;
    }

    return time > Date.now();
}

router.post('/profile', async (req, res) => {
    try {
        const { login, password, hwid } = req.body;

        if (!login || typeof login !== 'string') {
            return res.status(400).json({
                allowed: false,
                error: 'Login is required'
            });
        }

        if (!password || typeof password !== 'string') {
            return res.status(400).json({
                allowed: false,
                error: 'Password is required'
            });
        }

        if (!hwid || typeof hwid !== 'string') {
            return res.status(400).json({
                allowed: false,
                error: 'HWID is required'
            });
        }

        const db = getDatabase();

        db.get(
            `
            SELECT
                id,
                login,
                email,
                password,
                role,
                group_name,
                hwid,
                ram,
                sub_until,
                version,
                banned,
                status
            FROM users
            WHERE login = ? OR email = ?
            LIMIT 1
            `,
            [login, login],
            (err, user) => {
                if (err) {
                    console.error('❌ Profile database error:', err);

                    return res.status(500).json({
                        allowed: false,
                        error: 'Database error'
                    });
                }

                if (!user) {
                    return res.status(401).json({
                        allowed: false,
                        error: 'Invalid login or password'
                    });
                }

                if (String(user.password) !== String(password)) {
                    return res.status(401).json({
                        allowed: false,
                        error: 'Invalid login or password'
                    });
                }

                if (Number(user.banned) === 1) {
                    return res.status(403).json({
                        allowed: false,
                        error: 'User is banned',
                        username: user.login || 'null',
                        hwid: user.hwid || 'null',
                        role: user.role || 'null',
                        uid: String(user.id),
                        subTime: formatSubTime(user.sub_until)
                    });
                }

                db.get(
                    `
                    SELECT id, login
                    FROM users
                    WHERE hwid = ?
                    LIMIT 1
                    `,
                    [hwid],
                    (hwidErr, hwidUser) => {
                        if (hwidErr) {
                            console.error('❌ HWID check database error:', hwidErr);

                            return res.status(500).json({
                                allowed: false,
                                error: 'Database error'
                            });
                        }

                        if (hwidUser && Number(hwidUser.id) !== Number(user.id)) {
                            return res.status(409).json({
                                allowed: false,
                                error: 'HWID already used by another user'
                            });
                        }

                        db.run(
                            `
                            UPDATE users
                            SET hwid = ?
                            WHERE id = ?
                            `,
                            [hwid, user.id],
                            function (updateErr) {
                                if (updateErr) {
                                    console.error('❌ HWID update database error:', updateErr);

                                    return res.status(500).json({
                                        allowed: false,
                                        error: 'Database error'
                                    });
                                }

                                const role = user.role || 'user';

                                const isAdmin =
                                    role === 'admin' ||
                                    role === 'owner' ||
                                    role === 'moderator';

                                const hasActiveSub = isSubscriptionActive(user.sub_until);

                                const allowed = isAdmin || hasActiveSub;

                                if (!allowed) {
                                    return res.status(403).json({
                                        allowed: false,
                                        error: 'Subscription expired',
                                        username: user.login || 'null',
                                        hwid: hwid,
                                        role: role,
                                        uid: String(user.id),
                                        subTime: formatSubTime(user.sub_until)
                                    });
                                }

                                return res.json({
                                    allowed: true,
                                    message: 'HWID saved successfully',
                                    username: user.login || 'null',
                                    hwid: hwid,
                                    role: role,
                                    uid: String(user.id),
                                    subTime: formatSubTime(user.sub_until),
                                    ram: user.ram ? String(user.ram) : '4096',
                                    version: user.version || 'default',
                                    group: user.group_name || 'Default'
                                });
                            }
                        );
                    }
                );
            }
        );
    } catch (error) {
        console.error('❌ Profile route error:', error);

        return res.status(500).json({
            allowed: false,
            error: 'Server error'
        });
    }
});

module.exports = router;
