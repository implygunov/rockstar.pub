const express = require('express');
const router = express.Router();

const { getDatabase } = require('../database/db.js');

function formatSubTime(value) {
  if (!value) {
    return 'null';
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value);
}

function isSubscriptionActive(subUntil) {
  if (!subUntil) {
    return false;
  }

  const value = String(subUntil).trim();

  if (value === '') {
    return false;
  }

  if (
    value.toLowerCase() === 'lifetime' ||
    value.toLowerCase() === 'forever' ||
    value.toLowerCase() === 'never'
  ) {
    return true;
  }

  const time = new Date(value).getTime();

  if (Number.isNaN(time)) {
    return false;
  }

  return time > Date.now();
}

router.post('/profile', async (req, res) => {
  try {
    const { hwid } = req.body;

    if (!hwid || typeof hwid !== 'string') {
      return res.status(400).json({
        allowed: false,
        error: 'HWID is required'
      });
    }

    const db = getDatabase();

    db.get(
      `
        SELECT 
          id,
          login,
          email,
          role,
          group_name,
          hwid,
          ram,
          sub_until,
          version,
          banned,
          status
        FROM users 
        WHERE hwid = ?
        LIMIT 1
      `,
      [hwid],
      (err, user) => {
        if (err) {
          console.error('❌ Profile database error:', err);

          return res.status(500).json({
            allowed: false,
            error: 'Database error'
          });
        }

        if (!user) {
          return res.status(403).json({
            allowed: false,
            error: 'HWID not found'
          });
        }

        if (Number(user.banned) === 1) {
          return res.status(403).json({
            allowed: false,
            error: 'User is banned',
            username: user.login || 'null',
            hwid: user.hwid || hwid,
            role: user.role || 'null',
            uid: String(user.id),
            subTime: formatSubTime(user.sub_until)
          });
        }

        const role = user.role || 'user';

        const isAdmin =
          role === 'admin' ||
          role === 'owner' ||
          role === 'moderator';

        const hasActiveSub = isSubscriptionActive(user.sub_until);

        /*
          Логика допуска:
          - admin / owner / moderator проходят всегда
          - обычный пользователь проходит, если есть активная подписка
          
          Если хочешь пускать ВСЕХ найденных по HWID — замени allowed на:
          const allowed = true;
        */
        const allowed = isAdmin || hasActiveSub;

        if (!allowed) {
          return res.status(403).json({
            allowed: false,
            error: 'Subscription expired',
            username: user.login || 'null',
            hwid: user.hwid || hwid,
            role: role,
            uid: String(user.id),
            subTime: formatSubTime(user.sub_until)
          });
        }

        return res.json({
          allowed: true,
          username: user.login || 'null',
          hwid: user.hwid || hwid,
          role: role,
          uid: String(user.id),
          subTime: formatSubTime(user.sub_until),
          ram: user.ram ? String(user.ram) : '4096',
          version: user.version || 'default',
          group: user.group_name || 'Default'
        });
      }
    );
  } catch (error) {
    console.error('❌ Profile route error:', error);

    return res.status(500).json({
      allowed: false,
      error: 'Server error'
    });
  }
});

module.exports = router;