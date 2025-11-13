-- Tabela 0: Usuário
CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  senha_hash TEXT NOT NULL,
  criado_em TIMESTAMP DEFAULT NOW()
);


-- Tabela 1: produtos (estoque)
CREATE TABLE IF NOT EXISTS produtos (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  descricao TEXT,
  preco NUMERIC(10,2) NOT NULL,
  img_url TEXT
);

-- Tabela 2: itens do carrinho
CREATE TABLE IF NOT EXISTS item_carrinho (
  usuario_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  produto_id INT NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  quantidade INT NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  added_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (usuario_id, produto_id)
);

-- Tabela 3: pedidos (histórico de compras)
CREATE TABLE IF NOT EXISTS pedidos (
  id SERIAL PRIMARY KEY,
  usuario_id INT NOT NULL REFERENCES usuarios(id) ON DELETE SET NULL,
  produto_id INT NOT NULL REFERENCES produtos(id) ON DELETE SET NULL,
  quantidade INT NOT NULL CHECK (quantidade > 0),
  preco_na_compra NUMERIC(10,2) NOT NULL CHECK (preco_na_compra >= 0),
  comprado_em TIMESTAMP DEFAULT NOW()
);

INSERT INTO produtos (nome, descricao, preco, img_url) VALUES
('Kit Upgrade Básico', 'RAM + SSD para notebooks intermediários', 299.90, '/images/produtos/produto1.png'),
('Placa-mãe Notebook MSI', 'Compatível com modelos gamer. Alta durabilidade.', 399.90, '/images/produtos/produto2.png'),
('Memória RAM 16GB DDR4 (SODIMM)', 'Ótima para multitarefas em notebooks.', 289.90, '/images/produtos/produto3.png'),
('SSD NVMe 1TB', 'Velocidade extrema para boot e jogos (ver compatibilidade).', 399.90, '/images/produtos/produto4.png'),
('Cooler Gamer USB para Notebook', 'Resfriamento com estilo e RGB.', 139.90, '/images/produtos/produto5.png'),
('Teclado p/ Notebook Dell Inspiron 15 3000 (ABNT2)', 'Reposição original, layout PT-BR.', 39.90, '/images/produtos/produto6.png'),
('SSD SATA 2.5\" Kingston A400 480GB', 'Upgrade essencial via SATA.', 199.90, '/images/produtos/produto7.png'),
('Mouse Logitech M110 Silent USB', 'Ergonômico, cliques silenciosos.', 39.90, '/images/produtos/produto8.png'),
('Mouse Pad Redragon P033 RGB 800x300mm', 'Conforto e precisão, iluminação RGB.', 119.90, '/images/produtos/produto9.png');
