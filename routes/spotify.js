const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI; // ex: https://cassete.onrender.com/api/spotify/callback
const SCOPES = 'user-read-currently-playing user-read-playback-state';

// estados temporários (em memória) só pra amarrar o callback do Spotify à
// pessoa certa e evitar CSRF — expiram sozinhos em 10 minutos
const pendingStates = new Map(); // state -> { userId, expiresAt }
function cleanupStates(){
  const now = Date.now();
  for(const [state, info] of pendingStates){
    if(info.expiresAt < now) pendingStates.delete(state);
  }
}

function basicAuthHeader(){
  return 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
}

// GET /api/spotify/login — devolve a URL de autorização do Spotify pra
// pessoa logada abrir (o frontend faz o redirect)
router.get('/login', requireAuth, (req, res) => {
  if(!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI){
    return res.status(503).json({ error: 'integração com Spotify não configurada no servidor.' });
  }
  cleanupStates();
  const state = crypto.randomBytes(16).toString('hex');
  pendingStates.set(state, { userId: req.user.id, expiresAt: Date.now() + 10 * 60 * 1000 });

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    scope: SCOPES,
    redirect_uri: REDIRECT_URI,
    state,
  });
  res.json({ url: `https://accounts.spotify.com/authorize?${params.toString()}` });
});

// GET /api/spotify/callback — pra onde o Spotify redireciona depois que a
// pessoa autoriza (ou nega) o acesso na tela deles
router.get('/callback', async (req, res) => {
  const frontendBase = (process.env.FRONTEND_ORIGIN || '').replace(/\/$/, '');
  const { code, state, error } = req.query;

  if(error || !code || !state || !pendingStates.has(String(state))){
    return res.redirect(`${frontendBase}/?spotify=error`);
  }

  const { userId, expiresAt } = pendingStates.get(String(state));
  pendingStates.delete(String(state));
  if(expiresAt < Date.now()){
    return res.redirect(`${frontendBase}/?spotify=expired`);
  }

  try{
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': basicAuthHeader(),
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: String(code),
        redirect_uri: REDIRECT_URI,
      }),
    });
    const tokenData = await tokenRes.json();
    if(!tokenRes.ok) throw new Error(tokenData.error_description || 'falha ao trocar código por token');

    const expiresAtIso = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();
    db.prepare(`
      UPDATE users SET spotify_access_token = ?, spotify_refresh_token = ?, spotify_token_expires_at = ?
      WHERE id = ?
    `).run(tokenData.access_token, tokenData.refresh_token, expiresAtIso, userId);

    res.redirect(`${frontendBase}/?spotify=connected`);
  }catch(e){
    console.error('erro no callback do Spotify:', e.message);
    res.redirect(`${frontendBase}/?spotify=error`);
  }
});

// POST /api/spotify/disconnect — desliga a integração e apaga os tokens salvos
router.post('/disconnect', requireAuth, (req, res) => {
  db.prepare(`
    UPDATE users SET spotify_access_token = NULL, spotify_refresh_token = NULL, spotify_token_expires_at = NULL
    WHERE id = ?
  `).run(req.user.id);
  res.status(204).end();
});

async function refreshAccessToken(user){
  const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': basicAuthHeader(),
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: user.spotify_refresh_token,
    }),
  });
  const data = await tokenRes.json();
  if(!tokenRes.ok) throw new Error(data.error_description || 'falha ao renovar token do Spotify');

  const expiresAtIso = new Date(Date.now() + data.expires_in * 1000).toISOString();
  db.prepare('UPDATE users SET spotify_access_token = ?, spotify_token_expires_at = ? WHERE id = ?')
    .run(data.access_token, expiresAtIso, user.id);

  // o Spotify às vezes manda um refresh_token novo — se mandou, atualiza também
  if(data.refresh_token){
    db.prepare('UPDATE users SET spotify_refresh_token = ? WHERE id = ?').run(data.refresh_token, user.id);
  }

  return data.access_token;
}

async function getValidAccessToken(user){
  if(!user.spotify_refresh_token) return null;
  const expiresAt = user.spotify_token_expires_at ? new Date(user.spotify_token_expires_at).getTime() : 0;
  // ainda válido por mais de 30s — usa o que já tem, sem gastar uma chamada extra
  if(user.spotify_access_token && expiresAt - Date.now() > 30 * 1000){
    return user.spotify_access_token;
  }
  return refreshAccessToken(user);
}

// GET /api/spotify/now-playing/:username — o que essa pessoa está ouvindo
// agora no Spotify (não exige estar logado — é uma info pública do perfil)
router.get('/now-playing/:username', async (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(req.params.username);
  if(!user) return res.status(404).json({ error: 'pessoa não encontrada.' });
  if(!user.spotify_refresh_token) return res.json({ connected: false, playing: null });

  try{
    const token = await getValidAccessToken(user);
    const r = await fetch('https://api.spotify.com/v1/me/player/currently-playing?additional_types=track', {
      headers: { Authorization: `Bearer ${token}` },
    });

    // 204/202 = conectado, mas não tem nada tocando agora (não é erro)
    if(r.status === 204 || r.status === 202){
      return res.json({ connected: true, playing: null });
    }
    if(!r.ok) throw new Error('Spotify respondeu ' + r.status);

    const data = await r.json();
    if(!data || !data.item || data.currently_playing_type !== 'track'){
      return res.json({ connected: true, playing: null });
    }

    res.json({
      connected: true,
      playing: {
        title: data.item.name,
        artist: (data.item.artists || []).map(a => a.name).join(', '),
        isPlaying: !!data.is_playing,
      },
    });
  }catch(e){
    console.error('não deu pra checar o "tocando agora" do Spotify:', e.message);
    // não deixa o perfil quebrar por causa disso — só mostra sem status
    res.json({ connected: true, playing: null });
  }
});

module.exports = router;
