const add = async (produtoId) => {
  const response = await fetch('/api/carrinho/adicionar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ produtoId })
  });
  
  const data = await response.json()

  if(!data.ok){
    if(data.login){
      alert('Faça login para adicionar itens ao carrinho');
      window.location.href = '/login';
    }
    alert("Ocorreu um erro ao adicionar produto")
    return;
  }

  window.location.reload()
}

const remove = async (produtoId) => {
  const response = await fetch("/api/carrinho/remover", {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ produtoId })
  });

  const data = await response.json()

  if(!data.ok){
    if(data.login){
      alert('Faça login para adicionar itens ao carrinho');
      window.location.href = '/login';
    }
    alert("Ocorreu um erro ao adicionar produto")
    return;
  }

  window.location.reload()
}

const form = document.querySelector("#cart-form")

form.addEventListener("submit", async (event) => {
  event.preventDefault()
  const response = await fetch("/compra/finalizar", { method: "POST" })

  const data = await response.json()

  if(!data.ok){
    if(data.login){
      alert("É necessário fazer login para completar essa ação")
      window.location.href("/login")
      return
    }

    if(data.error){
      alert(data.erro)
    }
  }

  alert("Compra finalizada!")
  window.location.reload()
})