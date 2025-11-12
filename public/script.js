document.querySelectorAll(".btn-basico").forEach((button) => {
  button.addEventListener("click", async () => {
    const produtoId = button.closest(".produto").getAttribute("data-id");

    const response = await fetch("/api/carrinho/adicionar", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ produtoId }),
    });

    const result = await response.json();

    if (result.ok) {
      alert("✅ Produto adicionado ao carrinho!");
    } else if (result.login) {
      window.location.href = "/login"; // <-- Redireciona automaticamente
    } else {
      alert("❌ Erro ao adicionar ao carrinho.");
    }
  });
});