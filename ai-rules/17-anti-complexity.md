# 17 - Anti-Complexidade (Código Limpo Não Tem Peso)

> **META:** "Código desnecessário é como paredes internas que bloqueiam a luz. Cada linha que não contribui para o objetivo final é peso morto. Esta regra impõe minimalismo inteligente: poucos arquivos, funções pequenas, zero código morto."

## 1. A Regra do Arquivo Mínimo
- Cada arquivo DEVE ter entre 10 e 300 linhas
- Se passar de 300 linhas, divida em módulos menores
- Se tiver menos de 10 linhas, considere se é necessário como arquivo separado
- NUNCA crie arquivos de "util" genérico — divida por domínio

```js
// ❌ BAD — utils.js — 800 linhas de tudo misturado
export function formatDate(d) { ... }
export function validateEmail(e) { ... }
export function calculateDiscount(p, q) { ... }
export function formatCurrency(v) { ... }
export function hashPassword(p) { ... }
export function generateId() { ... }
// ... +50 mais funções

// ✅ GOOD — arquivos separados por domínio
// date-utils.js — só datas
export function formatDate(d) { ... }
export function parseDate(s) { ... }

// validation-utils.js — só validação
export function validateEmail(e) { ... }
export function validatePassword(p) { ... }

// pricing-utils.js — só precificação
export function calculateDiscount(p, q) { ... }
export function formatCurrency(v) { ... }
```

## 2. A Regra da Função Mínima
- Funções DEVEM ter entre 3 e 30 linhas
- Se maior que 30 linhas, divida em funções auxiliares
- Uma função faz UMA coisa (Single Responsibility)
- Nome da função descreve a ação completa

```js
// ❌ BAD — função gigante que faz tudo
async function processOrder(order) {
  // 80 linhas de validação, cálculo, banco, email...
}

// ✅ GOOD — funções pequenas e claras
async function processOrder(order) {
  const validated = validateOrder(order);
  const total = calculateTotal(validated);
  const saved = await saveOrder(validated, total);
  await sendConfirmation(saved);
  return saved;
}
```

## 3. Código Morto É Veneno
- Comentários de código antigo: DELETAR (use git para histórico)
- Variáveis declaradas mas não usadas: DELETAR
- Imports não utilizados: DELETAR
- Funções nunca chamadas: DELETAR
- NUNCA comente código — delete e recrie do git se necessário

## 4. Dependências: Menos É Mais
- Antes de adicionar uma dependência, verifique se o que ela faz cabe em 20 linhas
- NUNCA adicione dependências para coisas triviais (ex: lodash para debounce)
- Cada dependência é manutenção potencial — minimize
- Preferido: código nativo > dependência leve > dependência pesada

## 5. Estrutura de Pastas: Menos Camadas
- Máximo 3 níveis de profundidade na estrutura de pastas
- Se precisa de mais, o domínio precisa ser reavaliado

```bash
# ❌ BAD — 6 níveis de profundidade
src/features/auth/controllers/handlers/validators/schemas/...

# ✅ GOOD — 2 níveis, organizado por domínio
src/auth/
  controllers.js
  service.js
  validators.js
```

## 6. Refatoração Contínua
- Quando encontrar código que poderia ser mais simples, simplifique
- Não aceite "funciona assim" como justificativa para código ruim
- Refatore em commits separados (não misture com features)
- Antes de refatorar, garanta que testes existem cobrindo o comportamento atual

## 7. O Teste do Copiloto
- Se um assistente de IA não consegue entender o código em 3 segundos, ele é complexo demais
- Código claro = código que qualquer dev entende rápido
- Se precisa de muitos comentários para explicar, o código precisa de reescrita

---

## Checklist Anti-Complexidade

- [ ] Arquivos com 10-300 linhas?
- [ ] Funções com 3-30 linhas?
- [ ] Código morto removido?
- [ ] Imports desnecessários removidos?
- [ ] Dependências triviais evitadas?
- [ ] Estrutura de pastas ≤3 níveis?
- [ ] Código compreensível em 3 segundos?
