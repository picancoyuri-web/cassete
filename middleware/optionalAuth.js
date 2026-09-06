const jwt = require('jsonwebtoken');
const db = require('../db');
const { COOKIE_NAME } = require('./requireAuth');

// não bloqueia quem não está logado — só preenche req.user quando o
// cookie de sessão é válido, pra rotas públicas que se comportam um
// pouco diferente pra quem está logado (ex: saber se "eu" curti um
// comentário ao ver o perfil de outra pessoa)
function optionalAuth(req, res, next){
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if(!token) return next();
  try{
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.uid);
    if(user) req.user = user;
  }catch(e){
    // token inválido ou expirado — segue como visitante, sem erro
  }
  next();
}

module.exports = optionalAuth;
