// app.js - Sistema completo com abas e inputs em CAIXA ALTA

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

// Configura inputs para CAIXA ALTA
function configurarInputsCaixaAlta() {
  const inputs = document.querySelectorAll(`
    #produto-nome,
    .ingrediente-nome,
    .ingrediente-unidade,
    #search-input
  `);
  
  inputs.forEach(input => {
    // Converter valor existente
    if (input.value) input.value = input.value.toUpperCase();
    
    // Configurar para converter enquanto digita
    input.addEventListener('input', function() {
      const cursorPosition = this.selectionStart;
      this.value = this.value.toUpperCase();
      this.setSelectionRange(cursorPosition, cursorPosition);
    });
    
    // Configurar para converter ao colar texto
    input.addEventListener('paste', function(e) {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text').toUpperCase();
      document.execCommand('insertText', false, text);
    });
  });
}

// Inicializa o aplicativo
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await initDB();
    setupForm();
    adicionarIngrediente(); // Adiciona um campo de ingrediente por padrão
    configurarInputsCaixaAlta(); // Configura os inputs para CAIXA ALTA
    
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
    configurarInputsCaixaAlta(); // Reconfigura os inputs após reset
    form.onsubmit = adicionarProduto;
  };
}

// Adiciona campos para um novo ingrediente
function adicionarIngrediente() {
  const container = document.getElementById('ingredientes-container');
  const div = document.createElement('div');
  div.className = 'ingrediente';
  div.innerHTML = `
    <input type="text" placeholder="NOME DO INGREDIENTE" class="ingrediente-nome" required>
    <input type="number" placeholder="QUANTIDADE" class="ingrediente-qtd" step="0.01" min="0" required>
    <select class="ingrediente-unidade" required>
      <option value="">UNIDADE</option>
      <option value="G">G</option>
      <option value="KG">KG</option>
      <option value="ML">ML</option>
      <option value="L">L</option>
      <option value="UN">UNIDADES</option>
    </select>
    <button type="button" class="remove-button" onclick="this.parentElement.remove()">×</button>
  `;
  container.appendChild(div);
  configurarInputsCaixaAlta(); // Configura os novos inputs
}

// Adiciona um novo produto
async function adicionarProduto(event) {
  event.preventDefault();
  
  const nome = document.getElementById('produto-nome').value.trim();
  const ingredientes = coletarIngredientes();
  
  if (!nome || ingredientes.length === 0) {
    alert("POR FAVOR, PREENCHA O NOME DO PRODUTO E PELO MENOS UM INGREDIENTE VÁLIDO");
    return;
  }

  const produto = {
    nome: nome.toUpperCase(), // Garante caixa alta no nome
    formula: ingredientes.map(ing => ({
      ingrediente: ing.ingrediente.toUpperCase(), // Garante caixa alta nos ingredientes
      quantidade: ing.quantidade,
      unidade: ing.unidade.toUpperCase() // Garante caixa alta nas unidades
    })),
    dataCriacao: new Date().toISOString()
  };

  try {
    const id = await executarTransacao('produtos', 'readwrite', store => {
      return store.add(produto);
    });
    
    produto.id = id;
    mostrarNotificacao('PRODUTO ADICIONADO COM SUCESSO!');
    event.target.reset();
    document.getElementById('ingredientes-container').innerHTML = '';
    adicionarIngrediente();
    
    // Se estiver na aba de listagem, atualiza a lista
    if (document.getElementById('lista-tab').classList.contains('active')) {
      listarProdutos();
    }
  } catch (error) {
    console.error("Erro ao adicionar produto:", error);
    mostrarNotificacao('ERRO AO SALVAR O PRODUTO', 'error');
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
  ul.innerHTML = '<li>CARREGANDO PRODUTOS...</li>';
  
  try {
    const produtos = await executarTransacao('produtos', 'readonly', store => {
      return store.getAll();
    });
    
    ul.innerHTML = '';
    
    if (produtos.length === 0) {
      ul.innerHTML = '<li>NENHUM PRODUTO CADASTRADO AINDA.</li>';
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
        <div class="produto-data">CRIADO EM: ${formatarData(produto.dataCriacao)}</div>
        <ul class="ingredientes-list">
          ${produto.formula.map(ing => `
            <li>${ing.quantidade} ${ing.unidade} DE ${ing.ingrediente}</li>
          `).join('')}
        </ul>
        <div class="produto-acoes">
          <button class="action-button edit-button" onclick="editarProduto(${produto.id})">EDITAR</button>
          <button class="action-button delete-button" onclick="removerProduto(${produto.id})">EXCLUIR</button>
        </div>
      `;
      ul.appendChild(li);
    });
  } catch (error) {
    console.error("ERRO AO CARREGAR PRODUTOS:", error);
    ul.innerHTML = '<li>ERRO AO CARREGAR PRODUTOS. RECARREGUE A PÁGINA.</li>';
  }
}

// Busca produtos por nome
async function buscarProdutos() {
  const termo = document.getElementById('search-input').value.trim().toUpperCase();
  if (!termo) {
    listarProdutos();
    return;
  }
  
  const ul = document.getElementById('lista-produtos');
  ul.innerHTML = '<li>BUSCANDO PRODUTOS...</li>';
  
  try {
    const produtos = await executarTransacao('produtos', 'readonly', store => {
      return store.getAll();
    });
    
    const resultados = produtos.filter(produto => 
      produto.nome.toUpperCase().includes(termo) ||
      produto.formula.some(ing => ing.ingrediente.toUpperCase().includes(termo))
    );
    
    ul.innerHTML = '';
    
    if (resultados.length === 0) {
      ul.innerHTML = '<li>NENHUM PRODUTO ENCONTRADO.</li>';
      return;
    }
    
    resultados.forEach(produto => {
      const li = document.createElement('li');
      li.className = 'produto-item';
      li.innerHTML = `
        <div class="produto-nome">${produto.nome}</div>
        <div class="produto-data">CRIADO EM: ${formatarData(produto.dataCriacao)}</div>
        <ul class="ingredientes-list">
          ${produto.formula.map(ing => `
            <li>${ing.quantidade} ${ing.unidade} DE ${ing.ingrediente}</li>
          `).join('')}
        </ul>
        <div class="produto-acoes">
          <button class="action-button edit-button" onclick="editarProduto(${produto.id})">EDITAR</button>
          <button class="action-button delete-button" onclick="removerProduto(${produto.id})">EXCLUIR</button>
        </div>
      `;
      ul.appendChild(li);
    });
  } catch (error) {
    console.error("ERRO NA BUSCA:", error);
    ul.innerHTML = '<li>ERRO AO BUSCAR PRODUTOS.</li>';
  }
}

// Edita um produto existente
async function editarProduto(id) {
  try {
    const produto = await executarTransacao('produtos', 'readonly', store => {
      return store.get(id);
    });
    
    if (!produto) {
      mostrarNotificacao('PRODUTO NÃO ENCONTRADO', 'error');
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
    
    // Configura os inputs em CAIXA ALTA
    configurarInputsCaixaAlta();
    
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
    console.error("ERRO AO EDITAR PRODUTO:", error);
    mostrarNotificacao('ERRO AO CARREGAR PRODUTO PARA EDIÇÃO', 'error');
  }
}

// Atualiza um produto existente
async function atualizarProduto(id) {
  const nome = document.getElementById('produto-nome').value.trim();
  const ingredientes = coletarIngredientes();
  
  if (!nome || ingredientes.length === 0) {
    mostrarNotificacao('PREENCHA TODOS OS CAMPOS CORRETAMENTE', 'error');
    return;
  }

  try {
    const produto = await executarTransacao('produtos', 'readonly', store => {
      return store.get(id);
    });
    
    if (!produto) {
      mostrarNotificacao('PRODUTO NÃO ENCONTRADO', 'error');
      return;
    }
    
    const produtoAtualizado = {
      ...produto,
      nome: nome.toUpperCase(),
      formula: ingredientes.map(ing => ({
        ingrediente: ing.ingrediente.toUpperCase(),
        quantidade: ing.quantidade,
        unidade: ing.unidade.toUpperCase()
      })),
      dataAtualizacao: new Date().toISOString()
    };
    
    await executarTransacao('produtos', 'readwrite', store => {
      return store.put(produtoAtualizado);
    });
    
    mostrarNotificacao('PRODUTO ATUALIZADO COM SUCESSO!');
    document.getElementById('form-produto').reset();
    document.getElementById('ingredientes-container').innerHTML = '';
    adicionarIngrediente();
    setupForm();
    
    // Atualiza a lista se estiver visível
    if (document.getElementById('lista-tab').classList.contains('active')) {
      listarProdutos();
    }
  } catch (error) {
    console.error("ERRO AO ATUALIZAR PRODUTO:", error);
    mostrarNotificacao('ERRO AO ATUALIZAR PRODUTO', 'error');
  }
}

// Remove um produto
async function removerProduto(id) {
  if (!confirm('TEM CERTEZA QUE DESEJA EXCLUIR ESTE PRODUTO PERMANENTEMENTE?')) {
    return;
  }
  
  try {
    await executarTransacao('produtos', 'readwrite', store => {
      return store.delete(id);
    });
    
    mostrarNotificacao('PRODUTO REMOVIDO COM SUCESSO');
    listarProdutos();
  } catch (error) {
    console.error("ERRO AO REMOVER PRODUTO:", error);
    mostrarNotificacao('ERRO AO REMOVER PRODUTO', 'error');
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
  notification.textContent = mensagem.toUpperCase(); // Notificações em CAIXA ALTA
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
    text-transform: uppercase;
    font-variant: small-caps;
    letter-spacing: 1px;
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

  /* Estilo para inputs em CAIXA ALTA */
  #produto-nome,
  .ingrediente-nome,
  .ingrediente-unidade,
  #search-input {
    text-transform: uppercase;
    font-variant: small-caps;
    letter-spacing: 0.5px;
  }

  /* Placeholders em CAIXA ALTA */
  #produto-nome::placeholder,
  .ingrediente-nome::placeholder,
  #search-input::placeholder {
    text-transform: none;
    font-variant: normal;
  }
`;
document.head.appendChild(style);