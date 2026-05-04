const express = require('express');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const { getDatabase } = require('../database/db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your_secret_key';

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Не авторизован' });
  }

  const token = authHeader.substring(7);
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Недействительный токен' });
  }
};

router.get('/account/details', authMiddleware, (req, res) => {
  const db = getDatabase();
  
  db.get('SELECT * FROM users WHERE id = ?', [req.userId], (err, user) => {
    if (err || !user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    res.json({
      id: user.id,
      login: user.login,
      email: user.email,
      role: user.role,
      group: user.group_name,
      createdAt: new Date(user.created_at).toLocaleDateString('ru-RU'),
      banned: user.banned === 1,
      status: user.status === 1,
      avatarUrl: user.avatar_url || '/img/ava.jpg',
      gauthStatus: user.gauth_enabled === 1 ? 'true' : 'false',
      hwid: user.hwid,
      ram: user.ram.toString(),
      subuntill: user.sub_until,
      version: user.version
    });
  });
});

router.post('/account/update-ram', authMiddleware, (req, res) => {
  const { ram } = req.body;
  const db = getDatabase();

  if (!ram || ram < 512 || ram > 16384) {
    return res.status(400).json({ error: 'Некорректное значение RAM' });
  }

  db.run('UPDATE users SET ram = ? WHERE id = ?', [ram, req.userId], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Ошибка при обновлении' });
    }
    res.json({ success: true, ram });
  });
});

router.post('/account/setup-2fa', authMiddleware, (req, res) => {
  const db = getDatabase();

  db.get('SELECT * FROM users WHERE id = ?', [req.userId], async (err, user) => {
    if (err || !user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    if (user.gauth_enabled) {
      return res.status(400).json({ error: '2FA уже настроен' });
    }

    const secret = speakeasy.generateSecret({
      name: `Rockstar (${user.login})`
    });

    try {
      const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);
      
      db.run('UPDATE users SET gauth_secret = ? WHERE id = ?', [secret.base32, req.userId], (err) => {
        if (err) {
          return res.status(500).json({ error: 'Ошибка при сохранении' });
        }

        res.json({
          success: true,
          secret: secret.base32,
          qrCode: qrCodeUrl
        });
      });
    } catch (err) {
      res.status(500).json({ error: 'Ошибка генерации QR кода' });
    }
  });
});

router.post('/account/verify-2fa', authMiddleware, (req, res) => {
  const { code } = req.body;
  const db = getDatabase();

  db.get('SELECT * FROM users WHERE id = ?', [req.userId], (err, user) => {
    if (err || !user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    if (!user.gauth_secret) {
      return res.status(400).json({ error: '2FA не настроен' });
    }

    const verified = speakeasy.totp.verify({
      secret: user.gauth_secret,
      encoding: 'base32',
      token: code,
      window: 2
    });

    if (!verified) {
      return res.status(401).json({ error: 'Неверный код' });
    }

    db.run('UPDATE users SET gauth_enabled = 1 WHERE id = ?', [req.userId], (err) => {
      if (err) {
        return res.status(500).json({ error: 'Ошибка при активации' });
      }
      res.json({ success: true });
    });
  });
});

router.post('/account/disable-2fa', authMiddleware, (req, res) => {
  const { code } = req.body;
  const db = getDatabase();

  db.get('SELECT * FROM users WHERE id = ?', [req.userId], (err, user) => {
    if (err || !user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    if (!user.gauth_enabled) {
      return res.status(400).json({ error: '2FA не активирован' });
    }

    const verified = speakeasy.totp.verify({
      secret: user.gauth_secret,
      encoding: 'base32',
      token: code,
      window: 2
    });

    if (!verified) {
      return res.status(401).json({ error: 'Неверный код' });
    }

    db.run('UPDATE users SET gauth_enabled = 0, gauth_secret = NULL WHERE id = ?', [req.userId], (err) => {
      if (err) {
        return res.status(500).json({ error: 'Ошибка при отключении' });
      }
      res.json({ success: true });
    });
  });
});

router.post('/account/activate-key', authMiddleware, (req, res) => {
  const { key } = req.body;
  const db = getDatabase();

  if (!key || key.trim().length === 0) {
    return res.status(400).json({ error: 'Введите ключ' });
  }

  db.get('SELECT * FROM activation_keys WHERE key_code = ?', [key.trim()], (err, keyData) => {
    if (err) {
      return res.status(500).json({ error: 'Ошибка сервера' });
    }

    if (!keyData) {
      return res.status(404).json({ error: 'Ключ не найден' });
    }

    if (keyData.used === 1) {
      return res.status(400).json({ error: 'Ключ уже использован' });
    }

    const newSubDate = new Date();
    newSubDate.setDate(newSubDate.getDate() + keyData.duration_days);
    const subUntil = newSubDate.toLocaleDateString('ru-RU');

    db.run(
      'UPDATE users SET role = ?, sub_until = ? WHERE id = ?',
      [keyData.role, subUntil, req.userId],
      function(err) {
        if (err) {
          return res.status(500).json({ error: 'Ошибка при активации' });
        }

        db.run(
          'UPDATE activation_keys SET used = 1, used_by = ?, used_at = CURRENT_TIMESTAMP WHERE key_code = ?',
          [req.userId, key.trim()],
          (err) => {
            if (err) {
              console.error('Error marking key as used:', err);
            }

            res.json({
              success: true,
              role: keyData.role,
              subUntil: subUntil,
              message: `Ключ активирован! Роль: ${keyData.role}, подписка до: ${subUntil}`
            });
          }
        );
      }
    );
  });
});

router.get('/avatar/:id', (req, res) => {
  const defaultAvatar = require('path').join(__dirname, '../../img/logo.png');
  res.sendFile(defaultAvatar, (err) => {
    if (err) {
      res.status(404).send('Avatar not found');
    }
  });
});

router.get('/download/loader', authMiddleware, (req, res) => {
  const db = getDatabase();
  
  db.get('SELECT role FROM users WHERE id = ?', [req.userId], (err, user) => {
    if (err || !user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    const role = user.role.toLowerCase();
    if (role === 'user' || role === 'default') {
      return res.status(403).json({ error: 'Требуется активная подписка для скачивания' });
    }
    
    const loaderPath = require('path').join(__dirname, '../../rockstar-1.0.0.jar');
    const fs = require('fs');
    
    if (!fs.existsSync(loaderPath)) {
      return res.status(404).json({ error: 'Файл не найден' });
    }
    
    res.download(loaderPath, 'rockstar-1.0.0.jar');
  });
});

module.exports = router;
