const express = require('express');
const bcrypt = require('bcryptjs');
const {
  findByUsername,
  findByEmail,
  findByUsernameOrEmail,
  createUser,
  toPublicUser,
} = require('../db/users');
const {
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
} = require('../middleware/auth');

const router = express.Router();

const USERNAME_RE = /^[a-zA-Z0-9_.]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  const { username, email, password, nationality, genres } = req.body || {};

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'preencha usuário, e-mail e senha.' });
  }
  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({
      error: 'usuário deve ter de 3 a 20 caracteres (letras, números, "_" ou ".").',
    });
  }
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'e-mail inválido.' });
  }
  if (password.length < 8) {
    return res
      .status(400)
      .json({ error: 'a senha precisa ter pelo menos 8 caracteres.' });
  }
  if (Array.isArray(genres) === false && genres !== undefined) {
    return res.status(400).json({ error: 'gêneros inválidos.' });
  }

  if (findByUsername(username)) {
    return res.status(409).json({ error: 'esse nome de usuário já existe.' });
  }
  if (findByEmail(email)) {
    return res.status(409).json({ error: 'esse e-mail já está cadastrado.' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = createUser({
    username,
    email,
    passwordHash,
    nationality,
    genres,
  });

  setSessionCookie(res, user);
  res.status(201).json({ user: toPublicUser(user) });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { identifier, password } = req.body || {};
  if (!identifier || !password) {
    return res.status(400).json({ error: 'preencha usuário/e-mail e senha.' });
  }

  const user = findByUsernameOrEmail(identifier);
  if (!user) {
    return res.status(401).json({ error: 'usuário ou senha incorretos.' });
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    return res.status(401).json({ error: 'usuário ou senha incorretos.' });
  }

  setSessionCookie(res, user);
  res.json({ user: toPublicUser(user) });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
});

// GET /api/auth/me  -> quem está logado agora
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: toPublicUser(req.user) });
});

module.exports = router;
