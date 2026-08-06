const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');
const optionalAuth = require('../middleware/optionalAuth');

const router = express.Router();

function serializeComment(row, viewerId){
  const likes = db.prepare('SELECT COUNT(*) c FROM comment_likes WHERE comment_id = ?').get(row.id).c;
  const liked = viewerId
    ? !!db.prepare('SELECT 1 FROM comment_likes WHERE comment_id = ? AND user_id = ?').get(row.id, viewerId)
    : false;
  return {
    id: row.id,
    name: row.username,
    text: row.text || '',
    photo: row.photo || null,
    likes,
    liked,
  };
}

function commentsForEntry(entryId, viewerId){
  const rows = db.prepare(`
    SELECT c.*, u.username FROM diary_comments c
    JOIN users u ON u.id = c.user_id
    WHERE c.entry_id = ?
    ORDER BY c.created_at ASC
  `).all(entryId);
  return rows.map(r => serializeComment(r, viewerId));
}

function serializeEntry(row, viewerId, { withUser = false } = {}){
  const base = {
    id: row.id,
    itemId: row.item_id,
    itemType: row.item_type,
    rating: row.rating,
    note: row.note,
    createdAt: row.created_at,
    title: row.item_title,
    artist: row.item_artist,
    genre: row.item_genre,
    year: row.item_year,
    sp: row.item_sp ? JSON.parse(row.item_sp) : null,
    previewUrl: row.item_preview_url || null,
    comments: commentsForEntry(row.id, viewerId),
  };
  if(withUser){
    base.username = row.username;
    base.avatar = row.avatar || null;
  }
  return base;
}

// registrar uma nova escuta no diário (com nota de 1-5 e, opcionalmente,
// um texto — quando tem texto, ela também aparece na aba "Resenhas")
router.post('/', requireAuth, (req, res) => {
  const { itemId, itemType, rating, note, title, artist, genre, year, sp, previewUrl } = req.body || {};

  if(!itemId || !rating) return res.status(400).json({ error: 'faltam dados pra registrar essa escuta.' });
  if(!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ error: 'nota inválida.' });

  const info = db.prepare(`
    INSERT INTO diary_entries
      (user_id, item_id, item_type, item_title, item_artist, item_genre, item_year, item_sp, item_preview_url, rating, note)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    req.user.id,
    String(itemId),
    itemType || null,
    title || null,
    artist || null,
    genre || null,
    year ? String(year) : null,
    sp ? JSON.stringify(sp) : null,
    previewUrl || null,
    rating,
    note || null
  );

  const row = db.prepare('SELECT * FROM diary_entries WHERE id = ?').get(info.lastInsertRowid);
  res.json({ entry: serializeEntry(row, req.user.id) });
});

// tudo que a própria pessoa logada já registrou
router.get('/me', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM diary_entries WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json({ entries: rows.map(r => serializeEntry(r, req.user.id)) });
});

// resenhas (com texto) de quem a pessoa logada segue, pra aba "Resenhas"
router.get('/feed', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT e.*, u.username, u.avatar FROM diary_entries e
    JOIN users u ON u.id = e.user_id
    JOIN follows f ON f.followee_id = e.user_id
    WHERE f.follower_id = ? AND e.note IS NOT NULL AND e.note != ''
    ORDER BY e.created_at DESC
    LIMIT 100
  `).all(req.user.id);
  res.json({ entries: rows.map(r => serializeEntry(r, req.user.id, { withUser: true })) });
});

// estante pública de uma pessoa (todas as escutas dela) — usada na tela
// de perfil de outra pessoa
router.get('/user/:username', optionalAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(req.params.username);
  if(!user) return res.status(404).json({ error: 'pessoa não encontrada.' });

  const viewerId = req.user ? req.user.id : null;
  const rows = db.prepare('SELECT * FROM diary_entries WHERE user_id = ? ORDER BY created_at DESC').all(user.id);
  res.json({ entries: rows.map(r => serializeEntry(r, viewerId)) });
});

// comentar numa escuta/resenha registrada por alguém (própria ou de quem
// você segue)
router.post('/:entryId/comments', requireAuth, (req, res) => {
  const entry = db.prepare('SELECT * FROM diary_entries WHERE id = ?').get(req.params.entryId);
  if(!entry) return res.status(404).json({ error: 'escuta não encontrada.' });

  const { text, photo } = req.body || {};
  if((!text || !text.trim()) && !photo) return res.status(400).json({ error: 'escreva algo ou anexe uma foto.' });

  const info = db.prepare('INSERT INTO diary_comments (entry_id, user_id, text, photo) VALUES (?,?,?,?)')
    .run(entry.id, req.user.id, text ? text.trim() : null, photo || null);

  const row = db.prepare(`
    SELECT c.*, u.username FROM diary_comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?
  `).get(info.lastInsertRowid);
  res.json({ comment: serializeComment(row, req.user.id) });
});

// curtir/descurtir um comentário (alterna: se já curtiu, remove a curtida)
router.post('/comments/:commentId/like', requireAuth, (req, res) => {
  const comment = db.prepare('SELECT * FROM diary_comments WHERE id = ?').get(req.params.commentId);
  if(!comment) return res.status(404).json({ error: 'comentário não encontrado.' });

  const already = db.prepare('SELECT 1 FROM comment_likes WHERE comment_id = ? AND user_id = ?')
    .get(comment.id, req.user.id);

  if(already){
    db.prepare('DELETE FROM comment_likes WHERE comment_id = ? AND user_id = ?').run(comment.id, req.user.id);
  } else {
    db.prepare('INSERT INTO comment_likes (comment_id, user_id) VALUES (?,?)').run(comment.id, req.user.id);
  }

  const likes = db.prepare('SELECT COUNT(*) c FROM comment_likes WHERE comment_id = ?').get(comment.id).c;
  res.json({ liked: !already, likes });
});

module.exports = router;
