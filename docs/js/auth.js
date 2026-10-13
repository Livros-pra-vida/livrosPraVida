// js/auth.js - Executado em todas as páginas para controle de acesso
document.addEventListener("DOMContentLoaded", function () {
    atualizarMenuNavegacao();
    protegerAcoesRestritas();
});

// 1. Atualiza o menu superior baseado no estado de login
function atualizarMenuNavegacao() {
    const isLogado = localStorage.getItem("logado") === "true";
    const authContainer = document.getElementById("authMenu");

    if (!authContainer) return;

    if (isLogado) {
        authContainer.innerHTML = `
            <a href="src/MeuPerfil.html" class="active">Meu Perfil</a>
            <a href="#" onclick="realizarLogout()" class="btn-sair-top">Sair</a>
        `;
    } else {
        authContainer.innerHTML = `
            <a href="src/Login.html" class="btn-login">Entrar</a>
            <a href="src/Cadastro.html" class="btn-cadastro">Cadastrar</a>
        `;
    }
}

// 2. Trava ações de compra, troca, doação e chat para visitantes
function protegerAcoesRestritas() {
    const isLogado = localStorage.getItem("logado") === "true";
    const botoesRestritos = document.querySelectorAll(".btn-negociar, .btn-chat-direct, .btn-assinar");

    botoesRestritos.forEach(botao => {
        botao.addEventListener("click", function (event) {
            if (!isLogado) {
                event.preventDefault();
                const confirmar = confirm(
                    "Você precisa estar conectado para negociar livros, assinar o clube ou acessar o chat.\n\nDeseja ir para a página de Login agora?"
                );
                if (confirmar) {
                    window.location.href = "src/Login.html";
                }
            }
        });
    });
}

// 3. Encerra a sessão
function realizarLogout() {
    localStorage.removeItem("logado");
    window.location.href = "../index.html";
}