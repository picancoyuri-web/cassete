const jwt = require('jsonwebtoken');
const db = require('../db');

const COOKIE_NAME = 'cassete_token';

function requireAuth(req, res, next){
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if(!token) return res.status(401).json({ error: 'não autenticado.' });
  try{
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.uid);
    if(!user) return res.status(401).json({ error: 'não autenticado.' });
    req.user = user;
    next();
  }catch(e){
    return res.status(401).json({ error: 'sessão inválida ou expirada.' });
  }
}

module.exports = requireAuth;
module.exports.COOKIE_NAME = COOKIE_NAME;
