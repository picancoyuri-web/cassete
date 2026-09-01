const db = require('../db');
const { createNotification } = require('./notify');

// procura entradas de diário escritas há exatamente 1 ano (mesmo dia/mês)
// e cria uma notificação de "memória" pra pessoa relembrar — uma única
// vez por entrada, pra não repetir todo dia.
function checkMemories(){
  const rows = db.prepare(`
    SELECT * FROM diary_entries
    WHERE date(created_at) = date('now', '-1 year')
  `).all();

  rows.forEach(entry => {
    const already = db.prepare(
      "SELECT 1 FROM notifications WHERE user_id = ? AND type = 'memory' AND entry_id = ?"
    ).get(entry.user_id, entry.id);
    if(already) return;

    createNotification({
      userId: entry.user_id,
      actorId: entry.user_id,
      type: 'memory',
      entryId: entry.id,
      allowSelf: true,
    });
  });
}

module.exports = { checkMemories };
