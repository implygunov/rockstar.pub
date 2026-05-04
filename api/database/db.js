const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../database.sqlite');
let db;

function getDatabase() {
  if (!db) {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('Error opening database:', err);
      } else {
        // console.log('✅ Connected to SQLite database');
      }
    });
  }
  return db;
}

function initDatabase() {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    
    db.serialize(() => {
      db.run(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          login TEXT UNIQUE NOT NULL,
          email TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          role TEXT DEFAULT 'user',
          group_name TEXT DEFAULT 'Default',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          banned INTEGER DEFAULT 0,
          status INTEGER DEFAULT 0,
          avatar_url TEXT,
          gauth_secret TEXT,
          gauth_enabled INTEGER DEFAULT 0,
          hwid TEXT DEFAULT '-',
          ram INTEGER DEFAULT 4096,
          sub_until TEXT DEFAULT '',
          version TEXT DEFAULT 'default'
        )
      `, (err) => {
        if (err) {
          console.error('Error creating users table:', err);
          reject(err);
        } else {
          // console.log('✅ Users table ready');
        }
      });

      db.run(`
        CREATE TABLE IF NOT EXISTS activation_keys (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key_code TEXT UNIQUE NOT NULL,
          role TEXT NOT NULL,
          duration_days INTEGER DEFAULT 30,
          used INTEGER DEFAULT 0,
          used_by INTEGER,
          used_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (used_by) REFERENCES users(id)
        )
      `, (err) => {
        if (err) {
          console.error('Error creating activation_keys table:', err);
          reject(err);
        } else {
          // console.log('✅ Activation keys table ready');
        }
      });

      db.run(`
        CREATE TABLE IF NOT EXISTS configs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          file_path TEXT NOT NULL,
          file_size INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id)
        )
      `, (err) => {
        if (err) {
          console.error('Error creating configs table:', err);
          reject(err);
        } else {
          // console.log('✅ Configs table ready');
        }
      });

      db.run(`
        CREATE TABLE IF NOT EXISTS invoices (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          invoice_id TEXT UNIQUE NOT NULL,
          user_id INTEGER NOT NULL,
          plan_type TEXT NOT NULL,
          amount REAL NOT NULL,
          status TEXT DEFAULT 'pending',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          paid_at DATETIME,
          FOREIGN KEY (user_id) REFERENCES users(id)
        )
      `, (err) => {
        if (err) {
          console.error('Error creating invoices table:', err);
          reject(err);
        } else {
          // console.log('✅ Invoices table ready');
        }
      });

      db.run(`
        CREATE TABLE IF NOT EXISTS promocodes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          code TEXT UNIQUE NOT NULL,
          discount_percent INTEGER NOT NULL,
          max_uses INTEGER DEFAULT 0,
          used_count INTEGER DEFAULT 0,
          expires_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          active INTEGER DEFAULT 1
        )
      `, (err) => {
        if (err) {
          console.error('Error creating promocodes table:', err);
          reject(err);
        } else {
          // console.log('✅ Promocodes table ready');
        }
      });

      db.run(`
        CREATE TABLE IF NOT EXISTS admin_sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_url TEXT UNIQUE NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          expires_at DATETIME NOT NULL
        )
      `, (err) => {
        if (err) {
          console.error('Error creating admin_sessions table:', err);
          reject(err);
        } else {
          // console.log('✅ Admin sessions table ready');
          resolve();
        }
      });
    });
  });
}

module.exports = {
  getDatabase,
  getDb: getDatabase,
  initDatabase
};
