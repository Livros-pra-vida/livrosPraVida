// js/admin.js - Ferramentas do administrador, usadas no Catálogo, no Comprar & Trocar e no Chat.
// Importante: aqui só se mostram ou escondem os botões. Quem realmente barra uma ação de admin
// é a API (ela confere o token em cada pedido), então mexer no localStorage não dá poder nenhum.
(function () {
    const API_URL = "https://lpv-api.onrender.com";
    const TIMEOUT_MS = 60000; // o servidor gratuito pode demorar para acordar

    // Diz se o usuário logado é administrador (só controla a exibição dos botões).
    function ehAdmin() {
        return !!localStorage.getItem("token") && localStorage.getItem("isAdmin") === "true";
    }

    // Escapa texto antes de colocá-lo em innerHTML (os dados agora vêm da API e são de outras pessoas).
    function esc(valor) {
        return String(valor ?? "").replace(/[&<>"']/g, c => (
            { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    // Só aceita endereço de imagem http(s) ou imagem em data URL; qualquer outra coisa vira a imagem padrão.
    function urlImagem(url, padrao) {
        const u = String(url || "").trim();
        return /^(https?:\/\/|data:image\/(png|jpe?g|webp|gif);base64,)/i.test(u) ? u : (padrao || "");
    }

    // Chamada à API com o token do usuário e limite de 60 s. Erros ganham .status e mensagem em português.
    async function chamar(caminho, { method = "GET", corpo } = {}) {
        const token = localStorage.getItem("token");
        const controller = new AbortController();
        const temporizador = setTimeout(() => controller.abort(), TIMEOUT_MS);
        let resposta;

        try {
            resposta = await fetch(`${API_URL}${caminho}`, {
                method,
                headers: {
                    ...(token ? { "Authorization": `Bearer ${token}` } : {}),
                    ...(corpo ? { "Content-Type": "application/json" } : {})
                },
                body: corpo ? JSON.stringify(corpo) : undefined,
                signal: controller.signal
            });
        } catch (erro) {
            const e = new Error(erro.name === "AbortError"
                ? "O servidor demorou a responder. Tente novamente."
                : "Sem conexão com o servidor.");
            e.rede = true;
            throw e;
        } finally {
            clearTimeout(temporizador);
        }

        const dados = resposta.status === 204 ? null : await resposta.json().catch(() => null);
        if (!resposta.ok) {
            const mensagem = (dados && Array.isArray(dados.errors) && dados.errors.join(", "))
                || (dados && typeof dados.error === "string" && dados.error)
                || (resposta.status === 403 ? "Apenas administradores podem fazer isso."
                    : resposta.status === 401 ? "Sua sessão expirou. Entre novamente."
                    : "Não foi possível concluir. Tente novamente.");
            const e = new Error(mensagem);
            e.status = resposta.status;
            throw e;
        }
        return dados;
    }

    // Estilos do modal de perfil (injetados aqui para não depender de uma folha de estilo por página).
    function injetarEstilos() {
        if (document.getElementById("adminEstilos")) return;
        const estilo = document.createElement("style");
        estilo.id = "adminEstilos";
        estilo.textContent = `
            .admin-usuario { background: none; border: none; padding: 0; margin: 0; font: inherit; color: inherit;
                cursor: pointer; font-weight: 700; text-decoration: underline dotted; }
            .admin-usuario:hover { color: #8c533e; }
            .admin-btn-perigo { background: #c0392b; color: #fff; border: none; border-radius: 6px; padding: 6px 12px;
                font-weight: 600; font-size: 0.8rem; cursor: pointer; }
            .admin-btn-perigo:disabled { opacity: .6; cursor: wait; }
            .admin-btn-principal { background: #8c533e; color: #fff; border: none; border-radius: 6px; padding: 8px 14px;
                font-weight: 600; font-size: 0.85rem; cursor: pointer; }
            .admin-fundo { position: fixed; inset: 0; background: rgba(0,0,0,.55); display: flex; align-items: center;
                justify-content: center; z-index: 10000; padding: 16px; }
            .admin-caixa { background: #fff; border-radius: 10px; width: 100%; max-width: 420px; max-height: 90vh;
                overflow: auto; padding: 22px; box-shadow: 0 10px 30px rgba(0,0,0,.25); color: #2d251e;
                font-family: inherit; }
            .admin-caixa h3 { margin: 0 0 4px; font-size: 1.15rem; }
            .admin-caixa dl { margin: 14px 0; display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; font-size: .9rem; }
            .admin-caixa dt { color: #6e655f; }
            .admin-caixa dd { margin: 0; word-break: break-word; }
            .admin-caixa .admin-msg { font-size: .85rem; margin: 8px 0; }
            .admin-caixa .admin-msg.erro { color: #c0392b; }
            .admin-acoes { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; margin-top: 14px; }
            .admin-btn-neutro { background: #e2d9cf; color: #2d251e; border: none; border-radius: 6px; padding: 8px 14px;
                font-weight: 600; font-size: 0.85rem; cursor: pointer; }
            .admin-aviso { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: #2d251e;
                color: #fff; padding: 10px 18px; border-radius: 8px; font-size: .9rem; z-index: 10001; }
        `;
        document.head.append(estilo);
    }

    // Aviso rápido no pé da tela (some sozinho).
    function avisar(texto) {
        injetarEstilos();
        const aviso = document.createElement("div");
        aviso.className = "admin-aviso";
        aviso.setAttribute("role", "status");
        aviso.textContent = texto;
        document.body.append(aviso);
        setTimeout(() => aviso.remove(), 3500);
    }

    // Formata "2026-08-31" como "31/08/2026" sem passar por Date (evita erro de fuso horário).
    function formatarData(iso) {
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
        return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
    }

    // Abre o perfil de um usuário (GET /users/:id) com o botão de excluir a conta.
    // `aoExcluir(id)` roda depois que a conta foi apagada, para a página remover o que era dessa pessoa.
    async function abrirPerfil(userId, nomeConhecido, aoExcluir) {
        if (!ehAdmin() || !userId) return;
        injetarEstilos();

        const fundo = document.createElement("div");
        fundo.className = "admin-fundo";
        const caixa = document.createElement("div");
        caixa.className = "admin-caixa";
        caixa.setAttribute("role", "dialog");
        caixa.setAttribute("aria-modal", "true");
        fundo.append(caixa);

        // Fecha o modal de perfil e solta o atalho da tecla Esc.
        const fechar = () => { fundo.remove(); document.removeEventListener("keydown", aoTeclar); };
        // Esc fecha o modal.
        const aoTeclar = (e) => { if (e.key === "Escape") fechar(); };
        fundo.addEventListener("click", (e) => { if (e.target === fundo) fechar(); });
        document.addEventListener("keydown", aoTeclar);

        const titulo = document.createElement("h3");
        titulo.textContent = nomeConhecido || "Perfil do usuário";
        const msg = document.createElement("p");
        msg.className = "admin-msg";
        msg.textContent = "Carregando perfil... (pode levar um pouco se o servidor estava inativo)";
        caixa.append(titulo, msg);
        document.body.append(fundo);

        let usuario;
        try {
            usuario = await chamar(`/users/${encodeURIComponent(userId)}`);
        } catch (erro) {
            msg.className = "admin-msg erro";
            msg.textContent = erro.status === 404
                ? "Esse usuário não existe mais (a conta já foi excluída)."
                : erro.message;
            const botao = document.createElement("button");
            botao.className = "admin-btn-neutro";
            botao.textContent = "Fechar";
            botao.onclick = fechar;
            const acoes = document.createElement("div");
            acoes.className = "admin-acoes";
            acoes.append(botao);
            caixa.append(acoes);
            return;
        }

        msg.remove();
        titulo.textContent = usuario.username || nomeConhecido || "Perfil do usuário";

        const campos = [
            ["E-mail", usuario.email],
            ["Telefone", usuario.telefone],
            ["Nascimento", formatarData(usuario.nascimento)],
            ["Cidade", [usuario.cidade, usuario.bairro].filter(Boolean).join(" - ")],
            ["Tipo de conta", usuario.admin ? "Administrador" : "Usuário comum"],
            ["Conta criada em", formatarData(usuario.created_at)]
        ];
        const lista = document.createElement("dl");
        campos.forEach(([rotulo, valor]) => {
            if (!valor) return;
            const dt = document.createElement("dt");
            dt.textContent = rotulo;
            const dd = document.createElement("dd");
            dd.textContent = valor; // textContent: nada vindo da API vira HTML
            lista.append(dt, dd);
        });
        caixa.append(lista);

        const acoes = document.createElement("div");
        acoes.className = "admin-acoes";
        const botaoFechar = document.createElement("button");
        botaoFechar.className = "admin-btn-neutro";
        botaoFechar.textContent = "Fechar";
        botaoFechar.onclick = fechar;
        acoes.append(botaoFechar);

        const ehEu = String(usuario.id) === String(localStorage.getItem("usuarioId"));
        if (usuario.admin || ehEu) {
            // A API também recusa: admin não exclui outro admin, e aqui não se exclui a própria conta.
            const nota = document.createElement("p");
            nota.className = "admin-msg";
            nota.textContent = ehEu ? "Esta é a sua conta."
                : "Contas de administrador não podem ser excluídas por aqui.";
            caixa.append(nota);
        } else {
            const excluir = document.createElement("button");
            excluir.className = "admin-btn-perigo";
            excluir.textContent = "Excluir usuário";
            excluir.onclick = async () => {
                const ok = confirm(`Excluir a conta de "${usuario.username}"?\n\n` +
                    "As mensagens, estantes, avaliações e anúncios dessa pessoa também serão apagados. " +
                    "Isso não pode ser desfeito.");
                if (!ok) return;
                excluir.disabled = true;
                msgErro.textContent = "";
                try {
                    await chamar(`/users/${encodeURIComponent(usuario.id)}`, { method: "DELETE" });
                    fechar();
                    avisar(`Usuário "${usuario.username}" excluído.`);
                    if (typeof aoExcluir === "function") aoExcluir(usuario.id);
                } catch (erro) {
                    excluir.disabled = false;
                    msgErro.textContent = erro.message;
                }
            };
            acoes.prepend(excluir);
        }

        const msgErro = document.createElement("p");
        msgErro.className = "admin-msg erro";
        msgErro.setAttribute("role", "alert");
        caixa.append(msgErro, acoes);
    }

    // Nome de uma pessoa em HTML: para o admin vira botão que abre o perfil; para os demais, texto comum.
    // Os cliques são tratados por ativarCliques() (um ouvinte só por página).
    function nomeHtml(nome, userId) {
        if (ehAdmin() && userId) {
            return `<button type="button" class="admin-usuario" data-admin-uid="${esc(userId)}" data-admin-nome="${esc(nome)}" title="Ver perfil (administrador)">${esc(nome)}</button>`;
        }
        return esc(nome);
    }

    // Liga um ouvinte que abre o perfil quando o admin clica em qualquer .admin-usuario dentro de `container`.
    function ativarCliques(container, aoExcluir) {
        container.addEventListener("click", (e) => { // fase de captura: funciona mesmo dentro de modais que bloqueiam a propagação
            const alvo = e.target.closest("[data-admin-uid]");
            if (!alvo || !container.contains(alvo)) return;
            e.preventDefault();
            e.stopPropagation();
            abrirPerfil(alvo.dataset.adminUid, alvo.dataset.adminNome, aoExcluir);
        }, true);
    }

    // Os botões do admin usam estas classes, então os estilos entram assim que a página abre.
    document.addEventListener("DOMContentLoaded", injetarEstilos);

    window.Admin = { ehAdmin, esc, urlImagem, chamar, avisar, abrirPerfil, nomeHtml, ativarCliques };
})();
