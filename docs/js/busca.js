let categoriaAtual = 'todos';

function filtrarLivros() {
    const input = document.getElementById('searchInput');
    if (!input) return;

    // Normaliza o texto de busca (minúsculo e sem espaços extras)
    const termoBusca = input.value.toLowerCase().trim();
    
    // Pega todos os cards de livros na página
    const cards = document.querySelectorAll('.card-livro');

    cards.forEach(card => {
        // Pega os dados armazenados nos atributos data- do card
        const titulo = (card.getAttribute('data-titulo') || '').toLowerCase();
        const autor = (card.getAttribute('data-autor') || '').toLowerCase();
        const citacao = (card.getAttribute('data-citacao') || '').toLowerCase();
        const modalidade = (card.getAttribute('data-modalidade') || '').toLowerCase();

        // Verifica se o texto digitado combina com título, autor ou citação
        const correspondeTexto = titulo.includes(termoBusca) || 
                                 autor.includes(termoBusca) || 
                                 citacao.includes(termoBusca);

        // Verifica se a modalidade bate com a aba selecionada
        const correspondeCategoria = (categoriaAtual === 'todos') || (modalidade === categoriaAtual);

        // Exibe ou esconde o card
        if (correspondeTexto && correspondeCategoria) {
            card.style.display = ""; // Restaura a exibição padrão (CSS flex/grid/block)
        } else {
            card.style.display = "none";
        }
    });
}

function filtrarCategoria(categoria, elemento) {
    categoriaAtual = categoria.toLowerCase();

    // Atualiza a classe ativa nos botões
    const botoes = document.querySelectorAll('.filter-btn');
    botoes.forEach(btn => btn.classList.remove('active'));
    if (elemento) {
        elemento.classList.add('active');
    }

    // Aplica o filtro atualizado
    filtrarLivros();
}