const express = require('express');
const { requireAuth } = require('../middleware/auth');
const diaryDb = require('../db/diary');

const router = express.Router();

// POST /api/diary -> registrar uma escuta (nota + comentário opcional)
router.post('/', requireAuth, (req, res) => {
  const { itemId, itemType, rating, note } = req.body || {};
  const idNum = Number(itemId);
  const ratingNum = Number(rating);

  if (!Number.isFinite(idNum) || !itemType) {
    return res.status(400).json({ error: 'item inválido.' });
  }
  if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    return res.status(400).json({ error: 'nota precisa ser de 1 a 5.' });
  }

  const entry = diaryDb.createEntry({
    userId: req.user.id,
    itemId: idNum,
    itemType: String(itemType),
    rating: ratingNum,
    note: (note || '').toString().slice(0, 2000),
  });
  res.status(201).json({ entry: diaryDb.toPublic(entry) });
});

// GET /api/diary/me -> diário da pessoa logada
router.get('/me', requireAuth, (req, res) => {
  const entries = diaryDb.listByUser(req.user.id).map(diaryDb.toPublic);
  res.json({ entries });
});

// GET /api/diary/feed -> resenhas recentes de quem a pessoa logada segue
router.get('/feed', requireAuth, (req, res) => {
  const entries = diaryDb.feedForFollowing(req.user.id).map(diaryDb.toPublicFeedEntry);
  res.json({ entries });
});

// GET /api/diary/user/:username -> "estante" pública de uma pessoa
// (todas as escutas que ela registrou, pra aparecer no perfil dela)
router.get('/user/:username', (req, res) => {
  const entries = diaryDb.listByUsername(req.params.username).map(diaryDb.toPublic);
  res.json({ entries });
});

// DELETE /api/diary/:id -> remover uma escuta (só a própria)
router.delete('/:id', requireAuth, (req, res) => {
  diaryDb.deleteEntry(Number(req.params.id), req.user.id);
  res.status(204).end();
});

module.exports = router;
