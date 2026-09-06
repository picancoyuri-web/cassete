const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

function serializeNotification(row){
  return {
    id: row.id,
    type: row.type,
    actor: row.actor_username ? { username: row.actor_username, avatar: row.actor_avatar || null } : null,
    entryId: row.entry_id || null,
    commentId: row.comment_id || null,
    read: !!row.read,
    createdAt: row.created_at,
  };
}

router.get('/', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT n.*, u.username AS actor_username, u.avatar AS actor_avatar
    FROM notifications n
    LEFT JOIN users u ON u.id = n.actor_id
    WHERE n.user_id = ?
    ORDER BY n.created_at DESC
    LIMIT 100
  `).all(req.user.id);
  res.json({ notifications: rows.map(serializeNotification) });
});

router.get('/unread-count', requireAuth, (req, res) => {
  const row = db.prepare('SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND read = 0').get(req.user.id);
  res.json({ count: row.c });
});

router.post('/read', requireAuth, (req, res) => {
  db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(req.user.id);
  res.status(204).end();
});

module.exports = router;
