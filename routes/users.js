const express = require('express');
const {
  findByUsername,
  updateProfile,
  follow,
  unfollow,
  isFollowing,
  toPublicUser,
  searchUsers,
  listUsers,
} = require('../db/users');
const { requireAuth, attachUserIfPresent } = require('../middleware/auth');

const router = express.Router();

// GET /api/users              -> lista pessoas cadastradas (tela "Pessoas")
// GET /api/users?search=termo -> busca por usuário/e-mail
router.get('/', attachUserIfPresent, (req, res) => {
  const q = (req.query.search || '').trim();
  const excludeUsername = req.user ? req.user.username : null;

  const results = q ? searchUsers(q, excludeUsername) : listUsers(excludeUsername);
  res.json({ users: results.map(toPublicUser) });
});

// GET /api/users/:username -> perfil público
router.get('/:username', attachUserIfPresent, (req, res) => {
  const user = findByUsername(req.params.username);
  if (!user) return res.status(404).json({ error: 'pessoa não encontrada.' });

  const publicUser = toPublicUser(user);
  if (req.user) {
    publicUser.viewerIsFollowing = isFollowing(req.user.id, user.id);
  }
  res.json({ user: publicUser });
});

// PATCH /api/users/me -> editar o próprio perfil (avatar, país, gêneros)
router.patch('/me', requireAuth, (req, res) => {
  const { nationality, genres, avatar } = req.body || {};
  if (genres !== undefined && !Array.isArray(genres)) {
    return res.status(400).json({ error: 'gêneros inválidos.' });
  }
  const updated = updateProfile(req.user.username, {
    nationality,
    genres,
    avatar,
  });
  res.json({ user: toPublicUser(updated) });
});

// POST /api/users/:username/follow -> passar a seguir alguém
router.post('/:username/follow', requireAuth, (req, res) => {
  const target = findByUsername(req.params.username);
  if (!target) return res.status(404).json({ error: 'pessoa não encontrada.' });
  if (target.id === req.user.id) {
    return res.status(400).json({ error: 'você não pode seguir a si mesmo.' });
  }
  follow(req.user.id, target.id);
  res.json({ user: toPublicUser(target) });
});

// DELETE /api/users/:username/follow -> deixar de seguir
router.delete('/:username/follow', requireAuth, (req, res) => {
  const target = findByUsername(req.params.username);
  if (!target) return res.status(404).json({ error: 'pessoa não encontrada.' });
  unfollow(req.user.id, target.id);
  res.json({ user: toPublicUser(target) });
});

module.exports = router;
