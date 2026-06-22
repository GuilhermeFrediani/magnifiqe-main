# 11 - Systematic Debugging (O Método de 4 Fases)

> **META:** Debugging não é tentativa e erro. É um processo científico. Use estas 4 fases rigorosamente para resolver qualquer bug no sistema, eliminando o achismo e os ciclos de alucinação.

## 1. ROOT CAUSE (Isolar o Sintoma)
- **Não altere o código ainda.**
- Colete as evidências: Qual o input exato? Qual o output atual? Qual era o esperado?
- Encontre a FRONTEIRA: O ponto exato do código onde o estado "correto" passa a ser "incorreto".
- Ferramentas recomendadas: Use o `debugger` (Node.js/Navegador) ou injete Logs Estruturados focados.

## 2. HYPOTHESIS (Levantar Hipóteses)
- Liste de 1 a 3 motivos possíveis para a falha antes de programar a solução.
- Avalie cada hipótese lendo a implementação das funções envolvidas (use a ferramenta `read` ou `smart_unfold`).
- Verifique se não é um dos suspeitos usuais:
  - Stale closures (no React).
  - Mutação de estado global acidental.
  - Race conditions em operações assíncronas (falta de `await`).
  - Inputs com tipagem mal validada na borda (`any`).

## 3. FIX (A Correção Cirúrgica)
- Proponha a menor mudança possível que resolve o problema (Minimal Diff).
- Não aproveite o bugfix para refatorar um módulo inteiro (evite inflar o escopo do PR).
- Certifique-se de que o fix respeita a Filosofia Caveman (`02-coding-standards.md`): o código deve continuar óbvio.

## 4. VERIFY (Verificação com Provas)
- **Provas Reais:** Rode a suíte de testes existente e verifique se ela passa.
- Escreva um novo teste de regressão que capture a falha antiga e prove que a correção funciona.
- Execute o `build-test-verify` para garantir que linter e tipos estão intactos.
- **GATE FUNCTION:** Siga as 5 etapas antes de afirmar que o bug foi corrigido (IDENTIFY -> RUN -> READ -> VERIFY -> CLAIM). Se o teste ainda falhar, volte à Fase 1.
