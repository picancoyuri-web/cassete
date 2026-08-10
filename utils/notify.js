const db = require('../db');

// registra uma notificação pra userId, causada pela ação de actorId.
// nunca notifica a própria pessoa sobre a própria ação.
function createNotification({ userId, actorId, type, entryId = null, commentId = null }){
  if(!userId || !actorId || userId === actorId) return;
  db.prepare(`
    INSERT INTO notifications (user_id, actor_id, type, entry_id, comment_id)
    VALUES (?,?,?,?,?)
  `).run(userId, actorId, type, entryId, commentId);
}

module.exports = { createNotification };
