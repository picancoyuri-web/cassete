const db = require('./index');

// -- leitura --------------------------------------------------------------

function findByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

function findByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
}

function findByUsernameOrEmail(identifier) {
  return db
    .prepare('SELECT * FROM users WHERE username = ? OR email = ?')
    .get(identifier, identifier);
}

function findById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function searchUsers(query, excludeUsername) {
  const like = `%${query}%`;
  return db
    .prepare(
      `SELECT * FROM users
       WHERE (username LIKE ? OR email LIKE ?)
         AND username != COALESCE(?, '')
       ORDER BY username ASC
       LIMIT 30`
    )
    .all(like, like, excludeUsername || '');
}

// lista todas as pessoas cadastradas (usada na aba "Pessoas"), excluindo
// quem está olhando, mais recentes primeiro
function listUsers(excludeUsername, limit = 50) {
  return db
    .prepare(
      `SELECT * FROM users
       WHERE username != COALESCE(?, '')
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(excludeUsername || '', limit);
}

// -- escrita ----------------------------------------------------------------

function createUser({ username, email, passwordHash, nationality, genres }) {
  const stmt = db.prepare(`
    INSERT INTO users (username, email, password_hash, nationality, genres)
    VALUES (@username, @email, @passwordHash, @nationality, @genres)
  `);
  const info = stmt.run({
    username,
    email,
    passwordHash,
    nationality: nationality || '',
    genres: JSON.stringify(genres || []),
  });
  return findById(info.lastInsertRowid);
}

function updateProfile(username, { nationality, genres, avatar }) {
  const current = findByUsername(username);
  if (!current) return null;

  db.prepare(
    `UPDATE users SET
       nationality = @nationality,
       genres = @genres,
       avatar = @avatar
     WHERE username = @username`
  ).run({
    username,
    nationality: nationality !== undefined ? nationality : current.nationality,
    genres: genres !== undefined ? JSON.stringify(genres) : current.genres,
    avatar: avatar !== undefined ? avatar : current.avatar,
  });

  return findByUsername(username);
}

// -- seguidores ---------------------------------------------------------

function follow(followerId, followedId) {
  if (followerId === followedId) return false;
  db.prepare(
    'INSERT OR IGNORE INTO follows (follower_id, followed_id) VALUES (?, ?)'
  ).run(followerId, followedId);
  return true;
}

function unfollow(followerId, followedId) {
  db.prepare(
    'DELETE FROM follows WHERE follower_id = ? AND followed_id = ?'
  ).run(followerId, followedId);
  return true;
}

function isFollowing(followerId, followedId) {
  const row = db
    .prepare('SELECT 1 FROM follows WHERE follower_id = ? AND followed_id = ?')
    .get(followerId, followedId);
  return !!row;
}

function followerCount(userId) {
  return db
    .prepare('SELECT COUNT(*) AS n FROM follows WHERE followed_id = ?')
    .get(userId).n;
}

function followingCount(userId) {
  return db
    .prepare('SELECT COUNT(*) AS n FROM follows WHERE follower_id = ?')
    .get(userId).n;
}

function followingUsernames(userId) {
  return db
    .prepare(
      `SELECT u.username FROM follows f
       JOIN users u ON u.id = f.followed_id
       WHERE f.follower_id = ?`
    )
    .all(userId)
    .map((r) => r.username);
}

function followerUsernames(userId) {
  return db
    .prepare(
      `SELECT u.username FROM follows f
       JOIN users u ON u.id = f.follower_id
       WHERE f.followed_id = ?`
    )
    .all(userId)
    .map((r) => r.username);
}

// -- serialização segura (nunca devolver password_hash) -------------------

function toPublicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    nationality: user.nationality,
    genres: JSON.parse(user.genres || '[]'),
    avatar: user.avatar || null,
    createdAt: user.created_at,
    followers: followerUsernames(user.id),
    following: followingUsernames(user.id),
    followerCount: followerCount(user.id),
    followingCount: followingCount(user.id),
  };
}

module.exports = {
  findByUsername,
  findByEmail,
  findByUsernameOrEmail,
  findById,
  searchUsers,
  listUsers,
  createUser,
  updateProfile,
  follow,
  unfollow,
  isFollowing,
  followerCount,
  followingCount,
  toPublicUser,
};
