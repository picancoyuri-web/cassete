const db = require('./index');
const { findById: findUserById } = require('./users');

function insertMessage(fromId, toId, text) {
  const info = db
    .prepare('INSERT INTO messages (from_id, to_id, text) VALUES (?, ?, ?)')
    .run(fromId, toId, text);
  return db.prepare('SELECT * FROM messages WHERE id = ?').get(info.lastInsertRowid);
}

function threadBetween(userId, otherId) {
  return db
    .prepare(
      `SELECT * FROM messages
       WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)
       ORDER BY created_at ASC`
    )
    .all(userId, otherId, otherId, userId);
}

// última mensagem de cada conversa que envolve userId, mais recente primeiro
function conversationsFor(userId) {
  const rows = db
    .prepare(
      `SELECT m.*,
         CASE WHEN m.from_id = ? THEN m.to_id ELSE m.from_id END AS other_id
       FROM messages m
       WHERE m.from_id = ? OR m.to_id = ?
       ORDER BY m.created_at DESC`
    )
    .all(userId, userId, userId);

  const seen = new Map();
  for (const row of rows) {
    if (!seen.has(row.other_id)) seen.set(row.other_id, row);
  }

  return [...seen.values()]
    .map((row) => {
      const other = findUserById(row.other_id);
      if (!other) return null;
      return {
        username: other.username,
        avatar: other.avatar,
        lastText: row.text,
        lastFromMe: row.from_id === userId,
        lastAt: row.created_at,
      };
    })
    .filter(Boolean);
}

module.exports = { insertMessage, threadBetween, conversationsFor };
