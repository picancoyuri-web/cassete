const express = require('express');
const router = express.Router();

// GET /api/itunes/search?term=pop&entity=song
// Busca no iTunes por trás do nosso próprio backend, pra evitar que o
// navegador do usuário precise falar direto com itunes.apple.com (domínio
// que Private Relay, bloqueadores de anúncio e DNS filtrado costumam barrar).
router.get('/search', async (req, res) => {
  const { term, entity } = req.query;
  if (!term) return res.status(400).json({ error: 'term é obrigatório.' });

  try {
    const url = `https://itunes.apple.com/search?media=music&entity=${encodeURIComponent(entity || 'song')}&limit=25&country=BR&term=${encodeURIComponent(term)}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`iTunes respondeu ${response.status}`);
    const data = await response.json();
    res.json({ results: data.results || [] });
  } catch (err) {
    console.error('[itunes proxy] erro:', err.message);
    res.status(502).json({ error: 'falha ao buscar no iTunes.' });
  }
});

module.exports = router;
