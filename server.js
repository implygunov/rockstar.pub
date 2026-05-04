const express = require('express');
const cors = require('cors');
const path = require('path');
const authRoutes = require('./api/routes/auth');
const accountRoutes = require('./api/routes/account');
const configsRoutes = require('./api/routes/configs');
const paymentRoutes = require('./api/routes/payment');
const adminRoutes = require('./api/routes/admin');
const { initDatabase, getDatabase } = require('./api/database/db');

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
  
  // Проверяем является ли это админ-сессией
  const db = getDatabase();
  db.get(
    `SELECT * FROM admin_sessions WHERE session_url = ? AND expires_at > datetime('now')`,
    [sessionUrl],
    (err, session) => {
      if (session) {
        // Это валидная админ-сессия, отдаем админку
        res.sendFile(path.join(__dirname, 'admin-panel.html'));
      } else {
        // Обычный файл
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
  
  // Создаем админ-сессию при запуске
  const crypto = require('crypto');
  const sessionUrl = crypto.randomBytes(8).toString('hex');
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);

  db.run(
    `INSERT INTO admin_sessions (session_url, expires_at) VALUES (?, ?)`,
    [sessionUrl, expiresAt.toISOString()],
    (err) => {
      if (err) {
        console.error('❌ Ошибка создания админ-сессии:', err);
      }
    }
  );

  app.listen(PORT, () => {
    console.log(`\nСайт: http://localhost:${PORT}`);
    console.log(`Эндпоинты: http://localhost:${PORT}/api/v1`);
    console.log(`Админ-панель: http://localhost:${PORT}/${sessionUrl}.html\n`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
