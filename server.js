require('dotenv').config();
if (!process.env.JWT_SECRET) {
  console.error(
    '❌  Faltando JWT_SECRET no .env — copie .env.example para .env e configure antes de rodar.'
  );
  process.exit(1);
}

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const diaryRoutes = require('./routes/diary');
const messageRoutes = require('./routes/messages');
const itunesRoutes = require('./routes/itunes');

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5500',
    credentials: true, // necessário para os cookies de sessão irem e voltarem
  })
);
app.use(express.json({ limit: '5mb' })); // 5mb pra caber avatar em base64
app.use(cookieParser());

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/diary', diaryRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/itunes', itunesRoutes);

// tratador de erro genérico, pra nunca vazar stack trace pro cliente
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'erro interno do servidor.' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Cassete backend rodando em http://localhost:${PORT}`);
});
