const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./api/routes/auth.js');
const accountRoutes = require('./api/routes/account.js');
const configsRoutes = require('./api/routes/configs.js');
const paymentRoutes = require('./api/routes/payment.js');
const adminRoutes = require('./api/routes/admin.js');
const { initDatabase, getDatabase } = require('./api/database/db.js');

const app = express();
const PORT = process.env.PORT || 8081;

app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1', accountRoutes);
app.use('/api/v1', configsRoutes);
app.use('/api/v1', paymentRoutes);
app.use('/api/v1', adminRoutes);

// Middleware для проверки админ-сессии
app.get('/:sessionUrl.html', (req, res, next) => {
  const sessionUrl = req.params.sessionUrl;

  const db = getDatabase();

  db.get(
    `SELECT * FROM admin_sessions WHERE session_url = ? AND expires_at > NOW()`,
    [sessionUrl],
    (err, session) => {
      if (err) {
        console.error('❌ Ошибка проверки админ-сессии:', err);
        return next();
      }

      if (session) {
        res.sendFile(path.join(__dirname, 'admin-panel.html'));
      } else {
        next();
      }
    }
  );
});

app.use(express.static('.', {
  extensions: ['html']
}));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

initDatabase().then(() => {
  const db = getDatabase();

  const crypto = require('crypto');
  const sessionUrl = crypto.randomBytes(8).toString('hex');

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);

  const expiresAtFormatted = expiresAt.toISOString().slice(0, 19).replace('T', ' ');

  db.run(
    `INSERT INTO admin_sessions (session_url, expires_at) VALUES (?, ?)`,
    [sessionUrl, expiresAtFormatted],
    (err) => {
      if (err) {
        console.error('❌ Ошибка создания админ-сессии:', err);
      }
    }
  );

  app.listen(PORT, () => {
    console.log(`\nСайт запущен на порту: ${PORT}`);
    console.log(`Эндпоинты: /api/v1`);
    console.log(`Админ-панель: /${sessionUrl}.html\n`);
  });
}).catch(err => {
  console.error('❌ Failed to initialize database:', err);
  process.exit(1);
});