const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');
const { serializeUser } = require('../utils/serialize');

const router = express.Router();
const { COOKIE_NAME } = requireAuth;

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'none', // front-end (Netlify) e back-end (Render) ficam em domínios diferentes
  secure: true,      // exige HTTPS — vale em produção (Render); em localhost use http normalmente sem esse cookie funcionar entre domínios diferentes
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 dias
};

function signToken(userId){
  return jwt.sign({ uid: userId }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

router.post('/signup', (req, res) => {
  const { username, email, password, nationality, genres } = req.body || {};

  if(!username || !email || !password) return res.status(400).json({ error: 'preencha usuário, e-mail e senha.' });
  if(password.length < 8) return res.status(400).json({ error: 'a senha precisa ter pelo menos 8 caracteres.' });
  if(!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'e-mail inválido.' });
  if(!nationality) return res.status(400).json({ error: 'escolha sua nacionalidade.' });
  if(!Array.isArray(genres) || genres.length === 0) return res.status(400).json({ error: 'escolha pelo menos um estilo musical.' });

  const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
  if(existing) return res.status(409).json({ error: 'usuário ou e-mail já cadastrado.' });

  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare(
    'INSERT INTO users (username, email, password_hash, nationality, genres) VALUES (?,?,?,?,?)'
  ).run(username, email, hash, nationality, JSON.stringify(genres));

  const token = signToken(info.lastInsertRowid);
  res.cookie(COOKIE_NAME, token, COOKIE_OPTS);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.json({ user: serializeUser(user) });
});

router.post('/login', (req, res) => {
  const { identifier, password } = req.body || {};
  if(!identifier || !password) return res.status(400).json({ error: 'preencha usuário/e-mail e senha.' });

  const row = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(identifier, identifier);
  if(!row || !bcrypt.compareSync(password, row.password_hash)){
    return res.status(401).json({ error: 'usuário/e-mail ou senha incorretos.' });
  }

  const token = signToken(row.id);
  res.cookie(COOKIE_NAME, token, COOKIE_OPTS);
  res.json({ user: serializeUser(row) });
});

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, COOKIE_OPTS);
  res.status(204).end();
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: serializeUser(req.user) });
});

module.exports = router;
