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

// busca créditos (quem toca o quê) e fotos de uma música/álbum no Discogs.
// GET /api/credits?artist=...&title=...
router.get('/', async (req, res) => {
  if(!DISCOGS_TOKEN){
    return res.status(503).json({ error: 'busca de créditos não configurada no servidor (falta DISCOGS_TOKEN).' });
  }

  const artist = (req.query.artist || '').trim();
  const title = (req.query.title || '').trim();
  if(!artist || !title){
    return res.status(400).json({ error: 'faltam artista e título pra buscar os créditos.' });
  }

  try{
    const searchUrl = `${DISCOGS_BASE}/database/search?` + new URLSearchParams({
      artist,
      release_title: title,
      type: 'release',
      token: DISCOGS_TOKEN,
    });
    const search = await discogsFetch(searchUrl);
    const best = (search.results || [])[0];
    if(!best){
      return res.json({ found: false });
    }

    const release = await discogsFetch(`${DISCOGS_BASE}/releases/${best.id}?token=${DISCOGS_TOKEN}`);

    // créditos do lançamento inteiro (produtor, engenheiro, banda de apoio etc)
    const credits = (release.extraartists || []).map(a => ({ name: a.name, role: a.role }));

    // créditos específicos de uma faixa (útil quando um músico convidado
    // só participa daquela música, não do álbum inteiro)
    const trackCredits = [];
    (release.tracklist || []).forEach(t => {
      (t.extraartists || []).forEach(a => {
        trackCredits.push({ track: t.title, name: a.name, role: a.role });
      });
    });

    const images = (release.images || [])
      .slice(0, 6)
      .map(img => img.resource_url || img.uri)
      .filter(Boolean);

    // foto do artista principal (quando existe no Discogs — nem todo
    // artista tem, principalmente músicos de sessão)
    let artistPhoto = null;
    const mainArtist = (release.artists || [])[0];
    if(mainArtist && mainArtist.id){
      try{
        const artistData = await discogsFetch(`${DISCOGS_BASE}/artists/${mainArtist.id}?token=${DISCOGS_TOKEN}`);
        if(artistData.images && artistData.images.length){
          artistPhoto = artistData.images[0].resource_url || artistData.images[0].uri || null;
        }
      }catch(e){
        // sem foto do artista — segue sem ela, não é motivo pra falhar tudo
      }
    }

    res.json({
      found: true,
      releaseTitle: release.title,
      year: release.year || null,
      label: (release.labels && release.labels[0] && release.labels[0].name) || null,
      genres: release.genres || [],
      styles: release.styles || [],
      mainArtist: mainArtist ? mainArtist.name : artist,
      artistPhoto,
      credits,
      trackCredits,
      images,
      discogsUrl: release.uri || null,
    });
  }catch(e){
    console.error('busca de créditos no Discogs falhou:', e.message);
    res.status(502).json({ error: 'não deu pra buscar os créditos agora.' });
  }
});

module.exports = router;
