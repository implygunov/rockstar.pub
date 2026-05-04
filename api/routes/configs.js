const express = require('express');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
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

const hasSubscription = (req, res, next) => {
  const db = getDatabase();
  
  db.get('SELECT role FROM users WHERE id = ?', [req.userId], (err, user) => {
    if (err || !user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    const role = user.role.toLowerCase();
    if (role === 'user' || role === 'default') {
      return res.status(403).json({ error: 'Требуется активная подписка' });
    }
    
    next();
  });
};

const uploadsDir = path.join(__dirname, '../../uploads/configs');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userDir = path.join(uploadsDir, req.userId.toString());
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
    cb(null, userDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + file.originalname;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedExts = ['.json', '.txt', '.cfg', '.ini'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Недопустимый формат файла'));
    }
  }
});

router.get('/configs', authMiddleware, hasSubscription, (req, res) => {
  const db = getDatabase();
  
  db.all(
    'SELECT id, name, file_size, created_at, updated_at FROM configs WHERE user_id = ? ORDER BY updated_at DESC',
    [req.userId],
    (err, configs) => {
      if (err) {
        return res.status(500).json({ error: 'Ошибка загрузки конфигов' });
      }
      
      const formattedConfigs = configs.map(config => ({
        id: config.id,
        name: config.name,
        fileSize: config.file_size,
        createdAt: new Date(config.created_at).toLocaleDateString('ru-RU'),
        updatedAt: new Date(config.updated_at).toLocaleDateString('ru-RU')
      }));
      
      res.json({ configs: formattedConfigs });
    }
  );
});

router.post('/configs/upload', authMiddleware, hasSubscription, upload.single('config'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Файл не загружен' });
  }
  
  const db = getDatabase();
  const configName = req.body.name || req.file.originalname;
  
  db.run(
    'INSERT INTO configs (user_id, name, file_path, file_size) VALUES (?, ?, ?, ?)',
    [req.userId, configName, req.file.path, req.file.size],
    function(err) {
      if (err) {
        fs.unlinkSync(req.file.path);
        return res.status(500).json({ error: 'Ошибка сохранения конфига' });
      }
      
      res.json({
        success: true,
        config: {
          id: this.lastID,
          name: configName,
          fileSize: req.file.size,
          createdAt: new Date().toLocaleDateString('ru-RU')
        }
      });
    }
  );
});

router.get('/configs/:id/download', authMiddleware, hasSubscription, (req, res) => {
  const db = getDatabase();
  
  db.get(
    'SELECT * FROM configs WHERE id = ? AND user_id = ?',
    [req.params.id, req.userId],
    (err, config) => {
      if (err || !config) {
        return res.status(404).json({ error: 'Конфиг не найден' });
      }
      
      if (!fs.existsSync(config.file_path)) {
        return res.status(404).json({ error: 'Файл не найден' });
      }
      
      res.download(config.file_path, config.name);
    }
  );
});

router.delete('/configs/:id', authMiddleware, hasSubscription, (req, res) => {
  const db = getDatabase();
  
  db.get(
    'SELECT * FROM configs WHERE id = ? AND user_id = ?',
    [req.params.id, req.userId],
    (err, config) => {
      if (err || !config) {
        return res.status(404).json({ error: 'Конфиг не найден' });
      }
      
      if (fs.existsSync(config.file_path)) {
        fs.unlinkSync(config.file_path);
      }
      
      db.run('DELETE FROM configs WHERE id = ?', [req.params.id], (err) => {
        if (err) {
          return res.status(500).json({ error: 'Ошибка удаления' });
        }
        res.json({ success: true });
      });
    }
  );
});

router.put('/configs/:id/rename', authMiddleware, hasSubscription, (req, res) => {
  const { name } = req.body;
  
  if (!name || name.trim().length === 0) {
    return res.status(400).json({ error: 'Введите название' });
  }
  
  const db = getDatabase();
  
  db.run(
    'UPDATE configs SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
    [name.trim(), req.params.id, req.userId],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Ошибка переименования' });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Конфиг не найден' });
      }
      
      res.json({ success: true, name: name.trim() });
    }
  );
});

module.exports = router;
