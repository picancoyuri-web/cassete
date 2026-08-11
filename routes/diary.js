const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');
const optionalAuth = require('../middleware/optionalAuth');
const { createNotification } = require('../utils/notify');

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
    mine: viewerId === row.user_id,
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

function parsePagination(req, defaultLimit){
  const limit = Math.min(Math.max(Number(req.query.limit) || defaultLimit, 1), 50);
  const before = req.query.before ? Number(req.query.before) : null;
  return { limit, before: Number.isInteger(before) ? before : null };
}

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

  // avisa quem segue essa pessoa que ela registrou uma escuta nova
  const followers = db.prepare('SELECT follower_id FROM follows WHERE followee_id = ?').all(req.user.id);
  followers.forEach(f => {
    createNotification({ userId: f.follower_id, actorId: req.user.id, type: 'listen', entryId: row.id });
  });

  res.json({ entry: serializeEntry(row, req.user.id) });
});

router.get('/me', requireAuth, (req, res) => {
  const { limit, before } = parsePagination(req, 200);
  const rows = before
    ? db.prepare('SELECT * FROM diary_entries WHERE user_id = ? AND id < ? ORDER BY id DESC LIMIT ?').all(req.user.id, before, limit)
    : db.prepare('SELECT * FROM diary_entries WHERE user_id = ? ORDER BY id DESC LIMIT ?').all(req.user.id, limit);
  const entries = rows.map(r => serializeEntry(r, req.user.id));
  res.json({ entries, nextCursor: rows.length === limit ? rows[rows.length - 1].id : null });
});

router.get('/feed', requireAuth, (req, res) => {
  const { limit, before } = parsePagination(req, 20);
  const rows = before
    ? db.prepare(`
        SELECT e.*, u.username, u.avatar FROM diary_entries e
        JOIN users u ON u.id = e.user_id
        JOIN follows f ON f.followee_id = e.user_id
        WHERE f.follower_id = ? AND e.note IS NOT NULL AND e.note != '' AND e.id < ?
        ORDER BY e.id DESC
        LIMIT ?
      `).all(req.user.id, before, limit)
    : db.prepare(`
        SELECT e.*, u.username, u.avatar FROM diary_entries e
        JOIN users u ON u.id = e.user_id
        JOIN follows f ON f.followee_id = e.user_id
        WHERE f.follower_id = ? AND e.note IS NOT NULL AND e.note != ''
        ORDER BY e.id DESC
        LIMIT ?
      `).all(req.user.id, limit);
  const entries = rows.map(r => serializeEntry(r, req.user.id, { withUser: true }));
  res.json({ entries, nextCursor: rows.length === limit ? rows[rows.length - 1].id : null });
});

router.get('/user/:username', optionalAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(req.params.username);
  if(!user) return res.status(404).json({ error: 'pessoa não encontrada.' });

  const viewerId = req.user ? req.user.id : null;
  const rows = db.prepare('SELECT * FROM diary_entries WHERE user_id = ? ORDER BY created_at DESC').all(user.id);
  res.json({ entries: rows.map(r => serializeEntry(r, viewerId)) });
});

router.patch('/:entryId', requireAuth, (req, res) => {
  const entry = db.prepare('SELECT * FROM diary_entries WHERE id = ?').get(req.params.entryId);
  if(!entry) return res.status(404).json({ error: 'escuta não encontrada.' });
  if(entry.user_id !== req.user.id) return res.status(403).json({ error: 'você só pode editar suas próprias escutas.' });

  const { rating, note } = req.body || {};
  const fields = [];
  const values = [];
  if(rating !== undefined){
    if(!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ error: 'nota inválida.' });
    fields.push('rating = ?'); values.push(rating);
  }
  if(note !== undefined){ fields.push('note = ?'); values.push(note || null); }

  if(fields.length){
    values.push(entry.id);
    db.prepare(`UPDATE diary_entries SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }

  const row = db.prepare('SELECT * FROM diary_entries WHERE id = ?').get(entry.id);
  res.json({ entry: serializeEntry(row, req.user.id) });
});

router.delete('/:entryId', requireAuth, (req, res) => {
  const entry = db.prepare('SELECT * FROM diary_entries WHERE id = ?').get(req.params.entryId);
  if(!entry) return res.status(404).json({ error: 'escuta não encontrada.' });
  if(entry.user_id !== req.user.id) return res.status(403).json({ error: 'você só pode apagar suas próprias escutas.' });

  db.prepare('DELETE FROM diary_entries WHERE id = ?').run(entry.id);
  res.status(204).end();
});

router.post('/:entryId/comments', requireAuth, (req, res) => {
  const entry = db.prepare('SELECT * FROM diary_entries WHERE id = ?').get(req.params.entryId);
  if(!entry) return res.status(404).json({ error: 'escuta não encontrada.' });

  const { text, photo } = req.body || {};
  if((!text || !text.trim()) && !photo) return res.status(400).json({ error: 'escreva algo ou anexe uma foto.' });

  const info = db.prepare('INSERT INTO diary_comments (entry_id, user_id, text, photo) VALUES (?,?,?,?)')
    .run(entry.id, req.user.id, text ? text.trim() : null, photo || null);

  createNotification({ userId: entry.user_id, actorId: req.user.id, type: 'comment', entryId: entry.id });

  const row = db.prepare(`
    SELECT c.*, u.username FROM diary_comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?
  `).get(info.lastInsertRowid);
  res.json({ comment: serializeComment(row, req.user.id) });
});

router.patch('/comments/:commentId', requireAuth, (req, res) => {
  const comment = db.prepare('SELECT * FROM diary_comments WHERE id = ?').get(req.params.commentId);
  if(!comment) return res.status(404).json({ error: 'comentário não encontrado.' });
  if(comment.user_id !== req.user.id) return res.status(403).json({ error: 'você só pode editar seus próprios comentários.' });

  const { text } = req.body || {};
  if(!text || !text.trim()) return res.status(400).json({ error: 'o comentário não pode ficar vazio.' });

  db.prepare('UPDATE diary_comments SET text = ? WHERE id = ?').run(text.trim(), comment.id);

  const row = db.prepare(`
    SELECT c.*, u.username FROM diary_comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?
  `).get(comment.id);
  res.json({ comment: serializeComment(row, req.user.id) });
});

router.delete('/comments/:commentId', requireAuth, (req, res) => {
  const comment = db.prepare('SELECT * FROM diary_comments WHERE id = ?').get(req.params.commentId);
  if(!comment) return res.status(404).json({ error: 'comentário não encontrado.' });

  const entry = db.prepare('SELECT * FROM diary_entries WHERE id = ?').get(comment.entry_id);
  const canDelete = comment.user_id === req.user.id || (entry && entry.user_id === req.user.id);
  if(!canDelete) return res.status(403).json({ error: 'você não pode apagar esse comentário.' });

  db.prepare('DELETE FROM diary_comments WHERE id = ?').run(comment.id);
  res.status(204).end();
});

router.post('/comments/:commentId/like', requireAuth, (req, res) => {
  const comment = db.prepare('SELECT * FROM diary_comments WHERE id = ?').get(req.params.commentId);
  if(!comment) return res.status(404).json({ error: 'comentário não encontrado.' });

  const already = db.prepare('SELECT 1 FROM comment_likes WHERE comment_id = ? AND user_id = ?')
    .get(comment.id, req.user.id);

  if(already){
    db.prepare('DELETE FROM comment_likes WHERE comment_id = ? AND user_id = ?').run(comment.id, req.user.id);
  } else {
    db.prepare('INSERT INTO comment_likes (comment_id, user_id) VALUES (?,?)').run(comment.id, req.user.id);
    createNotification({ userId: comment.user_id, actorId: req.user.id, type: 'like', entryId: comment.entry_id, commentId: comment.id });
  }

  const likes = db.prepare('SELECT COUNT(*) c FROM comment_likes WHERE comment_id = ?').get(comment.id).c;
  res.json({ liked: !already, likes });
});

module.exports = router;
