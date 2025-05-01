// app.js - Sistema completo com abas

let db;

// Inicialização do IndexedDB
const initDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("ProdutosDB", 2);

    request.onerror = (event) => {
      console.error("Erro ao abrir o banco de dados:", event.target.error);
      reject("Erro ao abrir o banco de dados");
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      console.log("Banco de dados aberto com sucesso");
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('produtos')) {
        const store = db.createObjectStore("produtos", { 
          keyPath: "id", 
          autoIncrement: true 
        });
        
        // Cria índices para busca
        store.createIndex("nome", "nome", { unique: false });
        store.createIndex("dataCriacao", "dataCriacao", { unique: false });
        
        console.log("Object store 'produtos' criado com índices");
      }
    };
  });
};

// Inicializa o aplicativo
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await initDB();
    setupForm();
    adicionarIngrediente(); // Adiciona um campo de ingrediente por padrão
    
    // Configura o Service Worker para PWA
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js')
        .then(reg => console.log('Service Worker registrado:', reg.scope))
        .catch(err => console.error('Falha no Service Worker:', err));
    }
  } catch (error) {
    console.error("Falha na inicialização:", error);
    alert("Erro ao iniciar o aplicativo. Recarregue a página.");
  }
});

// Configura o formulário
function setupForm() {
  const form = document.getElementById('form-produto');
  form.onsubmit = adicionarProduto;
  form.onreset = () => {
    document.getElementById('ingredientes-container').innerHTML = '';
    adicionarIngrediente();
    form.onsubmit = adicionarProduto;
  };
}

// Adiciona campos para um novo ingrediente
function adicionarIngrediente() {
  const container = document.getElementById('ingredientes-container');
  const div = document.createElement('div');
  div.className = 'ingrediente';
  div.innerHTML = `
    <input type="text" placeholder="Nome do ingrediente" class="ingrediente-nome" required>
    <input type="number" placeholder="Quantidade" class="ingrediente-qtd" step="0.01" min="0" required>
    <select class="ingrediente-unidade" required>
      <option value="">Unidade</option>
      <option value="g">g</option>
      <option value="kg">kg</option>
      <option value="ml">ml</option>
      <option value="L">L</option>
      <option value="un">unidades</option>
    </select>
    <button type="button" class="remove-button" onclick="this.parentElement.remove()">×</button>
  `;
  container.appendChild(div);
}

// Adiciona um novo produto
async function adicionarProduto(event) {
  event.preventDefault();
  
  const nome = document.getElementById('produto-nome').value.trim();
  const ingredientes = coletarIngredientes();
  
  if (!nome || ingredientes.length === 0) {
    alert("Por favor, preencha o nome do produto e pelo menos um ingrediente válido");
    return;
  }

  const produto = {
    nome,
    formula: ingredientes,
    dataCriacao: new Date().toISOString()
  };

  try {
    const id = await executarTransacao('produtos', 'readwrite', store => {
      return store.add(produto);
    });
    
    produto.id = id;
    mostrarNotificacao('Produto adicionado com sucesso!');
    event.target.reset();
    document.getElementById('ingredientes-container').innerHTML = '';
    adicionarIngrediente();
    
    // Se estiver na aba de listagem, atualiza a lista
    if (document.getElementById('lista-tab').classList.contains('active')) {
      listarProdutos();
    }
  } catch (error) {
    console.error("Erro ao adicionar produto:", error);
    mostrarNotificacao('Erro ao salvar o produto', 'error');
  }
}

// Coleta os ingredientes do formulário
function coletarIngredientes() {
  return Array.from(document.querySelectorAll('.ingrediente')).map(ing => {
    return {
      ingrediente: ing.querySelector('.ingrediente-nome').value.trim(),
      quantidade: parseFloat(ing.querySelector('.ingrediente-qtd').value),
      unidade: ing.querySelector('.ingrediente-unidade').value.trim()
    };
  }).filter(ing => ing.ingrediente && !isNaN(ing.quantidade) && ing.unidade);
}

// Lista todos os produtos
async function listarProdutos() {
  const ul = document.getElementById('lista-produtos');
  ul.innerHTML = '<li>Carregando produtos...</li>';
  
  try {
    const produtos = await executarTransacao('produtos', 'readonly', store => {
      return store.getAll();
    });
    
    ul.innerHTML = '';
    
    if (produtos.length === 0) {
      ul.innerHTML = '<li>Nenhum produto cadastrado ainda.</li>';
      return;
    }
    
    // Ordenação
    const sortOption = document.getElementById('sort-select').value;
    produtos.sort((a, b) => {
      switch (sortOption) {
        case 'nome-asc': return a.nome.localeCompare(b.nome);
        case 'nome-desc': return b.nome.localeCompare(a.nome);
        case 'dataCriacao-asc': return new Date(a.dataCriacao) - new Date(b.dataCriacao);
        default: return new Date(b.dataCriacao) - new Date(a.dataCriacao);
      }
    });
    
    produtos.forEach(produto => {
      const li = document.createElement('li');
      li.className = 'produto-item';
      li.innerHTML = `
        <div class="produto-nome">${produto.nome}</div>
        <div class="produto-data">Criado em: ${formatarData(produto.dataCriacao)}</div>
        <ul class="ingredientes-list">
          ${produto.formula.map(ing => `
            <li>${ing.quantidade} ${ing.unidade} de ${ing.ingrediente}</li>
          `).join('')}
        </ul>
        <div class="produto-acoes">
          <button class="action-button edit-button" onclick="editarProduto(${produto.id})">Editar</button>
          <button class="action-button delete-button" onclick="removerProduto(${produto.id})">Excluir</button>
        </div>
      `;
      ul.appendChild(li);
    });
  } catch (error) {
    console.error("Erro ao carregar produtos:", error);
    ul.innerHTML = '<li>Erro ao carregar produtos. Recarregue a página.</li>';
  }
}

// Busca produtos por nome
async function buscarProdutos() {
  const termo = document.getElementById('search-input').value.trim().toLowerCase();
  if (!termo) {
    listarProdutos();
    return;
  }
  
  const ul = document.getElementById('lista-produtos');
  ul.innerHTML = '<li>Buscando produtos...</li>';
  
  try {
    const produtos = await executarTransacao('produtos', 'readonly', store => {
      return store.getAll();
    });
    
    const resultados = produtos.filter(produto => 
      produto.nome.toLowerCase().includes(termo) ||
      produto.formula.some(ing => ing.ingrediente.toLowerCase().includes(termo))
    );
    
    ul.innerHTML = '';
    
    if (resultados.length === 0) {
      ul.innerHTML = '<li>Nenhum produto encontrado.</li>';
      return;
    }
    
    resultados.forEach(produto => {
      const li = document.createElement('li');
      li.className = 'produto-item';
      li.innerHTML = `
        <div class="produto-nome">${produto.nome}</div>
        <div class="produto-data">Criado em: ${formatarData(produto.dataCriacao)}</div>
        <ul class="ingredientes-list">
          ${produto.formula.map(ing => `
            <li>${ing.quantidade} ${ing.unidade} de ${ing.ingrediente}</li>
          `).join('')}
        </ul>
        <div class="produto-acoes">
          <button class="action-button edit-button" onclick="editarProduto(${produto.id})">Editar</button>
          <button class="action-button delete-button" onclick="removerProduto(${produto.id})">Excluir</button>
        </div>
      `;
      ul.appendChild(li);
    });
  } catch (error) {
    console.error("Erro na busca:", error);
    ul.innerHTML = '<li>Erro ao buscar produtos.</li>';
  }
}

// Edita um produto existente
async function editarProduto(id) {
  try {
    const produto = await executarTransacao('produtos', 'readonly', store => {
      return store.get(id);
    });
    
    if (!produto) {
      mostrarNotificacao('Produto não encontrado', 'error');
      return;
    }
    
    // Preenche o formulário
    document.getElementById('produto-nome').value = produto.nome;
    document.getElementById('ingredientes-container').innerHTML = '';
    
    produto.formula.forEach(ing => {
      adicionarIngrediente();
      const container = document.getElementById('ingredientes-container');
      const lastIng = container.lastElementChild;
      lastIng.querySelector('.ingrediente-nome').value = ing.ingrediente;
      lastIng.querySelector('.ingrediente-qtd').value = ing.quantidade;
      lastIng.querySelector('.ingrediente-unidade').value = ing.unidade;
    });
    
    // Altera o submit para edição
    const form = document.getElementById('form-produto');
    form.onsubmit = async (e) => {
      e.preventDefault();
      await atualizarProduto(id);
    };
    
    // Muda para a aba de cadastro
    document.querySelector('.tab-button').click();
    document.getElementById('produto-nome').focus();
    
  } catch (error) {
    console.error("Erro ao editar produto:", error);
    mostrarNotificacao('Erro ao carregar produto para edição', 'error');
  }
}

// Atualiza um produto existente
async function atualizarProduto(id) {
  const nome = document.getElementById('produto-nome').value.trim();
  const ingredientes = coletarIngredientes();
  
  if (!nome || ingredientes.length === 0) {
    mostrarNotificacao('Preencha todos os campos corretamente', 'error');
    return;
  }

  try {
    const produto = await executarTransacao('produtos', 'readonly', store => {
      return store.get(id);
    });
    
    if (!produto) {
      mostrarNotificacao('Produto não encontrado', 'error');
      return;
    }
    
    const produtoAtualizado = {
      ...produto,
      nome,
      formula: ingredientes,
      dataAtualizacao: new Date().toISOString()
    };
    
    await executarTransacao('produtos', 'readwrite', store => {
      return store.put(produtoAtualizado);
    });
    
    mostrarNotificacao('Produto atualizado com sucesso!');
    document.getElementById('form-produto').reset();
    document.getElementById('ingredientes-container').innerHTML = '';
    adicionarIngrediente();
    setupForm();
    
    // Atualiza a lista se estiver visível
    if (document.getElementById('lista-tab').classList.contains('active')) {
      listarProdutos();
    }
  } catch (error) {
    console.error("Erro ao atualizar produto:", error);
    mostrarNotificacao('Erro ao atualizar produto', 'error');
  }
}

// Remove um produto
async function removerProduto(id) {
  if (!confirm('Tem certeza que deseja excluir este produto permanentemente?')) {
    return;
  }
  
  try {
    await executarTransacao('produtos', 'readwrite', store => {
      return store.delete(id);
    });
    
    mostrarNotificacao('Produto removido com sucesso');
    listarProdutos();
  } catch (error) {
    console.error("Erro ao remover produto:", error);
    mostrarNotificacao('Erro ao remover produto', 'error');
  }
}

// Função auxiliar para transações
function executarTransacao(storeName, mode, callback) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], mode);
    const store = tx.objectStore(storeName);
    const request = callback(store);
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.onerror = () => reject(tx.error);
  });
}

// Formata data para exibição
function formatarData(dataString) {
  const options = { 
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  };
  return new Date(dataString).toLocaleDateString('pt-BR', options);
}

// Mostra notificação
function mostrarNotificacao(mensagem, tipo = 'success') {
  const notification = document.createElement('div');
  notification.className = `notification ${tipo}`;
  notification.textContent = mensagem;
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.classList.add('fade-out');
    setTimeout(() => notification.remove(), 500);
  }, 3000);
}

// Adiciona estilos dinâmicos para notificações
const style = document.createElement('style');
style.textContent = `
  .notification {
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 15px 20px;
    border-radius: 5px;
    color: white;
    z-index: 1000;
    animation: slide-in 0.5s ease-out;
  }
  
  .success {
    background: #28a745;
  }
  
  .error {
    background: #dc3545;
  }
  
  .fade-out {
    animation: fade-out 0.5s ease-out forwards;
  }
  
  @keyframes slide-in {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }
  
  @keyframes fade-out {
    from { opacity: 1; }
    to { opacity: 0; }
  }
`;
document.head.appendChild(style);