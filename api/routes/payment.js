const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const https = require('https');
const { getDb } = require('../database/db');

const JWT_SECRET = process.env.JWT_SECRET || 'your_secret_key';
const CRYPTOBOT_TOKEN = '504363:AAHYQ61JqLa3tWGx9G2zrJiCMp5C2JdIoCB';
const CRYPTOBOT_API = 'https://pay.crypt.bot/api';

// Middleware для проверки токена
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Токен не предоставлен' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    req.userId = decoded.id;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Недействительный токен' });
  }
};

// Вспомогательная функция для HTTPS запросов
function httpsRequest(url, options, data = null) {
    return new Promise((resolve, reject) => {
        const req = https.request(url, options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (e) {
                    resolve(body);
                }
            });
        });
        
        req.on('error', reject);
        
        if (data) {
            req.write(JSON.stringify(data));
        }
        
        req.end();
    });
}

// Создание инвойса для оплаты
router.post('/payment/create-invoice', authMiddleware, async (req, res) => {
    try {
        const { planType, amount, promocode } = req.body;
        const userId = req.user.id;

        if (!planType || !amount) {
            return res.status(400).json({ error: 'Не указан тариф или сумма' });
        }

        let finalAmount = amount;
        let discountPercent = 0;

        // Проверяем промокод если указан
        if (promocode) {
            const db = getDb();
            const promoResult = await new Promise((resolve, reject) => {
                db.get(
                    `SELECT * FROM promocodes WHERE code = ? AND active = 1 AND (expires_at IS NULL OR expires_at > datetime('now')) AND (max_uses = 0 OR used_count < max_uses)`,
                    [promocode.toUpperCase()],
                    (err, promo) => {
                        if (err) reject(err);
                        else resolve(promo);
                    }
                );
            });

            if (promoResult) {
                discountPercent = promoResult.discount_percent;
                finalAmount = amount * (1 - discountPercent / 100);
                
                // Увеличиваем счетчик использований
                db.run(
                    `UPDATE promocodes SET used_count = used_count + 1 WHERE code = ?`,
                    [promocode.toUpperCase()]
                );
                
                // console.log(`Promocode ${promocode} applied: ${discountPercent}% discount`);
                // console.log(`Original: ${amount}, Final: ${finalAmount}`);
            }
        }

        // Конвертируем в USDT (примерно 100 рублей = 1 USDT)
        const amountInUSDT = (finalAmount / 100).toFixed(2);
        
        // Минимум 0.02 USDT
        const finalAmountUSDT = Math.max(parseFloat(amountInUSDT), 0.02);

        // Создаем инвойс через CryptoBot API
        const description = discountPercent > 0 
            ? `Подписка ${planType} (скидка ${discountPercent}%)`
            : `Подписка ${planType}`;

        const invoiceData = {
            asset: 'USDT',
            amount: finalAmountUSDT.toString(),
            description: description,
            paid_btn_name: 'callback',
            paid_btn_url: `${req.protocol}://${req.get('host')}/payment-success.html`,
            payload: JSON.stringify({
                userId: userId,
                planType: planType,
                originalAmount: amount,
                finalAmount: finalAmount,
                discountPercent: discountPercent
            })
        };

        const data = await httpsRequest(`${CRYPTOBOT_API}/createInvoice`, {
            method: 'POST',
            headers: {
                'Crypto-Pay-API-Token': CRYPTOBOT_TOKEN,
                'Content-Type': 'application/json'
            }
        }, invoiceData);

        // console.log('CryptoBot response:', data);

        if (!data.ok) {
            console.error('CryptoBot error:', data);
            return res.status(500).json({ 
                error: 'Ошибка создания инвойса',
                details: data.error || data
            });
        }

        // Сохраняем инвойс в БД
        const db = getDb();
        const invoiceId = data.result.invoice_id;
        
        db.run(
            `INSERT INTO invoices (invoice_id, user_id, plan_type, amount, status, created_at) 
             VALUES (?, ?, ?, ?, 'pending', datetime('now'))`,
            [invoiceId, userId, planType, amount]
        );

        res.json({
            success: true,
            payUrl: data.result.pay_url,
            invoiceId: invoiceId
        });

    } catch (error) {
        console.error('Create invoice error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Webhook для получения уведомлений от CryptoBot
router.post('/payment/webhook', async (req, res) => {
    try {
        const update = req.body;
        
        // console.log('=== WEBHOOK RECEIVED ===');
        // console.log('Headers:', req.headers);
        // console.log('Body:', JSON.stringify(update, null, 2));

        // Проверяем подпись
        const signature = req.headers['crypto-pay-api-signature'];
        if (signature && !verifyWebhookSignature(req.body, signature)) {
            // console.log('Invalid signature!');
            return res.status(401).json({ error: 'Invalid signature' });
        }

        if (update.update_type === 'invoice_paid') {
            const invoice = update.payload;
            const invoiceId = invoice.invoice_id;
            
            // console.log('Invoice paid:', invoiceId);
            
            let payload;
            try {
                payload = JSON.parse(invoice.payload);
                // console.log('Parsed payload:', payload);
            } catch (e) {
                console.error('Error parsing payload:', e);
                return res.json({ ok: true });
            }
            
            const db = getDb();

            // Обновляем статус инвойса
            db.run(
                `UPDATE invoices SET status = 'paid', paid_at = datetime('now') WHERE invoice_id = ?`,
                [invoiceId],
                (err) => {
                    if (err) console.error('Error updating invoice:', err);
                    // else console.log('Invoice updated:', invoiceId);
                }
            );

            // Выдаем роль beta и подписку
            const subDuration = getPlanDuration(payload.planType);
            const subUntil = new Date();
            subUntil.setDate(subUntil.getDate() + subDuration);
            const subUntilStr = subUntil.toISOString().split('T')[0];

            // console.log(`Updating user ${payload.userId} to beta until ${subUntilStr}`);

            db.run(
                `UPDATE users SET role = 'beta', sub_until = ? WHERE id = ?`,
                [subUntilStr, payload.userId],
                (err) => {
                    if (err) {
                        console.error('Error updating user:', err);
                    }
                    // else console.log(`✅ User ${payload.userId} upgraded to beta until ${subUntilStr}`);
                }
            );
        }

        res.json({ ok: true });

    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ error: 'Webhook processing error' });
    }
});

// Проверка статуса платежа
router.get('/payment/check/:invoiceId', authMiddleware, async (req, res) => {
    try {
        const { invoiceId } = req.params;
        const userId = req.user.id;

        const db = getDb();
        
        db.get(
            `SELECT * FROM invoices WHERE invoice_id = ? AND user_id = ?`,
            [invoiceId, userId],
            async (err, invoice) => {
                if (err || !invoice) {
                    return res.status(404).json({ error: 'Инвойс не найден' });
                }

                // Проверяем статус через API
                httpsRequest(`${CRYPTOBOT_API}/getInvoices?invoice_ids=${invoiceId}`, {
                    method: 'GET',
                    headers: {
                        'Crypto-Pay-API-Token': CRYPTOBOT_TOKEN
                    }
                }).then(data => {
                    // console.log('Check invoice response:', data);
                    
                    if (data.ok && data.result.items.length > 0) {
                        const apiInvoice = data.result.items[0];
                        
                        // Если оплачен, обновляем пользователя
                        if (apiInvoice.status === 'paid' && invoice.status !== 'paid') {
                            // console.log('Invoice is paid, updating user...');
                            
                            // Обновляем статус инвойса
                            db.run(
                                `UPDATE invoices SET status = 'paid', paid_at = datetime('now') WHERE invoice_id = ?`,
                                [invoiceId]
                            );

                            // Выдаем роль beta и подписку
                            const subDuration = getPlanDuration(invoice.plan_type);
                            const subUntil = new Date();
                            subUntil.setDate(subUntil.getDate() + subDuration);
                            const subUntilStr = subUntil.toISOString().split('T')[0];

                            db.run(
                                `UPDATE users SET role = 'beta', sub_until = ? WHERE id = ?`,
                                [subUntilStr, userId],
                                (err) => {
                                    if (err) {
                                        console.error('Error updating user:', err);
                                    }
                                    // else console.log(`✅ User ${userId} upgraded to beta until ${subUntilStr}`);
                                }
                            );
                        }
                        
                        res.json({
                            status: apiInvoice.status,
                            paid: apiInvoice.status === 'paid'
                        });
                    } else {
                        res.json({
                            status: invoice.status,
                            paid: invoice.status === 'paid'
                        });
                    }
                }).catch(err => {
                    console.error('API error:', err);
                    res.json({
                        status: invoice.status,
                        paid: invoice.status === 'paid'
                    });
                });
            }
        );

    } catch (error) {
        console.error('Check payment error:', error);
        res.status(500).json({ error: 'Ошибка проверки платежа' });
    }
});

// Вспомогательные функции
function verifyWebhookSignature(body, signature) {
    const secret = crypto.createHash('sha256').update(CRYPTOBOT_TOKEN).digest();
    const checkString = JSON.stringify(body);
    const hmac = crypto.createHmac('sha256', secret).update(checkString).digest('hex');
    return hmac === signature;
}

function getPlanDuration(planType) {
    const durations = {
        'Базовый': 30,
        'Премиум': 30,
        'Лайфтайм': 36500 // 100 лет
    };
    return durations[planType] || 30;
}

module.exports = router;
