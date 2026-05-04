const mysql = require('mysql2/promise');

let pool;
let dbWrapper;

const MYSQL_CONFIG = {
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 10),
  queueLimit: 0,
  charset: 'utf8mb4'
};

if (process.env.MYSQL_SSL === 'true') {
  MYSQL_CONFIG.ssl = {
    rejectUnauthorized: false
  };
}

function normalizeSql(sql) {
  return sql
    .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'INT AUTO_INCREMENT PRIMARY KEY')
    .replace(/datetime\('now'\)/gi, 'NOW()')
    .replace(/DATETIME DEFAULT CURRENT_TIMESTAMP/gi, 'DATETIME DEFAULT CURRENT_TIMESTAMP');
}

function createDbWrapper(pool) {
  return {
    async run(sql, params = [], callback) {
      if (typeof params === 'function') {
        callback = params;
        params = [];
      }

      sql = normalizeSql(sql);

      try {
        const [result] = await pool.execute(sql, params);

        const context = {
          lastID: result.insertId,
          changes: result.affectedRows
        };

        if (callback) {
          callback.call(context, null);
        }

        return result;
      } catch (err) {
        console.error('❌ MySQL run error:', err.message);
        console.error('SQL:', sql);

        if (callback) {
          callback(err);
          return;
        }

        throw err;
      }
    },

    async get(sql, params = [], callback) {
      if (typeof params === 'function') {
        callback = params;
        params = [];
      }

      sql = normalizeSql(sql);

      try {
        const [rows] = await pool.execute(sql, params);
        const row = rows[0] || undefined;

        if (callback) {
          callback(null, row);
        }

        return row;
      } catch (err) {
        console.error('❌ MySQL get error:', err.message);
        console.error('SQL:', sql);

        if (callback) {
          callback(err);
          return;
        }

        throw err;
      }
    },

    async all(sql, params = [], callback) {
      if (typeof params === 'function') {
        callback = params;
        params = [];
      }

      sql = normalizeSql(sql);

      try {
        const [rows] = await pool.execute(sql, params);

        if (callback) {
          callback(null, rows);
        }

        return rows;
      } catch (err) {
        console.error('❌ MySQL all error:', err.message);
        console.error('SQL:', sql);

        if (callback) {
          callback(err);
          return;
        }

        throw err;
      }
    },

    async close(callback) {
      try {
        await pool.end();

        if (callback) {
          callback(null);
        }
      } catch (err) {
        if (callback) {
          callback(err);
          return;
        }

        throw err;
      }
    }
  };
}

function getDatabase() {
  if (!pool) {
    pool = mysql.createPool(MYSQL_CONFIG);
  }

  if (!dbWrapper) {
    dbWrapper = createDbWrapper(pool);
  }

  return dbWrapper;
}

async function initDatabase() {
  if (!process.env.MYSQL_HOST) {
    throw new Error('MYSQL_HOST is not set');
  }

  if (!process.env.MYSQL_USER) {
    throw new Error('MYSQL_USER is not set');
  }

  if (!process.env.MYSQL_PASSWORD) {
    throw new Error('MYSQL_PASSWORD is not set');
  }

  if (!process.env.MYSQL_DATABASE) {
    throw new Error('MYSQL_DATABASE is not set');
  }

  pool = mysql.createPool(MYSQL_CONFIG);
  dbWrapper = createDbWrapper(pool);

  const connection = await pool.getConnection();

  try {
    console.log('✅ Connected to MySQL database');

    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        login VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role VARCHAR(50) DEFAULT 'user',
        group_name VARCHAR(255) DEFAULT 'Default',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        banned TINYINT DEFAULT 0,
        status TINYINT DEFAULT 0,
        avatar_url TEXT,
        gauth_secret TEXT,
        gauth_enabled TINYINT DEFAULT 0,
        hwid VARCHAR(255) DEFAULT '-',
        ram INT DEFAULT 4096,
        sub_until TEXT,
        version VARCHAR(255) DEFAULT 'default'
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS activation_keys (
        id INT AUTO_INCREMENT PRIMARY KEY,
        key_code VARCHAR(255) UNIQUE NOT NULL,
        role VARCHAR(50) NOT NULL,
        duration_days INT DEFAULT 30,
        used TINYINT DEFAULT 0,
        used_by INT NULL,
        used_at DATETIME NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (used_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS configs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        name VARCHAR(255) NOT NULL,
        file_path TEXT NOT NULL,
        file_size INT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id INT AUTO_INCREMENT PRIMARY KEY,
        invoice_id VARCHAR(255) UNIQUE NOT NULL,
        user_id INT NOT NULL,
        plan_type VARCHAR(100) NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        paid_at DATETIME NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS promocodes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        code VARCHAR(255) UNIQUE NOT NULL,
        discount_percent INT NOT NULL,
        max_uses INT DEFAULT 0,
        used_count INT DEFAULT 0,
        expires_at DATETIME NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        active TINYINT DEFAULT 1
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS admin_sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        session_url VARCHAR(255) UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    console.log('✅ MySQL tables ready');
  } catch (err) {
    console.error('❌ Failed to initialize MySQL database:', err);
    throw err;
  } finally {
    connection.release();
  }

  return dbWrapper;
}

module.exports = {
  getDatabase,
  getDb: getDatabase,
  initDatabase
};