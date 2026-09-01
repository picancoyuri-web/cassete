const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');
const { serializeUser, serializePublicUser } = require('../utils/serialize');
const { createNotification } = require('../utils/notify');

const router = express.Router();

// lista/busca pessoas reais cadastradas (aba "Pessoas"), sem incluir
// a própria pessoa logada na lista
router.get('/', requireAuth, (req, res) => {
  const search = (req.query.search || '').trim();
  let rows;
  if(search){
    rows = db.prepare('SELECT * FROM users WHERE username LIKE ? AND id != ? ORDER BY username LIMIT 50')
      .all(`%${search}%`, req.user.id);
  } else {
    rows = db.prepare('SELECT * FROM users WHERE id != ? ORDER BY created_at DESC LIMIT 50').all(req.user.id);
  }
  res.json({ users: rows.map(serializePublicUser) });
});

router.get('/:username', (req, res) => {
  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(req.params.username);
  if(!row) return res.status(404).json({ error: 'pessoa não encontrada.' });
  res.json({ user: serializePublicUser(row) });
});

router.patch('/me', requireAuth, (req, res) => {
  const { avatar, nationality } = req.body || {};
  const fields = [];
  const values = [];
  if(avatar !== undefined){ fields.push('avatar = ?'); values.push(avatar); }
  if(nationality !== undefined){ fields.push('nationality = ?'); values.push(nationality); }

  if(fields.length){
    values.push(req.user.id);
    db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }

  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: serializeUser(row) });
});

router.post('/:username/follow', requireAuth, (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE username = ?').get(req.params.username);
  if(!target) return res.status(404).json({ error: 'pessoa não encontrada.' });
  if(target.id === req.user.id) return res.status(400).json({ error: 'você não pode seguir a si mesmo.' });

  const info = db.prepare('INSERT OR IGNORE INTO follows (follower_id, followee_id) VALUES (?,?)').run(req.user.id, target.id);
  if(info.changes > 0){
    createNotification({ userId: target.id, actorId: req.user.id, type: 'follow' });
  }
  res.json({ user: serializePublicUser(target) });
});

router.delete('/:username/follow', requireAuth, (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE username = ?').get(req.params.username);
  if(!target) return res.status(404).json({ error: 'pessoa não encontrada.' });

  db.prepare('DELETE FROM follows WHERE follower_id = ? AND followee_id = ?').run(req.user.id, target.id);
  res.json({ user: serializePublicUser(target) });
});

// compatibilidade musical entre a pessoa logada e outra pessoa, com base
// nos estilos favoritos escolhidos no cadastro (índice de Jaccard: 0-100)
router.get('/:username/compatibility', requireAuth, (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE username = ?').get(req.params.username);
  if(!target) return res.status(404).json({ error: 'pessoa não encontrada.' });
  if(target.id === req.user.id) return res.status(400).json({ error: 'escolha outra pessoa pra comparar.' });

  const mine = JSON.parse(req.user.genres || '[]');
  const theirs = JSON.parse(target.genres || '[]');
  const theirsSet = new Set(theirs);
  const mineSet = new Set(mine);

  const shared = mine.filter(g => theirsSet.has(g));
  const union = new Set([...mine, ...theirs]);
  const score = union.size ? Math.round((shared.length / union.size) * 100) : 0;

  res.json({
    score,
    shared,
    onlyMine: mine.filter(g => !theirsSet.has(g)),
    onlyTheirs: theirs.filter(g => !mineSet.has(g)),
  });
});

module.exports = router;
