const express = require('express');
const router = express.Router();

// o navegador não pode chamar itunes.apple.com direto por causa de CORS,
// então esse endpoint só repassa a busca pro iTunes e devolve o resultado
router.get('/search', async (req, res) => {
  const term = (req.query.term || '').trim();
  const entity = req.query.entity === 'song' ? 'song' : 'album';
  if(!term) return res.status(400).json({ error: 'faltou o termo de busca.' });

  try{
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=${entity}&limit=25`;
    const r = await fetch(url);
    if(!r.ok) throw new Error('iTunes respondeu ' + r.status);
    const data = await r.json();
    res.json({ results: data.results || [] });
  }catch(e){
    console.error('busca iTunes falhou:', e.message);
    res.status(502).json({ error: 'não deu pra buscar no iTunes agora.' });
  }
});

module.exports = router;
