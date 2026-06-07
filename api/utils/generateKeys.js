const { getDatabase, initDatabase } = require('../database/db');
const crypto = require('crypto');

function generateKey(prefix = '') {
  const randomPart = crypto.randomBytes(8).toString('hex').toUpperCase();
  return prefix ? `${prefix}-${randomPart}` : randomPart;
}

async function createKeys(role, count = 1, durationDays = 30) {
  await initDatabase();
  const db = getDatabase();
  
  const keys = [];
  
  for (let i = 0; i < count; i++) {
    const keyCode = generateKey(role.toUpperCase());
    
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO activation_keys (key_code, role, duration_days) VALUES (?, ?, ?)',
        [keyCode, role, durationDays],
        function(err) {
          if (err) {
            console.error('Error creating key:', err);
            reject(err);
          } else {
            keys.push(keyCode);
            resolve();
          }
        }
      );
    });
  }
  
  return keys;
}

// Использование из командной строки
if (require.main === module) {
  const args = process.argv.slice(2);
  const role = args[0] || 'beta';
  const count = parseInt(args[1]) || 1;
  const days = parseInt(args[2]) || 30;
  
  console.log(`Генерация ${count} ключей для роли "${role}" на ${days} дней...`);
  
  createKeys(role, count, days)
    .then(keys => {
      console.log('\n✅ Ключи созданы:');
      keys.forEach((key, i) => {
        console.log(`${i + 1}. ${key}`);
      });
      process.exit(0);
    })
    .catch(err => {
      console.error('Ошибка:', err);
      process.exit(1);
    });
}

module.exports = { generateKey, createKeys };
