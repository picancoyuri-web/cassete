const db = require('./index');

function findById(id) {
  return db.prepare('SELECT * FROM diary_entries WHERE id = ?').get(id);
}

function createEntry({ userId, itemId, itemType, rating, note }) {
  const info = db
    .prepare(
      `INSERT INTO diary_entries (user_id, item_id, item_type, rating, note)
       VALUES (@userId, @itemId, @itemType, @rating, @note)`
    )
    .run({ userId, itemId, itemType, rating, note: note || '' });
  return findById(info.lastInsertRowid);
}

function listByUser(userId) {
  return db
    .prepare('SELECT * FROM diary_entries WHERE user_id = ? ORDER BY created_at DESC')
    .all(userId);
}

function deleteEntry(id, userId) {
  return db
    .prepare('DELETE FROM diary_entries WHERE id = ? AND user_id = ?')
    .run(id, userId);
}

// resenhas de quem a pessoa logada segue (só entradas com comentário escrito)
function feedForFollowing(userId, limit = 50) {
  return db
    .prepare(
      `SELECT de.*, u.username, u.avatar
       FROM diary_entries de
       JOIN users u ON u.id = de.user_id
       JOIN follows f ON f.followed_id = de.user_id
       WHERE f.follower_id = ? AND de.note != ''
       ORDER BY de.created_at DESC
       LIMIT ?`
    )
    .all(userId, limit);
}

// "estante" pública de uma pessoa — todas as escutas dela, mais recentes
// primeiro (usado na tela de perfil de outras pessoas)
function listByUsername(username, limit = 100) {
  return db
    .prepare(
      `SELECT de.* FROM diary_entries de
       JOIN users u ON u.id = de.user_id
       WHERE u.username = ?
       ORDER BY de.created_at DESC
       LIMIT ?`
    )
    .all(username, limit);
}

function toPublic(entry) {
  return {
    id: entry.id,
    itemId: entry.item_id,
    itemType: entry.item_type,
    rating: entry.rating,
    note: entry.note,
    createdAt: entry.created_at,
  };
}

function toPublicFeedEntry(entry) {
  return {
    ...toPublic(entry),
    username: entry.username,
    avatar: entry.avatar,
  };
}

module.exports = {
  createEntry,
  listByUser,
  listByUsername,
  deleteEntry,
  feedForFollowing,
  toPublic,
  toPublicFeedEntry,
};
