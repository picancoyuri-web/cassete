const db = require('../db');

// registra uma notificação pra userId, causada pela ação de actorId.
// por padrão nunca notifica a própria pessoa sobre a própria ação —
// exceto quando allowSelf=true (usado pelos lembretes de memória).
function createNotification({ userId, actorId, type, entryId = null, commentId = null, allowSelf = false }){
  if(!userId || !actorId) return;
  if(userId === actorId && !allowSelf) return;
  db.prepare(`
    INSERT INTO notifications (user_id, actor_id, type, entry_id, comment_id)
    VALUES (?,?,?,?,?)
  `).run(userId, actorId, type, entryId, commentId);
}

module.exports = { createNotification };
