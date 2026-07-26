# Cassete — backend

Backend real (Node.js + Express + SQLite) para o cadastro e login de pessoas
no app Cassete. Substitui a simulação que existia no front-end via
`localStorage` por um banco de dados de verdade, com senhas
criptografadas (bcrypt) e sessão por cookie assinado (JWT).

## O que já está pronto

- **Cadastro** (`POST /api/auth/signup`) — cria a pessoa no banco, com
  senha hasheada (nunca salva em texto puro).
- **Login** (`POST /api/auth/login`) — aceita usuário ou e-mail.
- **Logout** (`POST /api/auth/logout`).
- **Sessão atual** (`GET /api/auth/me`) — descobre quem está logado a
  partir do cookie.
- **Perfil público** (`GET /api/users/:username`).
- **Editar perfil** (`PATCH /api/users/me`) — avatar, país, gêneros.
- **Buscar pessoas** (`GET /api/users?search=termo`).
- **Seguir / deixar de seguir** (`POST` / `DELETE /api/users/:username/follow`).

Ainda não estão aqui (dá pra evoluir depois, avise se quiser que eu já
prepare): resenhas e diário continuam simulados no `localStorage`. As
mensagens (chat) também continuam locais — inclusive as conversas com
contas reais, já que ainda não existe um back-end de mensagens; dá pra
migrar depois do mesmo jeito que fiz com cadastro/login/seguir.

O `index.html` já foi adaptado para chamar esta API de verdade (veja
a seção abaixo).

## Como rodar

```bash
cd cassete-backend
npm install
cp .env.example .env
# edite o .env e troque o JWT_SECRET por algo aleatório, por exemplo:
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

npm run dev
```

O servidor sobe em `http://localhost:3001`. Teste rápido:

```bash
curl http://localhost:3001/api/health
# {"ok":true}
```

O banco é um arquivo SQLite criado automaticamente em `data/cassete.db`
na primeira execução — não precisa instalar nem configurar nenhum
banco de dados externo.

## Como o front-end (`index.html`) chama isso

O `index.html` já foi adaptado: `doSignup`, `doLogin`, `doLogout`,
`loadSession`, `updateCurrentUser`, seguir/deixar de seguir e a lista
de pessoas agora chamam esta API via `fetch` (sempre com
`credentials: 'include'`, para o cookie de sessão ir junto), em vez de
ler/escrever no `localStorage`.

Por padrão ele aponta para `http://localhost:3001/api`. Para apontar
para outro endereço (por exemplo, quando o backend estiver hospedado
em produção), defina antes do `<script>` principal do `index.html`:

```html
<script>window.CASSETE_API_BASE = 'https://seu-servidor.com/api';</script>
```

Se o front-end for servido de uma origem diferente da API, lembre de
ajustar `FRONTEND_ORIGIN` no `.env` do backend — senão o navegador
bloqueia os cookies de sessão por causa do CORS.

Perfis fictícios da "comunidade cassete" (que abastecem as resenhas de
exemplo) continuam existindo só no front-end — como não são pessoas
reais, não faz sentido cadastrá-los no banco. Seguir essas contas
fictícias ainda é guardado localmente no navegador; seguir pessoas de
verdade já vai para o banco de dados.

Resenhas, diário e mensagens ainda não têm backend — se quiser, faço
isso em seguida.

## Variáveis de ambiente (`.env`)

| Variável         | Para que serve                                            |
|------------------|------------------------------------------------------------|
| `PORT`           | porta do servidor (padrão 3001)                            |
| `JWT_SECRET`     | segredo usado para assinar o cookie de sessão               |
| `FRONTEND_ORIGIN`| origem liberada no CORS (onde o `index.html` é servido)     |
| `NODE_ENV`       | `development` ou `production`                              |

## Segurança implementada

- Senha nunca fica em texto puro: é hasheada com `bcrypt` (custo 12).
- Sessão via cookie `httpOnly` (não acessível via JavaScript no
  navegador, reduz risco de roubo por XSS) e `sameSite: lax`.
- Usuário/e-mail duplicados são bloqueados no cadastro.
- Erros internos nunca vazam detalhes técnicos para quem está usando
  o app.
