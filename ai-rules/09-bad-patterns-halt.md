# 09 - Fundações Podres e Padrões Ruins (Halt no Bad Code)

> **META:** Nenhuma IA (Cursor, OpenCode, Claude, Copilot) tem permissão de construir código novo sobre um código pré-existente ou recente que esteja corrompido, seja conceitualmente ou em sintaxe. 

## 1. O Princípio da Fundação Podre (Rotten Foundation Rule)
- Se você for solicitado a alterar a linha 100 de um arquivo, mas notar que a linha 50 contém um erro de lógica claro, uma tipagem ignorada (`any`) ou um padrão arquitetural falho (Bad Code):
  - **PARE IMEDIATAMENTE (HALT).**
  - **NÃO** escreva o código novo na linha 100.
  - Alerte o usuário: "Atenção: Base de código comprometida na linha 50. Precisamos refatorar antes de prosseguir."
  - Se você construir código novo sobre lógica quebrada, a dívida técnica multiplicará e causará bugs insidiosos.

## 2. O Que é "Bad Code" (Código Ruim - Proibido Reproduzir)
A IA está expressamente proibida de replicar, aceitar ou introduzir os seguintes padrões:
- **God Classes/Files:** Arquivos com mais de 300 linhas de código (a menos que a stack exija). Devem ser quebrados.
- **Side Effects Ocultos:** Funções que alteram estado global ou variáveis externas sem devolver nada.
- **Tipagem Preguiçosa:** Uso de `any` ou `as unknown` em TypeScript. Se não souber o tipo, infira o tipo correto de acordo com o contrato de dados.
- **Catch Vazio:** Engolir erros silenciosamente (`try { algo } catch (e) {}`). Exija um sistema de logging ou relance o erro formatado.
- **Sopa de If/Else (Arrow Code):** Estruturas extremamente aninhadas. A IA deve aplicar `Early Returns` (retornos antecipados) e `Guard Clauses`.

```js
// ❌ BAD — God Function: 80 linhas fazendo tudo
function handleRequest(data, db, cache, emailClient, logger) {
  // valida + persiste + envia email + loga — tudo misturado
  if (data.email) {
    if (data.name) {
      const user = db.create(data);
      if (user) {
        emailClient.send(user.email);
        logger.log("created");
        return user;
      }
    }
  }
}

// ✅ GOOD — cada função faz UMA coisa
function validateUser(data) { ... }       // ≤ 20 linhas
function persistUser(db, data) { ... }   // ≤ 20 linhas
function notifyUser(emailClient, user) { ... } // ≤ 10 linhas
function logEvent(logger, event) { ... } // ≤ 5 linhas
```

## 3. O Que é "Good Code" (Código Bom - O Padrão Ouro)
Sempre que codificar, você deve buscar este estado ideal:
- **Responsabilidade Única (SOLID):** Cada função/classe tem um propósito claro e explícito.
- **Testável:** Funções puras onde a mesma entrada sempre resulta na mesma saída, sem depender do estado da aplicação ou variáveis não documentadas.
- **Previsível:** Retornos e tipos imutáveis. Em caso de falha de validação, os erros são tratados na raiz (Fail Fast).

## 4. O Que é um "Loop de Alucinação" (O Comportamento a Evitar)
Um "Loop" acontece quando:
1. O LLM tenta corrigir um erro usando suposições (Achismo).
2. A solução falha.
3. O LLM propõe *outra* solução baseada na mesma suposição ou tentando alterar outra parte do código sem testar a fundo.
- **Para quebrar o Loop:** Pare e mude de ferramenta. Use o Linter, o Node Inspector (`debugger`) ou exija logar o estado das variáveis imediatamente. Tentar "codar" para fora de um bug é a definição de Alucinação.
