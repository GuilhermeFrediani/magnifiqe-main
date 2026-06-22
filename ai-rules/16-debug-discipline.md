# 16 - Disciplina de Debug (Encontre o Problema Antes de Consertar)

> **META:** Debug não é adivinhação. Antes de escrever uma linha de correção, você DEVE entender o problema. Esta regra impõe um processo disciplinado: reproduzir → isolar → entender → corrigir → validar.

## 1. O Processo de Debug em 5 Passos
1. **Reproduzir**: Consegue reproduzir o bug comandando? Se não, não pode corrigir.
2. **Isolar**: Em qual arquivo, função, ou linha o problema ocorre? Use console.log estratégicos ou debugger.
3. **Entender**: POR QUE acontece? Não é só O QUE acontece. A causa raiz importa.
4. **Corrigir**: Altere o mínimo de código necessário. Não reescreva o módulo inteiro.
5. **Validar**: O bug sumiu? Testes passam? Não quebrou algo novo?

## 2. Console.log É Ferramenta, Não Lixo
- Use console.log para debug, MAS remova antes de commit
- Nunca deixe console.log em produção
- Use console.error para erros que precisam de rastreamento
- Use console.warn para warnings que não quebram mas indicam problema

**BAD:**
```js
function calculateTotal(items) {
  console.log('items:', items);  // ❌ DEBUG LIXO
  return items.reduce((sum, item) => sum + item.price, 0);
}
```

**GOOD:**
```js
function calculateTotal(items) {
  if (!Array.isArray(items)) throw new TypeError('items must be an array');
  return items.reduce((sum, item) => sum + item.price, 0);
}
```

## 3. Logging Estruturado em Produção
- Use logger com timestamp, level, e contexto
- Nunca logue dados sensíveis (senhas, tokens, PII)
- Logue erros com stack trace completo
- Logue operações críticas (criação de usuário, pagamento, delete)

## 4. Error Messages que Ajudam
- Mensagens de erro DEVEM dizer O QUE falhou e POR QUE
- BAD: "Error" / "Something went wrong" / "Failed"
- GOOD: "User not found: id=123 does not exist in users table"
- GOOD: "Validation failed: email is required and must be a valid format"

## 5. Não Engula Erros
- Try/catch genérico silencioso é CÓDIGO MORTO
- Se capturar, trate ou re-lance com contexto
- Nunca faça: `try { ... } catch (e) { }` // silencioso
- Sempre: `try { ... } catch (e) { logger.error('context', e); throw; }`

## 6. Debug de Performance
- Antes de otimizar, MEÇA. Use performance.now() ou profiling tools
- NUNCA otimize cedo demais (premature optimization)
- Identifique bottleneck antes de escrever cache/memo
- Métricas > feeling

## Checklist
- [ ] Bug reproduzido antes de tentar corrigir?
- [ ] Causa raiz identificada (não só o sintoma)?
- [ ] Console.log removido antes de commit?
- [ ] Erros tratados ou relançados com contexto?
- [ ] Mensagens de erro claras e úteis?
- [ ] Performance medidas antes de otimizar?
