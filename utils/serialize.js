const db = require('../db');

// versão "privada" — só pra retornar pro próprio dono da conta
// (inclui e-mail e as listas completas de quem segue/é seguido)
function serializeUser(row){
  if(!row) return null;
  const followers = db.prepare(
    'SELECT u.username FROM follows f JOIN users u ON u.id = f.follower_id WHERE f.followee_id = ?'
  ).all(row.id).map(r => r.username);
  const following = db.prepare(
    'SELECT u.username FROM follows f JOIN users u ON u.id = f.followee_id WHERE f.follower_id = ?'
  ).all(row.id).map(r => r.username);

  return {
    username: row.username,
    email: row.email,
    emailVerified: !!row.email_verified,
    nationality: row.nationality,
    genres: JSON.parse(row.genres || '[]'),
    avatar: row.avatar || null,
    followers,
    following,
  };
}

// versão "pública" — pra mostrar o perfil de qualquer pessoa (sem e-mail,
// só contagens de seguidores/seguindo em vez das listas inteiras)
function serializePublicUser(row){
  if(!row) return null;
  const followerCount = db.prepare('SELECT COUNT(*) c FROM follows WHERE followee_id = ?').get(row.id).c;
  const followingCount = db.prepare('SELECT COUNT(*) c FROM follows WHERE follower_id = ?').get(row.id).c;

  return {
    username: row.username,
    avatar: row.avatar || null,
    nationality: row.nationality,
    genres: JSON.parse(row.genres || '[]'),
    followerCount,
    followingCount,
  };
}

module.exports = { serializeUser, serializePublicUser };
