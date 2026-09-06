const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');
const { serializeUser } = require('../utils/serialize');

let nodemailer = null;
try{ nodemailer = require('nodemailer'); }catch(e){ /* opcional — sem nodemailer instalado, o link só vai pro log */ }

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
  sendVerificationEmail(user).catch(e => console.error('não deu pra mandar e-mail de verificação:', e.message));
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

function getMailTransport(){
  if(!nodemailer || !process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
}

async function sendVerificationEmail(user){
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // válido por 24h

  db.prepare('DELETE FROM email_verifications WHERE user_id = ?').run(user.id);
  db.prepare('INSERT INTO email_verifications (user_id, token_hash, expires_at) VALUES (?,?,?)')
    .run(user.id, tokenHash, expiresAt);

  const verifyUrl = `${(process.env.FRONTEND_ORIGIN || '').replace(/\/$/, '')}/?verify=${token}`;
  const transport = getMailTransport();

  if(transport){
    await transport.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: user.email,
      subject: 'Confirme seu e-mail no Cassete',
      text:
        `Oi, ${user.username}! Só falta confirmar seu e-mail pra sua conta no Cassete.\n\n` +
        `Clique no link abaixo (válido por 24 horas):\n${verifyUrl}\n\n` +
        'Se você não criou essa conta, pode ignorar esse e-mail.',
    });
  } else {
    // sem SMTP configurado — o link vai só pro log do servidor, útil em desenvolvimento
    console.log('[verificação de e-mail] SMTP não configurado — link pra', user.email, ':', verifyUrl);
  }
}

router.post('/verify-email', (req, res) => {
  const { token } = req.body || {};
  if(!token) return res.status(400).json({ error: 'link inválido.' });

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const row = db.prepare('SELECT * FROM email_verifications WHERE token_hash = ?').get(tokenHash);
  if(!row || new Date(row.expires_at).getTime() < Date.now()){
    return res.status(400).json({ error: 'link inválido ou expirado — peça um novo.' });
  }

  db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(row.user_id);
  db.prepare('DELETE FROM email_verifications WHERE user_id = ?').run(row.user_id);

  res.json({ ok: true, message: 'e-mail confirmado!' });
});

router.post('/resend-verification', requireAuth, async (req, res) => {
  if(req.user.email_verified){
    return res.json({ ok: true, message: 'seu e-mail já tá confirmado.' });
  }
  try{
    await sendVerificationEmail(req.user);
  }catch(e){
    console.error('não deu pra reenviar o e-mail de verificação:', e.message);
  }
  res.json({ ok: true, message: 'se o envio de e-mail estiver configurado, um novo link foi mandado.' });
});

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body || {};
  // resposta sempre genérica — não revela se o e-mail existe na base ou não
  const genericReply = () => res.json({
    ok: true,
    message: 'se esse e-mail existir na nossa base, você vai receber um link em instantes.',
  });
  if(!email) return genericReply();

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if(!user) return genericReply();

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // válido por 1 hora

  db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(user.id);
  db.prepare('INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?,?,?)')
    .run(user.id, tokenHash, expiresAt);

  const resetUrl = `${(process.env.FRONTEND_ORIGIN || '').replace(/\/$/, '')}/?reset=${token}`;
  const transport = getMailTransport();

  if(transport){
    try{
      await transport.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: user.email,
        subject: 'Redefinir sua senha no Cassete',
        text:
          'Alguém (esperamos que você) pediu pra redefinir a senha da sua conta no Cassete.\n\n' +
          `Clique no link abaixo pra escolher uma senha nova (válido por 1 hora):\n${resetUrl}\n\n` +
          'Se não foi você, pode ignorar esse e-mail — sua senha continua a mesma.',
      });
    }catch(e){
      console.error('não deu pra enviar o e-mail de redefinição:', e.message);
    }
  } else {
    // sem SMTP configurado (ex: ainda em desenvolvimento) — o link vai só
    // pro log do servidor, pra dar pra testar sem precisar mandar e-mail de verdade
    console.log('[reset de senha] SMTP não configurado — link pra', user.email, ':', resetUrl);
  }

  genericReply();
});

router.post('/reset-password', (req, res) => {
  const { token, password } = req.body || {};
  if(!token || !password) return res.status(400).json({ error: 'preencha os dados pra redefinir a senha.' });
  if(password.length < 8) return res.status(400).json({ error: 'a senha precisa ter pelo menos 8 caracteres.' });

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const row = db.prepare('SELECT * FROM password_resets WHERE token_hash = ?').get(tokenHash);
  if(!row || new Date(row.expires_at).getTime() < Date.now()){
    return res.status(400).json({ error: 'link inválido ou expirado — peça um novo.' });
  }

  const hash = bcrypt.hashSync(password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, row.user_id);
  db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(row.user_id);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id);
  const token2 = signToken(user.id);
  res.cookie(COOKIE_NAME, token2, COOKIE_OPTS);
  res.json({ user: serializeUser(user) });
});

module.exports = router;
