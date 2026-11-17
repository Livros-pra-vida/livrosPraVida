// js/estantes.js - Página "Minhas Estantes" (estantes privadas, por usuário logado)
// Toda chamada à API leva o token do login; a API só devolve as estantes e livros do dono do token.

const API_URL = "https://lpv-api.onrender.com";
const TIMEOUT_MS = 60000; // o Render gratuito pode demorar para acordar
const NOVO_AUTOR = "__novo__";

const estado = { estantes: [], autores: [], selecionadaId: null };

const $ = (id) => document.getElementById(id);

// ---------- Utilitários ----------

// Apaga os dados de sessão do navegador.
function limparSessao() {
    ["usuario", "token", "logado", "usuarioId", "usuarioNome", "usuarioEmail", "isAdmin", "usuarioFoto"]
        .forEach((chave) => localStorage.removeItem(chave));
}

// Redireciona para a tela de login.
function irParaLogin() {
    window.location.href = "Login.html";
}

// Encerra a sessão e volta para o login.
function sair() {
    limparSessao();
    window.location.href = "../index.html";
}

// Cria elementos sem innerHTML: textos vindos da API entram sempre como texto (seguro contra XSS).
function el(tag, props = {}, ...filhos) {
    const no = document.createElement(tag);
    Object.entries(props).forEach(([chave, valor]) => {
        if (chave === "class") no.className = valor;
        else if (chave === "text") no.textContent = valor;
        else if (chave.startsWith("on")) no.addEventListener(chave.slice(2), valor);
        else no.setAttribute(chave, valor);
    });
    filhos.flat().forEach((filho) => {
        if (filho !== null && filho !== undefined && filho !== false) no.append(filho);
    });
    return no;
}

// Mostra uma mensagem rápida (ok/erro) no topo da página e a esconde sozinha depois de alguns segundos.
let temporizadorAviso = null;
function avisar(texto, tipo = "ok") {
    const caixa = $("avisoGeral");
    caixa.textContent = texto;
    caixa.className = `aviso ${tipo}`;
    caixa.hidden = false;
    clearTimeout(temporizadorAviso);
    if (tipo === "ok") {
        temporizadorAviso = setTimeout(() => { caixa.hidden = true; }, 6000);
    }
}

// "2026-08-31" -> "31/08/2026" (sem passar por Date, para não sofrer com fuso horário)
function formatarData(iso) {
    if (!iso) return "";
    const [ano, mes, dia] = String(iso).substring(0, 10).split("-");
    return `${dia}/${mes}/${ano}`;
}

// Desabilita o botão enquanto a ação roda (evita clique duplo)
async function comBotaoOcupado(botao, textoOcupado, acao) {
    const textoOriginal = botao.textContent;
    botao.disabled = true;
    botao.textContent = textoOcupado;
    try {
        return await acao();
    } finally {
        botao.disabled = false;
        botao.textContent = textoOriginal;
    }
}

// ---------- API ----------

// Transforma a resposta de erro da API em um texto para o usuário.
function mensagemDeErro(dados, status) {
    if (dados && Array.isArray(dados.errors) && dados.errors.length) return dados.errors.join(", ");
    if (dados && typeof dados.error === "string") return dados.error;
    if (status === 404) return "Não encontrado.";
    if (status === 400) return "Dados inválidos.";
    return `Erro inesperado (${status}).`;
}

// Chamada à API com o token do usuário; trata sessão expirada e tempo limite de 60 s (servidor gratuito acorda devagar).
async function api(caminho, { method = "GET", corpo } = {}) {
    const token = localStorage.getItem("token");
    if (!token) {
        irParaLogin();
        throw new Error("Você precisa estar logado.");
    }

    const controller = new AbortController();
    const temporizador = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let resposta;

    try {
        resposta = await fetch(`${API_URL}${caminho}`, {
            method,
            headers: {
                "Authorization": `Bearer ${token}`,
                ...(corpo ? { "Content-Type": "application/json" } : {})
            },
            body: corpo ? JSON.stringify(corpo) : undefined,
            signal: controller.signal
        });
    } catch (erro) {
        throw new Error(erro.name === "AbortError"
            ? "O servidor demorou a responder. Tente novamente."
            : "Não foi possível conectar ao servidor.");
    } finally {
        clearTimeout(temporizador);
    }

    if (resposta.status === 401) {
        limparSessao();
        alert("Sua sessão expirou. Faça login novamente.");
        irParaLogin();
        throw new Error("Sessão expirada.");
    }

    if (resposta.status === 204) return null;

    const dados = await resposta.json().catch(() => null);
    if (!resposta.ok) {
        const erro = new Error(mensagemDeErro(dados, resposta.status));
        erro.status = resposta.status;
        throw erro;
    }
    return dados;
}

// ---------- Renderização ----------

// Desenha a lista lateral de estantes com a contagem de livros.
function renderLista() {
    const lista = $("listaEstantes");
    lista.replaceChildren();

    if (estado.estantes.length === 0) {
        lista.append(el("li", { class: "vazio", text: "Você ainda não tem estantes. Crie a primeira abaixo." }));
        return;
    }

    estado.estantes.forEach((estante) => {
        const ativa = estante.id === estado.selecionadaId;
        const botao = el("button", {
            type: "button",
            class: "item-estante" + (ativa ? " ativa" : ""),
            "aria-pressed": String(ativa),
            onclick: () => selecionar(estante.id)
        },
            el("span", { class: "item-nome", text: estante.name }),
            el("span", { class: "item-contagem", text: `${estante.books_count}/${estante.limit}` })
        );
        lista.append(el("li", {}, botao));
    });
}

// Preenche o seletor de autores (com a opção de cadastrar um novo).
function renderAutores(autorSelecionadoId = "") {
    const select = $("livroAutor");
    select.replaceChildren(
        el("option", { value: "", text: "Selecione o autor" }),
        ...estado.autores.map((autor) => el("option", { value: String(autor.id), text: autor.name })),
        el("option", { value: NOVO_AUTOR, text: "➕ Novo autor..." })
    );
    select.value = String(autorSelecionadoId);
    atualizarCampoNovoAutor();
}

// Mostra o campo de novo autor só quando essa opção está escolhida.
function atualizarCampoNovoAutor() {
    const novo = $("livroAutor").value === NOVO_AUTOR;
    $("grupoNovoAutor").hidden = !novo;
    $("novoAutorNome").required = novo;
}

// Desenha a estante aberta: nome, limite, formulário e livros.
function renderPainel(estante) {
    $("painelVazio").hidden = true;
    $("painelEstante").hidden = false;

    $("estanteTitulo").textContent = estante.name;
    const total = estante.books ? estante.books.length : estante.books_count;
    $("estanteResumo").textContent = `${total} de ${estante.limit} livros`;
    $("editNome").value = estante.name;
    $("editLimite").value = estante.limit;

    const lista = $("listaLivros");
    lista.replaceChildren();

    if (!estante.books || estante.books.length === 0) {
        lista.append(el("p", { class: "vazio", text: "Esta estante ainda está vazia. Adicione o primeiro livro abaixo." }));
        return;
    }

    estante.books.forEach((livro) => {
        const meta = el("div", { class: "livro-meta" });
        if (livro.rating) meta.append(el("span", { class: "nota", text: "★".repeat(livro.rating) }), " ");
        if (livro.release) meta.append(`Lançamento: ${formatarData(livro.release)}`);

        lista.append(el("div", { class: "livro-linha" },
            el("div", { class: "livro-info" },
                el("strong", { text: livro.title }),
                el("div", { class: "livro-autor", text: livro.author_name || "Autor desconhecido" }),
                (livro.rating || livro.release) ? meta : null
            ),
            el("button", { type: "button", class: "btn-remover", onclick: () => removerLivro(livro) }, "Remover")
        ));
    });
}

// Mostra o painel sem nenhuma estante selecionada.
function mostrarPainelVazio() {
    estado.selecionadaId = null;
    $("painelEstante").hidden = true;
    $("painelVazio").hidden = false;
}

// ---------- Ações ----------

// Busca na API as estantes do usuário.
async function carregarEstantes() {
    estado.estantes = await api("/bookcases");
    renderLista();
}

// Busca na API a lista de autores.
async function carregarAutores() {
    estado.autores = await api("/authors");
    renderAutores();
}

// Abre uma estante (busca os livros dela) e mostra no painel.
async function selecionar(id) {
    estado.selecionadaId = id;
    renderLista();
    try {
        const estante = await api(`/bookcases/${id}`);
        // Se o usuário clicou em outra estante enquanto esta carregava, ignora a resposta antiga
        if (estado.selecionadaId !== id) return;
        renderPainel(estante);
    } catch (erro) {
        avisar(erro.message, "erro");
        if (erro.status === 404) {
            await carregarEstantes();
            mostrarPainelVazio();
            renderLista();
        }
    }
}

// Recarrega a lista lateral (contadores) e a estante aberta
async function atualizarTudo() {
    await carregarEstantes();
    if (estado.selecionadaId !== null) await selecionar(estado.selecionadaId);
}

// Cria uma estante nova para o usuário logado.
async function criarEstante(evento) {
    evento.preventDefault();
    const nome = $("novaNome").value.trim();
    const limite = parseInt($("novaLimite").value, 10);

    if (!nome) return avisar("Informe o nome da estante.", "erro");
    if (!Number.isInteger(limite) || limite < 1 || limite > 500) {
        return avisar("O limite deve ser um número entre 1 e 500.", "erro");
    }

    await comBotaoOcupado($("btnCriarEstante"), "Criando...", async () => {
        try {
            const nova = await api("/bookcases", { method: "POST", corpo: { bookcase: { name: nome, limit: limite } } });
            $("formNovaEstante").reset();
            $("novaLimite").value = 50;
            await carregarEstantes();
            await selecionar(nova.id);
            avisar(`Estante "${nova.name}" criada.`);
        } catch (erro) {
            avisar(erro.message, "erro");
        }
    });
}

// Salva o novo nome e limite da estante aberta.
async function salvarEstante(evento) {
    evento.preventDefault();
    const nome = $("editNome").value.trim();
    const limite = parseInt($("editLimite").value, 10);

    if (!nome) return avisar("Informe o nome da estante.", "erro");
    if (!Number.isInteger(limite) || limite < 1 || limite > 500) {
        return avisar("O limite deve ser um número entre 1 e 500.", "erro");
    }

    await comBotaoOcupado($("btnSalvarEstante"), "Salvando...", async () => {
        try {
            await api(`/bookcases/${estado.selecionadaId}`, { method: "PATCH", corpo: { bookcase: { name: nome, limit: limite } } });
            await atualizarTudo();
            avisar("Estante atualizada.");
        } catch (erro) {
            avisar(erro.message, "erro");
        }
    });
}

// Exclui a estante aberta (e seus livros) após confirmação.
async function excluirEstante() {
    const estante = estado.estantes.find((e) => e.id === estado.selecionadaId);
    if (!estante) return;

    const confirmar = confirm(
        `Excluir a estante "${estante.name}"?\n\nOs ${estante.books_count} livro(s) que estão nela também serão removidos. Isso não pode ser desfeito.`
    );
    if (!confirmar) return;

    await comBotaoOcupado($("btnExcluirEstante"), "Excluindo...", async () => {
        try {
            await api(`/bookcases/${estante.id}`, { method: "DELETE" });
            mostrarPainelVazio();
            await carregarEstantes();
            avisar(`Estante "${estante.name}" excluída.`);
        } catch (erro) {
            avisar(erro.message, "erro");
        }
    });
}

// Adiciona um livro à estante, criando o autor antes se for novo.
async function adicionarLivro(evento) {
    evento.preventDefault();

    const titulo = $("livroTitulo").value.trim();
    let autorId = $("livroAutor").value;
    const nota = $("livroNota").value;
    const lancamento = $("livroLancamento").value;

    if (!titulo) return avisar("Informe o título do livro.", "erro");
    if (!autorId) return avisar("Selecione o autor (ou escolha \"Novo autor\").", "erro");

    let nomeNovoAutor = "";
    if (autorId === NOVO_AUTOR) {
        nomeNovoAutor = $("novoAutorNome").value.trim();
        if (!nomeNovoAutor) return avisar("Informe o nome do novo autor.", "erro");
    }

    await comBotaoOcupado($("btnAdicionarLivro"), "Adicionando...", async () => {
        try {
            if (autorId === NOVO_AUTOR) {
                // Se o autor já existe na lista (mesmo nome), reaproveita em vez de duplicar
                let autor = estado.autores.find((a) => a.name.toLowerCase() === nomeNovoAutor.toLowerCase());
                if (!autor) {
                    autor = await api("/authors", { method: "POST", corpo: { author: { name: nomeNovoAutor } } });
                    estado.autores.push(autor);
                    estado.autores.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
                }
                autorId = String(autor.id);
            }

            await api("/books", {
                method: "POST",
                corpo: {
                    book: {
                        title: titulo,
                        author_id: Number(autorId),
                        bookcase_id: estado.selecionadaId,
                        rating: nota ? Number(nota) : null,
                        release: lancamento || null
                    }
                }
            });

            $("formNovoLivro").reset();
            renderAutores();
            await atualizarTudo();
            avisar(`"${titulo}" foi adicionado à estante.`);
        } catch (erro) {
            avisar(erro.message, "erro");
        }
    });
}

// Remove um livro da estante.
async function removerLivro(livro) {
    if (!confirm(`Remover "${livro.title}" desta estante?`)) return;

    try {
        await api(`/books/${livro.id}`, { method: "DELETE" });
        await atualizarTudo();
        avisar(`"${livro.title}" foi removido.`);
    } catch (erro) {
        avisar(erro.message, "erro");
    }
}

// ---------- Início ----------

document.addEventListener("DOMContentLoaded", async () => {
    if (!localStorage.getItem("token")) {
        alert("Você precisa estar logado para ver suas estantes.");
        irParaLogin();
        return;
    }

    $("btnSair").addEventListener("click", (e) => { e.preventDefault(); sair(); });
    $("formNovaEstante").addEventListener("submit", criarEstante);
    $("formEditarEstante").addEventListener("submit", salvarEstante);
    $("formNovoLivro").addEventListener("submit", adicionarLivro);
    $("btnExcluirEstante").addEventListener("click", excluirEstante);
    $("livroAutor").addEventListener("change", atualizarCampoNovoAutor);
    renderAutores();

    try {
        await Promise.all([carregarEstantes(), carregarAutores()]);
        if (estado.estantes.length > 0) await selecionar(estado.estantes[0].id);
    } catch (erro) {
        $("listaEstantes").replaceChildren(el("li", { class: "vazio", text: "Não foi possível carregar as estantes." }));
        avisar(erro.message, "erro");
    }
});
