const express = require('express');
const router = express.Router();

const DISCOGS_TOKEN = process.env.DISCOGS_TOKEN;
const DISCOGS_BASE = 'https://api.discogs.com';
const USER_AGENT = 'CasseteApp/1.0 (+https://cassete.netlify.app)';

async function discogsFetch(url){
  const r = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if(!r.ok){
    const err = new Error('discogs respondeu ' + r.status);
    err.status = r.status;
    throw err;
  }
  return r.json();
}

// busca dados de um artista/banda no Discogs: foto, e se for uma banda,
// os integrantes (com foto de cada um, quando existir).
// GET /api/artist-info?name=...
router.get('/', async (req, res) => {
  if(!DISCOGS_TOKEN){
    return res.status(503).json({ error: 'busca de artistas não configurada no servidor (falta DISCOGS_TOKEN).' });
  }

  const name = (req.query.name || '').trim();
  if(!name){
    return res.status(400).json({ error: 'faltou o nome do artista.' });
  }

  try{
    const searchUrl = `${DISCOGS_BASE}/database/search?` + new URLSearchParams({
      q: name,
      type: 'artist',
      token: DISCOGS_TOKEN,
    });
    const search = await discogsFetch(searchUrl);
    const best = (search.results || [])[0];
    if(!best){
      return res.json({ found: false });
    }

    const artist = await discogsFetch(`${DISCOGS_BASE}/artists/${best.id}?token=${DISCOGS_TOKEN}`);
    const photo = (artist.images && artist.images.length)
      ? (artist.images[0].resource_url || artist.images[0].uri || null)
      : null;

    // "members" só vem preenchido quando o artista é uma banda/grupo
    const rawMembers = (artist.members || []).slice(0, 3);
    const members = [];
    for(const m of rawMembers){
      let memberPhoto = null;
      try{
        const memberData = await discogsFetch(`${DISCOGS_BASE}/artists/${m.id}?token=${DISCOGS_TOKEN}`);
        if(memberData.images && memberData.images.length){
          memberPhoto = memberData.images[0].resource_url || memberData.images[0].uri || null;
        }
      }catch(e){
        // sem foto desse integrante — segue sem ela, não é motivo pra falhar tudo
      }
      members.push({ name: m.name, photo: memberPhoto });
    }

    res.json({
      found: true,
      name: artist.name,
      isGroup: (artist.members || []).length > 0,
      photo,
      members,
      discogsUrl: artist.uri || null,
    });
  }catch(e){
    console.error('busca de artista no Discogs falhou:', e.message);
    res.status(502).json({ error: 'não deu pra buscar informações desse artista agora.' });
  }
});

module.exports = router;
