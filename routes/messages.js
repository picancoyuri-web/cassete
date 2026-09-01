const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

// lista de conversas da pessoa logada, uma linha por interlocutor,
// com a última mensagem trocada
router.get('/', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT
      u.username, u.avatar,
      m.text AS lastText, m.created_at AS lastAt, (m.from_id = ?) AS lastFromMe
    FROM messages m
    JOIN users u ON u.id = CASE WHEN m.from_id = ? THEN m.to_id ELSE m.from_id END
    WHERE m.id IN (
      SELECT MAX(id) FROM messages
      WHERE from_id = ? OR to_id = ?
      GROUP BY CASE WHEN from_id = ? THEN to_id ELSE from_id END
    )
    ORDER BY m.created_at DESC
  `).all(req.user.id, req.user.id, req.user.id, req.user.id, req.user.id);

  res.json({
    conversations: rows.map(r => ({
      username: r.username,
      avatar: r.avatar || null,
      lastText: r.lastText,
      lastAt: r.lastAt,
      lastFromMe: !!r.lastFromMe,
    })),
  });
});

// histórico de mensagens entre a pessoa logada e outra pessoa
router.get('/:username', requireAuth, (req, res) => {
  const other = db.prepare('SELECT * FROM users WHERE username = ?').get(req.params.username);
  if(!other) return res.status(404).json({ error: 'pessoa não encontrada.' });

  const rows = db.prepare(`
    SELECT * FROM messages
    WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)
    ORDER BY created_at ASC
  `).all(req.user.id, other.id, other.id, req.user.id);

  res.json({
    messages: rows.map(m => ({
      text: m.text,
      fromMe: m.from_id === req.user.id,
      createdAt: m.created_at,
    })),
  });
});

// enviar uma mensagem pra outra pessoa
router.post('/:username', requireAuth, (req, res) => {
  const other = db.prepare('SELECT * FROM users WHERE username = ?').get(req.params.username);
  if(!other) return res.status(404).json({ error: 'pessoa não encontrada.' });

  const { text } = req.body || {};
  if(!text || !text.trim()) return res.status(400).json({ error: 'escreva uma mensagem.' });

  const info = db.prepare('INSERT INTO messages (from_id, to_id, text) VALUES (?,?,?)')
    .run(req.user.id, other.id, text.trim());
  const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(info.lastInsertRowid);

  res.json({ message: { text: row.text, fromMe: true, createdAt: row.created_at } });
});

module.exports = router;
