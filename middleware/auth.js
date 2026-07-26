const jwt = require('jsonwebtoken');
const { findById } = require('../db/users');

const COOKIE_NAME = 'cassete_session';
const JWT_SECRET = process.env.JWT_SECRET;

function signToken(user) {
  return jwt.sign({ sub: user.id, username: user.username }, JWT_SECRET, {
    expiresIn: '30d',
  });
}

function setSessionCookie(res, user) {
  const token = signToken(user);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 dias
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME);
}

// Exige login: bloqueia a requisição com 401 se não houver sessão válida
function requireAuth(req, res, next) {
  const token = req.cookies[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'não autenticado.' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = findById(payload.sub);
    if (!user) return res.status(401).json({ error: 'sessão inválida.' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'sessão expirada ou inválida.' });
  }
}

// Não exige login, mas anexa req.user se houver uma sessão válida
function attachUserIfPresent(req, res, next) {
  const token = req.cookies[COOKIE_NAME];
  if (!token) return next();
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = findById(payload.sub) || null;
  } catch (err) {
    req.user = null;
  }
  next();
}

module.exports = {
  COOKIE_NAME,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
  attachUserIfPresent,
};
