const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { findByUsername } = require('../db/users');
const messagesDb = require('../db/messages');

const router = express.Router();

// GET /api/messages -> lista de conversas (última mensagem de cada uma)
router.get('/', requireAuth, (req, res) => {
  const conversations = messagesDb.conversationsFor(req.user.id);
  res.json({ conversations });
});

// GET /api/messages/:username -> histórico da conversa com essa pessoa
router.get('/:username', requireAuth, (req, res) => {
  const other = findByUsername(req.params.username);
  if (!other) return res.status(404).json({ error: 'pessoa não encontrada.' });

  const rows = messagesDb.threadBetween(req.user.id, other.id);
  const messages = rows.map((m) => ({
    id: m.id,
    text: m.text,
    fromMe: m.from_id === req.user.id,
    createdAt: m.created_at,
  }));
  res.json({ messages });
});

// POST /api/messages/:username -> enviar mensagem pra essa pessoa
router.post('/:username', requireAuth, (req, res) => {
  const clean = ((req.body || {}).text || '').toString().trim().slice(0, 2000);
  if (!clean) return res.status(400).json({ error: 'mensagem vazia.' });

  const other = findByUsername(req.params.username);
  if (!other) return res.status(404).json({ error: 'pessoa não encontrada.' });
  if (other.id === req.user.id) {
    return res.status(400).json({ error: 'não é possível enviar mensagem pra si mesmo.' });
  }

  const row = messagesDb.insertMessage(req.user.id, other.id, clean);
  res.status(201).json({
    message: { id: row.id, text: row.text, fromMe: true, createdAt: row.created_at },
  });
});

module.exports = router;
