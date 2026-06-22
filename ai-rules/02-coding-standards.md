# 02 - Coding Standards (O Estilo Caveman)

> **META:** "Escreva código como um homem das cavernas que conhece os princípios SOLID". Inspirado no minimalismo brutalista, este padrão dita que o código deve ser óbvio, chato de tão simples, e sem abstrações "espertinhas" que ninguém entende seis meses depois.

## 1. A Filosofia Caveman
- **O Óbvio Supera o Inteligente:** Se você precisar escrever um comentário de três linhas para explicar uma linha de código "genial" (um one-liner de `reduce` com regex), o código é ruim. Desfaça e escreva um `for` loop clássico, burro e fácil de ler.
- **Evite Abstrações Prematuras:** Não crie uma Factory, um Builder e uma interface genérica para resolver um problema que um simples `if/else` ou switch resolve perfeitamente no momento. O código deve ser literal.
- **Nomenclatura Brutalista:** Nomes de variáveis e funções devem dizer exatamente o que fazem. 
  - Errado: `data`, `process()`, `handler`, `Manager`.
  - Certo: `userList`, `calculateTaxes()`, `handleUserSubmit`, `DatabaseConnection`.

```js
// ❌ BAD — nomes genéricos que não dizem nada
const data = fetch(url);
function process(item) { ... }
const handler = () => {};

// ✅ GOOD — nomes que explicam a intenção
const userList = fetchUsers(url);
function calculateTaxes(income) { ... }
const handleUserSubmit = (event) => {};
```

## 2. A Regra do Menor Esforço Mental
- O código deve caber na cabeça de um desenvolvedor júnior exausto às 3 da manhã.
- **Zero "Magic":** Não use metaprogramação pesada, reflexão (reflection), ou injeção de dependência mágica que esconde a origem da classe, a menos que o framework principal do projeto exija (ex: Angular, NestJS, Spring).
- **Sem Side Effects Ocultos (Efeitos Colaterais):** Uma função chamada `getUser()` não deve, sob nenhuma hipótese, atualizar a data do último login no banco de dados. Funções de GET devem apenas buscar (Query). Funções de atualização devem modificar (Command). CQS - Command Query Separation.

## 3. Estruturas Padrão e Simplicidade
- **Early Return (Bouncer Pattern):** Reduza o aninhamento. Valide as falhas no topo da função e retorne imediatamente. O caminho feliz (Happy Path) deve ser sempre o último bloco da função, sem estar aninhado em um `else`.

```js
// ❌ BAD — arrow code, aninhamento excessivo
function getUser(id) {
  if (id) {
    if (id > 0) {
      const user = db.find(id);
      if (user) {
        return user;
      } else {
        return null;
      }
    }
  }
}

// ✅ GOOD — early returns, happy path por último
function getUser(id) {
  if (!id) return null;
  if (id <= 0) return null;
  const user = db.find(id);
  return user ?? null;
}
```
- **imutabilidade Pragmática:** Sempre que possível, não modifique variáveis existentes. Crie novas variáveis. Use `const` (JS/TS), `val` (Java/Kotlin), `final` (Scala) por padrão. Use `let/var` apenas quando um loop ou acumulador for estritamente necessário (o que remete à regra 1).
- **Try/Catch Específico:** Não engula erros com catch genérico silencioso. Se você capturar uma exceção, trate a falha específica esperada.

## 4. Refatoração Cirúrgica (Small Diffs)
Como IA, você deve imitar o estilo Caveman ao fazer alterações:
- **Modificação Mínima Necessária:** Para corrigir um bug, altere o mínimo possível de linhas. Não aproveite um PR de bugfix para reescrever a arquitetura do módulo inteiro, a menos que o bug seja causado pela arquitetura (Rotten Foundation - leia `09-bad-patterns-halt.md`).
- **Se não está quebrado, não conserte (durante tarefas de feature):** Respeite o código existente ao seu redor, mesmo que ele não seja perfeitamente "Caveman". Mimetize o estilo do arquivo atual.
