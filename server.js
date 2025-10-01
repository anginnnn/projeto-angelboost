const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const { Pool } = require('pg');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

/** 1) CONEXÃO COM POSTGRES **/
const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: process.env.PGPORT || 5432,
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'postgres',
  database: process.env.PGDATABASE || 'angelboost'
});

/** 2) MIDDLEWARES **/
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Sessão simples baseada em cookie
app.use((req, res, next) => {
  if (!req.cookies.sid) {
    const sid = crypto.randomBytes(16).toString('hex');
    res.cookie('sid', sid, { httpOnly: true });
    req.sessionId = sid;
  } else {
    req.sessionId = req.cookies.sid;
  }
  next();
});

// Arquivos estáticos (CSS, JS, imagens) – ajuste a pasta se necessário
app.use(express.static(path.join(__dirname, 'public')));

// EJS para páginas dinâmicas (carrinho e “ver agora”)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

/** 3) ROTAS DE PÁGINA **/

// Página inicial: seu index.html atual (estático)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Página do carrinho (dinâmica com EJS)
app.get('/carrinho', async (req, res) => {
  const sid = req.sessionId;
  const sql = `
    SELECT c.id, p.nome, p.img_url, p.preco, c.quantidade, (p.preco * c.quantidade) AS subtotal
    FROM carrinho c
    JOIN produtos p ON p.id = c.produto_id
    WHERE c.session_id = $1
    ORDER BY c.id DESC;
  `;
  const { rows } = await pool.query(sql, [sid]);
  const total = rows.reduce((acc, r) => acc + Number(r.subtotal), 0);
  res.render('carrinho', { itens: rows, total });
});

// Página “Ver agora” (produto MSI ID=2)
app.get('/produto/msi', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM produtos WHERE id = $1', [2]);
  if (rows.length === 0) return res.status(404).send('Produto não encontrado.');
  const prod = rows[0];
  res.render('produto-msi', { prod });
});

/** 4) API: PRODUTOS **/
app.get('/api/produtos', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM produtos ORDER BY id ASC');
  res.json(rows);
});

/** 5) API: CARRINHO **/

// Adicionar item
app.post('/api/carrinho/adicionar', async (req, res) => {
  const sid = req.sessionId;
  const { produtoId, quantidade } = req.body;
  const qnt = Number(quantidade || 1);

  // se já existir o mesmo produto no carrinho, só soma a quantidade
  const check = await pool.query(
    'SELECT id, quantidade FROM carrinho WHERE session_id = $1 AND produto_id = $2',
    [sid, produtoId]
  );

  if (check.rows.length > 0) {
    const novo = check.rows[0].quantidade + qnt;
    await pool.query('UPDATE carrinho SET quantidade = $1 WHERE id = $2', [novo, check.rows[0].id]);
  } else {
    await pool.query(
      'INSERT INTO carrinho (session_id, produto_id, quantidade) VALUES ($1, $2, $3)',
      [sid, produtoId, qnt]
    );
  }

  res.json({ ok: true });
});

// Remover 1 item (ou remover totalmente se quantidade for 1)
app.post('/api/carrinho/remover', async (req, res) => {
  const sid = req.sessionId;
  const { produtoId } = req.body;

  const { rows } = await pool.query(
    'SELECT id, quantidade FROM carrinho WHERE session_id = $1 AND produto_id = $2',
    [sid, produtoId]
  );
  if (rows.length === 0) return res.json({ ok: true });

  const item = rows[0];
  if (item.quantidade > 1) {
    await pool.query('UPDATE carrinho SET quantidade = quantidade - 1 WHERE id = $1', [item.id]);
  } else {
    await pool.query('DELETE FROM carrinho WHERE id = $1', [item.id]);
  }

  res.json({ ok: true });
});

// Resumo do carrinho (contagem/total)
app.get('/api/carrinho/resumo', async (req, res) => {
  const sid = req.sessionId;
  const sql = `
    SELECT SUM(c.quantidade) AS itens, COALESCE(SUM(p.preco * c.quantidade), 0) AS total
    FROM carrinho c
    JOIN produtos p ON p.id = c.produto_id
    WHERE c.session_id = $1;
  `;
  const { rows } = await pool.query(sql, [sid]);
  res.json(rows[0] || { itens: 0, total: 0 });
});

/** 6) FINALIZAR COMPRA **/
app.post('/compra/finalizar', async (req, res) => {
  const sid = req.sessionId;

  // Transação simples: move carrinho -> pedidos e limpa carrinho
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const itens = await client.query(
      `SELECT c.produto_id, c.quantidade, p.preco
       FROM carrinho c
       JOIN produtos p ON p.id = c.produto_id
       WHERE c.session_id = $1`, [sid]
    );

    for (const row of itens.rows) {
      await client.query(
        'INSERT INTO pedidos (session_id, produto_id, quantidade, preco_na_compra) VALUES ($1, $2, $3, $4)',
        [sid, row.produto_id, row.quantidade, row.preco]
      );
    }

    await client.query('DELETE FROM carrinho WHERE session_id = $1', [sid]);

    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ ok: false, erro: 'Falha ao finalizar compra' });
  } finally {
    client.release();
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});