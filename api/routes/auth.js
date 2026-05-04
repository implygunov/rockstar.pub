const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const { body, validationResult } = require('express-validator');
const { getDatabase } = require('../database/db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your_secret_key';

router.post('/signup', [
  body('login').trim().isLength({ min: 3, max: 20 }).withMessage('Логин должен быть от 3 до 20 символов'),
  body('email').isEmail().withMessage('Некорректный email'),
  body('password').isLength({ min: 6 }).withMessage('Пароль должен быть минимум 6 символов')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }

  const { login, email, password } = req.body;
  const db = getDatabase();

  db.get('SELECT * FROM users WHERE login = ? OR email = ?', [login, email], async (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
    
    if (user) {
      return res.status(400).json({ error: 'Пользователь с таким логином или email уже существует' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const avatarUrl = `/api/v1/avatar/${Date.now()}`;

    db.run(
      'INSERT INTO users (login, email, password, avatar_url) VALUES (?, ?, ?, ?)',
      [login, email, hashedPassword, avatarUrl],
      function(err) {
        if (err) {
          return res.status(500).json({ error: 'Ошибка при создании пользователя' });
        }

        const token = jwt.sign({ id: this.lastID, login }, JWT_SECRET, { expiresIn: '7d' });
        
        res.status(201).json({
          success: true,
          token,
          user: {
            id: this.lastID,
            login,
            email
          }
        });
      }
    );
  });
});

router.post('/signin', async (req, res) => {
  const { statement, password } = req.body;
  const db = getDatabase();

  db.get('SELECT * FROM users WHERE login = ? OR email = ?', [statement, statement], async (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Ошибка сервера' });
    }

    if (!user) {
      return res.status(401).json({ reason: 'Неверный логин или пароль' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ reason: 'Неверный логин или пароль' });
    }

    if (user.gauth_enabled) {
      return res.status(200).json({ 
        reason: 'Введите код из Google Authenticator',
        requires2FA: true 
      });
    }

    const token = jwt.sign({ id: user.id, login: user.login }, JWT_SECRET, { expiresIn: '7d' });
    
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        login: user.login,
        email: user.email
      }
    });
  });
});

router.post('/verify-2fa', async (req, res) => {
  const { statement, code } = req.body;
  const db = getDatabase();

  db.get('SELECT * FROM users WHERE login = ? OR email = ?', [statement, statement], (err, user) => {
    if (err || !user) {
      return res.status(401).json({ error: 'Пользователь не найден' });
    }

    if (!user.gauth_enabled || !user.gauth_secret) {
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

    const token = jwt.sign({ id: user.id, login: user.login }, JWT_SECRET, { expiresIn: '7d' });
    
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        login: user.login,
        email: user.email
      }
    });
  });
});

module.exports = router;
