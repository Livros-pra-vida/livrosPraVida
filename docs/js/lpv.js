// js/lpv.js - Funções compartilhadas por todas as páginas do Livros pra Vida.
// Tudo que antes ficava só no navegador (carrinho, pedidos, chat privado, favoritos, endereço, foto)
// agora é salvo no banco pela API. O localStorage guarda apenas o token da sessão e uma cópia
// rápida de alguns dados (nome, foto, quantidade do carrinho) para a página abrir sem esperar a API.
(function () {
    const API_URL = "https://lpv-api.onrender.com";
    const TIMEOUT_MS = 60000; // o servidor gratuito pode demorar para acordar
    const CHAVES_SESSAO = ["usuario", "token", "logado", "usuarioId", "usuarioNome", "usuarioEmail", "isAdmin",
        "usuarioFoto", "carrinhoQtd",
        // chaves antigas (dados que agora ficam no banco) — apagadas para não sobrar nada no navegador
        "carrinhoLivros", "historicoPedidos", "chatsPrivados", "favoritosComunidade", "alertasDesejosComunidade",
        "usuarioCep", "usuarioRua", "usuarioNumero", "usuarioBairro", "usuarioCidade", "usuarioPagamento"];

    // ---------- Sessão ----------
    function token() { return localStorage.getItem("token"); }
    function logado() { return !!token() && !!localStorage.getItem("usuario"); }
    function usuario() {
        try { return JSON.parse(localStorage.getItem("usuario")); } catch (e) { return null; }
    }

    // Guarda os dados do usuário depois do login/cadastro/atualização do perfil.
    function salvarSessao(user, novoToken) {
        if (novoToken) localStorage.setItem("token", novoToken);
        localStorage.setItem("usuario", JSON.stringify(user));
        localStorage.setItem("logado", "true");
        localStorage.setItem("usuarioId", user.id);
        localStorage.setItem("usuarioNome", user.username || "");
        localStorage.setItem("usuarioEmail", user.email || "");
        localStorage.setItem("isAdmin", user.admin ? "true" : "false");
        if (user.avatar_url) localStorage.setItem("usuarioFoto", user.avatar_url);
        else localStorage.removeItem("usuarioFoto");
    }

    function limparSessao() {
        CHAVES_SESSAO.forEach(chave => localStorage.removeItem(chave));
    }

    // Sai da conta e volta para a página inicial (funciona de qualquer pasta).
    function sair(evento) {
        if (evento && evento.preventDefault) evento.preventDefault();
        limparSessao();
        window.location.href = raiz() + "index.html";
    }

    // "../" quando a página está em /src, "" na página inicial.
    function raiz() {
        return /\/src\//.test(window.location.pathname) ? "../" : "";
    }

    // ---------- Chamadas à API ----------
    // chamar("/cart", { method: "POST", corpo: {...} }) -> dados JSON (ou null em 204).
    // Erros viram Error com .status e mensagem em português.
    async function chamar(caminho, { method = "GET", corpo } = {}) {
        const controller = new AbortController();
        const temporizador = setTimeout(() => controller.abort(), TIMEOUT_MS);
        let resposta;
        try {
            resposta = await fetch(`${API_URL}${caminho}`, {
                method,
                headers: {
                    ...(token() ? { "Authorization": `Bearer ${token()}` } : {}),
                    ...(corpo ? { "Content-Type": "application/json" } : {})
                },
                body: corpo ? JSON.stringify(corpo) : undefined,
                signal: controller.signal
            });
        } catch (erro) {
            const e = new Error(erro.name === "AbortError"
                ? "O servidor demorou a responder. Tente novamente."
                : "Sem conexão com o servidor. Se ele estava inativo, aguarde um minuto.");
            e.rede = true;
            throw e;
        } finally {
            clearTimeout(temporizador);
        }

        const dados = resposta.status === 204 ? null : await resposta.json().catch(() => null);
        if (resposta.status === 401 && token()) {
            // Token vencido (12 h) ou senha trocada em outro lugar: encerra a sessão.
            limparSessao();
        }
        if (!resposta.ok) {
            const mensagem = (dados && Array.isArray(dados.errors) && dados.errors.join(", "))
                || (dados && typeof dados.error === "string" && dados.error)
                || (resposta.status === 401 ? "Sua sessão expirou. Entre novamente."
                    : resposta.status === 403 ? "Você não tem permissão para fazer isso."
                    : resposta.status === 429 ? "Muitas tentativas seguidas. Aguarde um pouco."
                    : "Não foi possível concluir. Tente novamente.");
            const e = new Error(mensagem);
            e.status = resposta.status;
            throw e;
        }
        return dados;
    }

    // ---------- Login compatível com a API antiga e a nova ----------
    // SHA-256 em hexadecimal (o mesmo formato que o front antigo mandava com CryptoJS).
    async function sha256Hex(texto) {
        const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
        return Array.from(new Uint8Array(bytes)).map(b => b.toString(16).padStart(2, "0")).join("");
    }

    // POST /users/login. Tenta com a senha pura (API nova); se a API recusar, tenta com o SHA-256
    // da senha (API antiga, que ainda está no ar até o próximo deploy). Devolve { resposta, dados }.
    async function login(email, senha) {
        const enviar = async (senhaEnviada) => {
            const resposta = await fetch(`${API_URL}/users/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password: senhaEnviada })
            });
            const dados = await resposta.json().catch(() => ({}));
            return { resposta, dados };
        };
        let resultado = await enviar(senha);
        if (resultado.resposta.status === 401) resultado = await enviar(await sha256Hex(senha));
        return resultado;
    }

    // ---------- Segurança ----------
    // Escapa texto antes de colocá-lo em innerHTML (evita XSS).
    function esc(valor) {
        return String(valor ?? "").replace(/[&<>"']/g, c => (
            { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    // Só aceita imagem http(s) ou data URL de imagem; o resto vira a imagem padrão.
    function urlImagem(url, padrao) {
        const u = String(url || "").trim();
        return /^(https?:\/\/|data:image\/(png|jpe?g|webp|gif);base64,)/i.test(u) ? u : (padrao || "");
    }

    function moeda(valor) {
        return Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    }

    // ---------- Avisos bonitos (toast) no lugar do alert() ----------
    function toast(texto, tipo = "info", duracao = 3800) {
        let caixa = document.getElementById("lpvToasts");
        if (!caixa) {
            caixa = document.createElement("div");
            caixa.id = "lpvToasts";
            caixa.className = "lpv-toasts";
            caixa.setAttribute("role", "status");
            caixa.setAttribute("aria-live", "polite");
            document.body.append(caixa);
        }
        const aviso = document.createElement("div");
        aviso.className = `lpv-toast lpv-toast-${tipo}`;
        aviso.textContent = texto;
        caixa.append(aviso);
        requestAnimationFrame(() => aviso.classList.add("visivel"));
        setTimeout(() => {
            aviso.classList.remove("visivel");
            setTimeout(() => aviso.remove(), 300);
        }, duracao);
    }

    // Mostra um aviso depois de trocar de página (ex.: "Pedido realizado!" ao chegar no perfil).
    function toastNaProximaPagina(texto, tipo = "sucesso") {
        sessionStorage.setItem("lpvToast", JSON.stringify({ texto, tipo }));
    }

    // ---------- Carrinho (salvo no banco) ----------
    function pintarContadorCarrinho() {
        const qtd = Number(localStorage.getItem("carrinhoQtd") || 0);
        document.querySelectorAll("#contadorCarrinhoHeader, [data-contador-carrinho]").forEach(el => {
            el.textContent = qtd;
            el.style.display = qtd > 0 ? "inline-block" : "none";
        });
    }

    function guardarResumoCarrinho(resumo) {
        localStorage.setItem("carrinhoQtd", resumo ? resumo.count : 0);
        pintarContadorCarrinho();
        return resumo;
    }

    const carrinho = {
        // Lê o carrinho do banco: { items, count, subtotal, shipping, total }
        async carregar() {
            if (!logado()) return guardarResumoCarrinho({ items: [], count: 0, subtotal: 0, shipping: 0, total: 0 });
            return guardarResumoCarrinho(await chamar("/cart"));
        },
        // adicionar({ catalogBookId: 3 }) ou adicionar({ titulo: "Duna" })
        async adicionar({ catalogBookId, titulo }) {
            if (!logado()) {
                toastNaProximaPagina("Entre na sua conta para usar o carrinho.", "info");
                window.location.href = raiz() + "src/Login.html";
                return null;
            }
            const corpo = catalogBookId ? { catalog_book_id: catalogBookId } : { title: titulo };
            try {
                const resumo = guardarResumoCarrinho(await chamar("/cart/items", { method: "POST", corpo }));
                const nome = titulo || (resumo.items.find(i => i.catalog_book_id === catalogBookId) || {}).title || "Livro";
                toast(`"${nome}" foi adicionado ao carrinho!`, "sucesso");
                return resumo;
            } catch (erro) {
                toast(erro.status === 404 ? "Este livro não está mais disponível na loja." : erro.message, "erro");
                return null;
            }
        },
        async alterar(itemId, quantidade) {
            return guardarResumoCarrinho(await chamar(`/cart/items/${itemId}`, { method: "PATCH", corpo: { quantity: quantidade } }));
        },
        async remover(itemId) {
            return guardarResumoCarrinho(await chamar(`/cart/items/${itemId}`, { method: "DELETE" }));
        },
        pintarContador: pintarContadorCarrinho
    };

    // ---------- Ao abrir qualquer página ----------
    document.addEventListener("DOMContentLoaded", () => {
        // Remove dados antigos que ficavam no navegador (agora estão no banco).
        ["carrinhoLivros", "historicoPedidos", "chatsPrivados", "favoritosComunidade", "alertasDesejosComunidade",
            "usuarioCep", "usuarioRua", "usuarioNumero", "usuarioBairro", "usuarioCidade", "usuarioPagamento"]
            .forEach(chave => localStorage.removeItem(chave));

        pintarContadorCarrinho();

        const pendente = sessionStorage.getItem("lpvToast");
        if (pendente) {
            sessionStorage.removeItem("lpvToast");
            try { const { texto, tipo } = JSON.parse(pendente); toast(texto, tipo); } catch (e) { /* ignora */ }
        }

        // Atualiza a quantidade do carrinho em segundo plano (sem travar a página).
        if (logado()) carrinho.carregar().catch(() => { /* servidor dormindo: mantém o número salvo */ });
    });

    window.LPV = {
        API_URL, token, logado, usuario, salvarSessao, limparSessao, sair, raiz, login, sha256Hex,
        chamar, esc, urlImagem, moeda, toast, toastNaProximaPagina, carrinho
    };
})();
