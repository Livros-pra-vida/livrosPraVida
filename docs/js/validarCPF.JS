function validarCPF(cpf) {
    // Remove qualquer caractere que não seja número (pontos, traços, espaços)
    cpf = cpf.replace(/\D/g, '');

    // Verifica se tem exatamente 11 dígitos
    if (cpf.length !== 11) {
        return false;
    }

    // Bloqueia CPFs com todos os números iguais (ex: 000.000.000-00, 111.111.111-11, etc.)
    if (/^(\d)\1+$/.test(cpf)) {
        return false;
    }

    // Validação do 1º dígito verificador
    let soma = 0;
    for (let i = 1; i <= 9; i++) {
        soma += parseInt(cpf.substring(i - 1, i)) * (11 - i);
    }
    let resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11) {
        resto = 0;
    }
    if (resto !== parseInt(cpf.substring(9, 10))) {
        return false;
    }

    // Validação do 2º dígito verificador
    soma = 0;
    for (let i = 1; i <= 10; i++) {
        soma += parseInt(cpf.substring(i - 1, i)) * (12 - i);
    }
    resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11) {
        resto = 0;
    }
    if (resto !== parseInt(cpf.substring(10, 11))) {
        return false;
    }

    return true; // Se passou em todas as regras, o CPF é verdadeiro!
}