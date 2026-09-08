// Função para alternar entre mostrar e ocultar o texto do campo de senha
function alternarVisibilidade(inputId) {
    const campo = document.getElementById(inputId); 
    if (campo.type === "password") { 
        campo.type = "text"; 
    } else { 
        campo.type = "password"; 
    }
}

// Função executada ao enviar o formulário de cadastro
function realizarCadastro(event) {
    event.preventDefault(); 

    const usuario = document.getElementById("cadUsuario").value.trim(); 
    const email = document.getElementById("cadEmail").value.trim();
    const dataNascStr = document.getElementById("cadNascimento").value; 
    const cpfStr = document.getElementById("cadCpf").value.trim(); 
    const telefone = document.getElementById("cadTelefone").value.trim();
    const senha = document.getElementById("cadSenha").value; 
    const confirmaSenha = document.getElementById("cadConfirmaSenha").value; 

    // 1. Validação de Idade (Entre 16 e 100 anos)
    const hoje = new Date();
    const nascimento = new Date(dataNascStr);
    let idade = hoje.getFullYear() - nascimento.getFullYear();
    const m = hoje.getMonth() - nascimento.getMonth();
    if (m < 0 || (m === 0 && hoje.getDate() < nascimento.getDate())) {
        idade--;
    }

    if (idade < 16) {
        alert("Desculpe, você precisa ter pelo menos 16 anos para se cadastrar na plataforma.");
        return;
    }
    if (idade > 100) {
        alert("Por favor, insira uma data de nascimento válida (idade máxima permitida: 100 anos).");
        return;
    }

    // 2. Validação de CPF utilizando a função externa do arquivo validarCPF.js
    if (typeof validarCPF === "function" && !validarCPF(cpfStr)) {
        alert("CPF inválido ou com tamanho incorreto. Certifique-se de digitar os 11 números corretamente.");
        return;
    }

    // 3. Validação: checa se as duas senhas fornecidas são exatamente iguais
    if (senha !== confirmaSenha) {
        alert("As senhas não coincidem. Por favor, tente novamente."); 
        return; 
    }

    // Criação do objeto com todos os dados do usuário para preencher o Perfil depois
    const dadosUsuario = {
        usuario: usuario,
        email: email,
        nascimento: dataNascStr,
        cpf: cpfStr,
        telefone: telefone,
        senha: senha
    };

    // Salva os dados completos do usuário logado no localStorage
    localStorage.setItem("usuarioLogado", JSON.stringify(dadosUsuario));
    localStorage.setItem("usuarioNome", usuario); // Mantido por compatibilidade com outros scripts
    localStorage.setItem("logado", "true"); 
    
    // Salva a mensagem no sessionStorage para exibição do popup na Home
    sessionStorage.setItem("mensagem", `Conta criada com sucesso! Bem-vindo(a), ${usuario}!`);

    // Redireciona o usuário recém-cadastrado direto para a página inicial
    window.location.href = "../index.html"; 
}