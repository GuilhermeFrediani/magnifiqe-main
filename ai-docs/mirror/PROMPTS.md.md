# PROMPTS.md

- kind: md
- lines: 237
- bytes: 6163

## Summary
Prompts: Stack Perfeita MCP Live — VERSÃO CONDENSADA

## Imports
- none

## Exports
- none

## Source
```md
# Prompts: Stack Perfeita MCP Live — VERSÃO CONDENSADA

Use estes prompts como atalhos prontos para Cursor, Windsurf, Claude Code, Copilot Chat ou qualquer IDE com MCP.

---

## 1. Prompt Inicial (CONDENSADO)

```text
Ative Stack Perfeita com deliberação adaptativa.

1. `activate_project()` → manifesto completo
2. `doctor_runtime_setup()` → diagnóstico
3. `get_model_profile("claude")` → perfil (ou gpt/gemini/glm/mimo)
4. `activate_role("implementer", model="claude")` → preset
5. `start_task_contract(...)` → contrato
6. `get_rules_bundle("index")` → regras
7. `get_project_state()` → estado

── Se tarefa complexa (arquitetura, migração, refactor, segurança, trade-offs, ambiguidade, multi-módulo) ──
- `run_council_auto(...)`
- Se modo deep: 5 bots → peer review → `synthesize_council(...)` → `assert_step_evidence(...)`

── Validação ──
- `auto_validate_output` antes do código final
- `dependency_validate` antes de imports
- `validate_response_style` antes de prose longa
- `compress_tool_output` se output grande
- Se falhar 2x → HALT
- Não invente APIs, arquivos ou consenso falso

→ Roteiro completo: `get_prompt_script("initial")`
```

---

## 2. Prompt de Retomada (CONDENSADO)

```text
Retome projeto com Stack Perfeita.

1. `activate_project()`
2. `doctor_runtime_setup()`
3. `get_project_state()`
4. `list_checkpoints()`
5. Se necessário: `resume_task()`
6. `activate_role(...)`
7. `start_task_contract(...)`
8. Leia só regra necessária

── Se tarefa complexa ──
- `get_council_session()` → ver sessões
- Se não existir: `run_council_auto(...)`
- Complete posições, revisões → `synthesize_council(...)`

── Validação ──
- Continue do último passo validado
- `assert_step_evidence(...)` → novas evidências
- `auto_validate_output` → valide código
- `dependency_validate` → valide imports
- Se mesmo erro 2x → HALT

→ Roteiro completo: `get_prompt_script("resume")`
```

---

## 3. Prompt Anti-Loop (CONDENSADO)

```text
Reforce modo Stack Perfeita.

- Modo conciso
- `get_project_state()` → recarregue estado
- Leia só regra necessária
- `get_council_session()` → decisão estrutural em aberto
- `detect_output_dedup` → output repetido
- `ttsr_check_output` → regras TTSR
- `auto_validate_output` → valide código
- `dependency_validate` → valide imports
- `validate_response_style` → valide prosa
- `assert_step_evidence(...)` → registre prova
- Não invente, preserve conflitos
- Continue do último passo provado
- Se mesmo erro 2x → HALT
```

---

## 4. Prompt Council Complexo (CONDENSADO)

```text
Ative deliberação Council real.

1. `activate_project()`
2. `doctor_runtime_setup()`
3. `activate_role("architect", model="claude")`
4. `start_task_contract(...)`
5. `run_council_deep(...)`

── Execução ──
- `get_council_execution_prompt(...)` para etapas
- 5 posições: contrarian, first_principles, expansionist, outsider, executor
- `record_council_review(...)` → peer review
- `synthesize_council(...)`

── Síntese ──
Preservar: consensus, disagreements, discarded ideas, risk ranking, next step, confidence, evidence missing

── Pós-Síntese ──
- `assert_step_evidence(...)` → conclusão
- `groundedness_score` → verificação
- Implementação e validação
```

---

## 5. Prompt Caveman (CONDENSADO)

```text
CAVEMAN MODE: ACTIVE.

- Zero tokens de excitação
- Sem filler, sem narração
- Frases curtas, precisão técnica
- `validate_response_style(..., mode="caveman")` se crescer
- `compress_tool_output` se precisar comprimir
- Council: consenso, conflito, próximo passo, confiança
- `validate_caveman_output` → enforce
```

---

## 6. Prompt Arquitetura Modular (CONDENSADO)

```text
Ative modo Arquitetura Modular.

PRINCÍPIOS:
1. Alicerces firmes desde início
2. Um componente = um arquivo = uma responsabilidade
3. Tokens globais primeiro
4. Zero código morto

FRONTEND:
1. styles/global.css → design tokens
2. styles/index.css → entry point
3. Arquivos por componente
4. HTML semântico
5. Flexbox/Grid, mobile-first

BACKEND:
1. controllers/, services/, repositories/, utils/
2. Controllers só orquestram
3. Services processam regras
4. Repositories queries
5. Utils funções puras
6. Error handling centralizado
7. Config via env vars

ANTI-COMPLEXIDADE:
1. Arquivos: 10-300 linhas
2. Funções: 3-30 linhas
3. Zero código morto
4. Dependências: nativo > leve > pesada
5. Máximo 3 níveis de pastas

VALIDAÇÃO:
- `smart_read` → estrutura existente
- `detect_hallucination` → validar paths
- `verify_file_sync` → confirmar writes
- `auto_validate_output` → chain completa
```

---

## 7. Chamada MCP para IDEs

```json
{
  "mcpServers": {
    "stack-perfeita": {
      "command": "npx",
      "args": ["stack-perfeita-mcp", "--project-root", ".", "--rules-dir", "./ai-rules"]
    }
  }
}
```

### Fallback com regras empacotadas
```json
{
  "mcpServers": {
    "stack-perfeita": {
      "command": "npx",
      "args": ["stack-perfeita-mcp", "--project-root", "."]
    }
  }
}
```

---

## 8. Prompt Lean para IDEs (CONDENSADO)

```text
STACK PERFEITA — LEAN IDE MODE

1. `activate_project()`
2. `doctor_runtime_setup()`
3. `activate_role(...)`
4. `start_task_contract(...)`
5. Leia só compact-index, bundle-index e regra necessária
6. Se tarefa estrutural: `run_council_auto(...)`
7. `assert_step_evidence(...)` → registre prova
8. `auto_validate_output` → antes do código final
9. `dependency_validate` → antes de imports
10. `validate_response_style(..., mode="caveman")` se resposta crescer
11. Se falhar 2x igual → HALT
12. Roteiro completo: `get_prompt_script("initial")`
```

---

## 9. Atalhos Rápidos

| Ação | Comando |
|------|---------|
| Ativação completa | `get_prompt_script("initial")` |
| Retomada | `get_prompt_script("resume")` |
| Anti-loop | `get_prompt_script("anti_loop")` |
| Council | `get_prompt_script("council")` |
| Caveman | `get_prompt_script("caveman")` |
| Config IDE | `get_prompt_script("ide_config")` |
| IDE Lean | `get_prompt_script("ide_lean")` |
| Tudo | `get_prompt_script("all")` |

```
