require('dotenv').config() // <<== carregar .env IMEDIATAMENTE

const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const { Pool } = require('pg');
const crypto = require('crypto');
const bcrypt = require('bcrypt'); // ou 'bcryptjs'
const { error } = require('console');

const app = express();
const PORT = process.env.PORT || 3000;
const SALT_ROUNDS = 8
// Variáveis de ambiente necessárias
const requiredEnv = ['PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE']
requiredEnv.forEach(envVar => {
  if(!process.env[envVar]){
    console.error(`A variável de ambiente ${envVar} não está definida`)
    process.exit(1)
  }
})

/** 1) CONEXÃO COM POSTGRES **/
const pool = new Pool({
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
});

// Função para verifica o formato de um email
const checkEmail = (email) => {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email)
}

/** 2) MIDDLEWARES **/
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Arquivos estáticos (CSS, JS, imagens)
app.use(express.static(path.join(__dirname, 'public')));

// EJS (carrinho e “ver agora”)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

/** 3) ROTAS DE PÁGINA **/

// Página inicial: index.html atual
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Página do carrinho (dinâmica com EJS)
app.get('/carrinho', async (req, res) => {
  const userId = req.cookies?.userId;
  if (!userId) {
    return res.redirect('/login');
  }

  try {
    const sql = `
      SELECT p.id AS produto_id, p.nome, p.img_url, p.preco, c.quantidade,
             (p.preco * c.quantidade) AS subtotal
      FROM item_carrinho c
      JOIN produtos p ON p.id = c.produto_id
      WHERE c.usuario_id = $1
      ORDER BY c.added_at DESC;
    `;
    const { rows } = await pool.query(sql, [userId]);
    const total = rows.reduce((acc, r) => acc + Number(r.subtotal || 0), 0);
    res.render('carrinho', { itens: rows, total });
  } catch (err) {
    console.error('Erro ao buscar carrinho:', err);
    res.status(500).send('Erro interno');
  }
});

// Página “Ver agora” (produto MSI ID=2)
app.get('/produto/msi', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM produtos WHERE id = $1', [2]);
    if (rows.length === 0) return res.status(404).send('Produto não encontrado.');
    const prod = rows[0];
    res.render('produto-msi', { prod });
  } catch (err) {
    console.error('Erro produto/msi:', err);
    res.status(500).send('Erro interno');
  }
});

app.get('/api/produtos', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM produtos ORDER BY id ASC');
    res.json(rows);
  } catch (err) {
    console.error('Erro /api/produtos:', err);
    res.status(500).json({ ok: false });
  }
});

// Adicionar item (API)
app.post('/api/carrinho/adicionar', async (req, res) => {
  const userId = req.cookies?.userId;
  if (!userId) {
    return res.json({ ok: false, login: true });
  }

  const { produtoId, quantidade } = req.body;
  const qnt = Number(quantidade || 1);
  if (!produtoId || qnt <= 0) {
    return res.status(400).json({ ok: false, error: 'Parâmetros inválidos' });
  }

  try {
    const check = await pool.query(
      'SELECT quantidade FROM item_carrinho WHERE usuario_id = $1 AND produto_id = $2',
      [userId, produtoId]
    );

    if (check.rows.length > 0) {
      await pool.query(
        'UPDATE item_carrinho SET quantidade = quantidade + $1 WHERE usuario_id = $2 AND produto_id = $3',
        [qnt, userId, produtoId]
      );
    } else {
      await pool.query(
        'INSERT INTO item_carrinho (usuario_id, produto_id, quantidade) VALUES ($1, $2, $3)',
        [userId, produtoId, qnt]
      );
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('Erro adicionar ao carrinho:', err);
    return res.status(500).json({ ok: false });
  }
});

// Remover 1 item (ou remover totalmente se quantidade for 1) — API
app.post('/api/carrinho/remover', async (req, res) => {
  const userId = req.cookies?.userId;
  if (!userId) {
    return res.json({ ok: false, login: true });
  }

  const { produtoId } = req.body;
  if (!produtoId) {
    return res.status(400).json({ ok: false, error: 'produtoId necessário' });
  }

  try {
    const { rows } = await pool.query(
      'SELECT quantidade FROM item_carrinho WHERE usuario_id = $1 AND produto_id = $2',
      [userId, produtoId]
    );
    if (rows.length === 0) return res.json({ ok: true });

    const quantidadeAtual = Number(rows[0].quantidade);
    if (quantidadeAtual > 1) {
      await pool.query(
        'UPDATE item_carrinho SET quantidade = quantidade - 1 WHERE usuario_id = $1 AND produto_id = $2',
        [userId, produtoId]
      );
    } else {
      await pool.query(
        'DELETE FROM item_carrinho WHERE usuario_id = $1 AND produto_id = $2',
        [userId, produtoId]
      );
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('Erro remover do carrinho:', err);
    return res.status(500).json({ ok: false });
  }
});

// Resumo do carrinho (contagem/total) — API
app.get('/api/carrinho/resumo', async (req, res) => {
  const userId = req.cookies?.userId;
  if (!userId) {
    return res.json({ itens: 0, total: 0 });
  }

  try {
    const sql = `
      SELECT 
        COALESCE(SUM(c.quantidade), 0) AS itens,
        COALESCE(SUM(p.preco * c.quantidade), 0) AS total
      FROM item_carrinho c
      JOIN produtos p ON p.id = c.produto_id
      WHERE c.usuario_id = $1;
    `;
    const { rows } = await pool.query(sql, [userId]);
    res.json(rows[0] || { itens: 0, total: 0 });
  } catch (err) {
    console.error('Erro resumo carrinho:', err);
    res.status(500).json({ itens: 0, total: 0 });
  }
});

/** 6) FINALIZAR COMPRA **/
app.post('/compra/finalizar', async (req, res) => {
  const userId = req.cookies?.userId;
  if (!userId) {
    return res.json({ ok: false, login: true });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Pega os itens do carrinho do usuário
    const itens = await client.query(
      `SELECT c.produto_id, c.quantidade, p.preco
       FROM item_carrinho c
       JOIN produtos p ON p.id = c.produto_id
       WHERE c.usuario_id = $1`, 
      [userId] 
    );

    if (itens.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, erro: 'Carrinho vazio' });
    }

    for (const row of itens.rows) {
      await client.query(
        `INSERT INTO pedidos (usuario_id, produto_id, quantidade, preco_na_compra, comprado_em)
         VALUES ($1, $2, $3, $4, NOW())`, 
        [userId, row.produto_id, row.quantidade, row.preco]
      );
    }
    await client.query('DELETE FROM item_carrinho WHERE usuario_id = $1', [userId]);

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

// Histórico de compras
app.get('/pedidos', async (req, res) => {
  const userId = req.cookies?.userId;
  if (!userId) {
    return res.redirect('/login');
  }

  try {
    const sql = `
      SELECT 
        p.nome,
        p.img_url,
        pd.quantidade,
        pd.preco_na_compra,
        (pd.preco_na_compra * pd.quantidade) as total,
        pd.comprado_em
      FROM pedidos pd
      JOIN produtos p ON p.id = pd.produto_id
      WHERE pd.usuario_id = $1
      ORDER BY pd.comprado_em DESC;
    `;
    
    const { rows } = await pool.query(sql, [userId]);
    
    res.render('historico', { itens: rows });
    
  } catch (err) {
    console.error('Erro ao buscar histórico:', err);
    res.status(500).send('Erro interno');
  }
});

app.get("/login", (req, res) => {
  res.render("login", {error: null, values: {}})
})

app.post("/login", async (req, res) => {
  const {email, senha} = req.body
  if(!email || !senha){
    return res.status(400).render("login", {error: "Preencha todos os campos", values: {email} })
  }

  try {
    const { rows } = await pool.query("SELECT id, senha_hash FROM usuarios WHERE email = $1", [email])
    if(!rows.length){
      return res.status(401).render("login", { error: "Email não registrado", values: { email } })
    }

    const user = rows[0]
    const match = await bcrypt.compare(senha, user.senha_hash)
    if(!match){
      return res.status(401).render("login", { error: "Senha incorreta", values: { email } })
    }

    res.cookie('userId', user.id, { httpOnly : true })
    return res.redirect("/")
  } catch (err){
    console.error("ERRO Login:", err)
    return res.status(500).render("login", { error: "Erro interno", values: {} })
  }
})

app.get("/register", (req, res) => {
  res.render("registro", {error: null, values: {}})
})

app.post("/register", async (req, res) => {
  const {nome, email, senha} = req.body
  if(!nome || !email || !senha ) {
    return res.status(400).render('registro', {
      error: "Preencha todos os campos",
      values: {nome, email}})
  }

  try {
    if(!checkEmail(email)){
      return res.status(400).render("registro", { error: "Email inválido", values: {nome, email}})
    }

    const {rows : exists} = await pool.query('SELECT id FROM usuarios WHERE email = $1',[email])
    if(exists.length){
      return res.status(400).render("registro", { error: "Email já cadastrado", values: {nome, email} })
    }

    const hash = await bcrypt.hash(senha, SALT_ROUNDS)
    const sql = 'INSERT INTO usuarios (nome, email, senha_hash) VALUES ($1, $2, $3) RETURNING id'
    const { rows } = await pool.query(sql, [ nome,email,hash ])

    res.cookie('userId', rows[0].id, {httpOnly: true})

    return res.redirect("/")
  } catch (err) {
    console.error("Erro no registro:", err)
    return res.status(500).render("registro", {error: "Erro interno", values: {nome,email}})
  }
})

app.get("/logout", (req, res) => {
  res.clearCookie("userId")
  res.redirect("/login")
})

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
