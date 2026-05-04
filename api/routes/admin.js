const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { getDb } = require('../database/db');

// Генерация случайного URL для админки
function generateAdminUrl() {
    return crypto.randomBytes(6).toString('hex');
}

// Создание новой админ-сессии
router.post('/admin/create-session', async (req, res) => {
    try {
        const { adminPassword } = req.body;
        
        // Простая проверка пароля (в продакшене используй env переменную)
        const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
        
        if (adminPassword !== ADMIN_PASSWORD) {
            return res.status(403).json({ error: 'Неверный пароль' });
        }

        const db = getDb();
        const sessionUrl = generateAdminUrl();
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24); // Сессия на 24 часа

        db.run(
            `INSERT INTO admin_sessions (session_url, expires_at) VALUES (?, ?)`,
            [sessionUrl, expiresAt.toISOString()],
            (err) => {
                if (err) {
                    console.error('Error creating admin session:', err);
                    return res.status(500).json({ error: 'Ошибка создания сессии' });
                }

                res.json({
                    success: true,
                    adminUrl: `/${sessionUrl}.html`,
                    expiresAt: expiresAt.toISOString()
                });
            }
        );

    } catch (error) {
        console.error('Create session error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Проверка валидности админ-сессии
router.get('/admin/verify-session/:sessionUrl', async (req, res) => {
    try {
        const { sessionUrl } = req.params;
        const db = getDb();

        db.get(
            `SELECT * FROM admin_sessions WHERE session_url = ? AND expires_at > datetime('now')`,
            [sessionUrl],
            (err, session) => {
                if (err || !session) {
                    return res.status(403).json({ valid: false });
                }

                res.json({ valid: true });
            }
        );

    } catch (error) {
        console.error('Verify session error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Генерация ключей активации
router.post('/admin/generate-keys', async (req, res) => {
    try {
        const { sessionUrl, role, count, durationDays } = req.body;
        const db = getDb();

        // Проверяем сессию
        db.get(
            `SELECT * FROM admin_sessions WHERE session_url = ? AND expires_at > datetime('now')`,
            [sessionUrl],
            (err, session) => {
                if (err || !session) {
                    return res.status(403).json({ error: 'Недействительная сессия' });
                }

                // Генерируем ключи
                const keys = [];
                const keyCount = parseInt(count) || 1;
                const duration = parseInt(durationDays) || 30;

                let completed = 0;
                for (let i = 0; i < keyCount; i++) {
                    const keyCode = `${role.toUpperCase()}-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
                    
                    db.run(
                        `INSERT INTO activation_keys (key_code, role, duration_days) VALUES (?, ?, ?)`,
                        [keyCode, role, duration],
                        (err) => {
                            if (err) {
                                console.error('Error creating key:', err);
                            } else {
                                keys.push(keyCode);
                            }
                            
                            completed++;
                            if (completed === keyCount) {
                                res.json({ success: true, keys });
                            }
                        }
                    );
                }
            }
        );

    } catch (error) {
        console.error('Generate keys error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Создание промокода
router.post('/admin/create-promocode', async (req, res) => {
    try {
        const { sessionUrl, code, discountPercent, maxUses, expiresAt } = req.body;
        const db = getDb();

        // Проверяем сессию
        db.get(
            `SELECT * FROM admin_sessions WHERE session_url = ? AND expires_at > datetime('now')`,
            [sessionUrl],
            (err, session) => {
                if (err || !session) {
                    return res.status(403).json({ error: 'Недействительная сессия' });
                }

                db.run(
                    `INSERT INTO promocodes (code, discount_percent, max_uses, expires_at) VALUES (?, ?, ?, ?)`,
                    [code.toUpperCase(), discountPercent, maxUses || 0, expiresAt || null],
                    (err) => {
                        if (err) {
                            console.error('Error creating promocode:', err);
                            return res.status(500).json({ error: 'Ошибка создания промокода' });
                        }

                        res.json({ success: true, code: code.toUpperCase() });
                    }
                );
            }
        );

    } catch (error) {
        console.error('Create promocode error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получение списка промокодов
router.get('/admin/promocodes/:sessionUrl', async (req, res) => {
    try {
        const { sessionUrl } = req.params;
        const db = getDb();

        // Проверяем сессию
        db.get(
            `SELECT * FROM admin_sessions WHERE session_url = ? AND expires_at > datetime('now')`,
            [sessionUrl],
            (err, session) => {
                if (err || !session) {
                    return res.status(403).json({ error: 'Недействительная сессия' });
                }

                db.all(
                    `SELECT * FROM promocodes ORDER BY created_at DESC`,
                    [],
                    (err, promocodes) => {
                        if (err) {
                            console.error('Error fetching promocodes:', err);
                            return res.status(500).json({ error: 'Ошибка получения промокодов' });
                        }

                        res.json({ promocodes });
                    }
                );
            }
        );

    } catch (error) {
        console.error('Get promocodes error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получение статистики
router.get('/admin/stats/:sessionUrl', async (req, res) => {
    try {
        const { sessionUrl } = req.params;
        const db = getDb();

        // Проверяем сессию
        db.get(
            `SELECT * FROM admin_sessions WHERE session_url = ? AND expires_at > datetime('now')`,
            [sessionUrl],
            (err, session) => {
                if (err || !session) {
                    return res.status(403).json({ error: 'Недействительная сессия' });
                }

                // Получаем статистику
                db.get(`SELECT COUNT(*) as total FROM users`, [], (err, usersCount) => {
                    db.get(`SELECT COUNT(*) as total FROM activation_keys WHERE used = 0`, [], (err, unusedKeys) => {
                        db.get(`SELECT COUNT(*) as total FROM invoices WHERE status = 'paid'`, [], (err, paidInvoices) => {
                            db.get(`SELECT SUM(amount) as total FROM invoices WHERE status = 'paid'`, [], (err, totalRevenue) => {
                                res.json({
                                    users: usersCount?.total || 0,
                                    unusedKeys: unusedKeys?.total || 0,
                                    paidInvoices: paidInvoices?.total || 0,
                                    totalRevenue: totalRevenue?.total || 0
                                });
                            });
                        });
                    });
                });
            }
        );

    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получение списка пользователей
router.get('/admin/users/:sessionUrl', async (req, res) => {
    try {
        const { sessionUrl } = req.params;
        const db = getDb();

        db.get(
            `SELECT * FROM admin_sessions WHERE session_url = ? AND expires_at > datetime('now')`,
            [sessionUrl],
            (err, session) => {
                if (err || !session) {
                    return res.status(403).json({ error: 'Недействительная сессия' });
                }

                db.all(
                    `SELECT id, login, email, role, sub_until, created_at, banned FROM users ORDER BY created_at DESC`,
                    [],
                    (err, users) => {
                        if (err) {
                            console.error('Error fetching users:', err);
                            return res.status(500).json({ error: 'Ошибка получения пользователей' });
                        }

                        res.json({ users });
                    }
                );
            }
        );

    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Обновление пользователя
router.post('/admin/update-user', async (req, res) => {
    try {
        const { sessionUrl, userId, role, subUntil, banned } = req.body;
        const db = getDb();

        db.get(
            `SELECT * FROM admin_sessions WHERE session_url = ? AND expires_at > datetime('now')`,
            [sessionUrl],
            (err, session) => {
                if (err || !session) {
                    return res.status(403).json({ error: 'Недействительная сессия' });
                }

                db.run(
                    `UPDATE users SET role = ?, sub_until = ?, banned = ? WHERE id = ?`,
                    [role, subUntil, banned ? 1 : 0, userId],
                    (err) => {
                        if (err) {
                            console.error('Error updating user:', err);
                            return res.status(500).json({ error: 'Ошибка обновления пользователя' });
                        }

                        res.json({ success: true });
                    }
                );
            }
        );

    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Удаление пользователя
router.post('/admin/delete-user', async (req, res) => {
    try {
        const { sessionUrl, userId } = req.body;
        const db = getDb();

        db.get(
            `SELECT * FROM admin_sessions WHERE session_url = ? AND expires_at > datetime('now')`,
            [sessionUrl],
            (err, session) => {
                if (err || !session) {
                    return res.status(403).json({ error: 'Недействительная сессия' });
                }

                db.run(
                    `DELETE FROM users WHERE id = ?`,
                    [userId],
                    (err) => {
                        if (err) {
                            console.error('Error deleting user:', err);
                            return res.status(500).json({ error: 'Ошибка удаления пользователя' });
                        }

                        res.json({ success: true });
                    }
                );
            }
        );

    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Проверка промокода
router.post('/payment/check-promocode', async (req, res) => {
    try {
        const { code } = req.body;
        const db = getDb();

        db.get(
            `SELECT * FROM promocodes WHERE code = ? AND active = 1 AND (expires_at IS NULL OR expires_at > datetime('now')) AND (max_uses = 0 OR used_count < max_uses)`,
            [code.toUpperCase()],
            (err, promo) => {
                if (err || !promo) {
                    return res.json({ valid: false, error: 'Промокод не найден или недействителен' });
                }

                res.json({
                    valid: true,
                    discount: promo.discount_percent
                });
            }
        );

    } catch (error) {
        console.error('Check promocode error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

module.exports = router;
