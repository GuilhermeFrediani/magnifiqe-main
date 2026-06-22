# Sessão 2026-06-20 — Correções e Auditoria

## Estado Final
- **Testes:** 349 pass, 0 fail, 6 skip
- **Lint:** 0 erros, 4 warnings (_prefix)
- **Tools MCP:** 67 registrados, todos funcionais

## Correções Aplicadas

### Bugs Críticos
1. `\n` literal em caveman.js (3) + watchdog.js (1) → `\n` correto
2. phase1-tools.js: 4 tools mortos → registrados no index.js
3. doctor_runtime_setup: skills_exist válida → verifica SKILL.md

### Council Simplificação
1. council-live.js deletado (barrel re-export puro)
2. toTitleCaseBot → titleCaseBot unificado
3. REVIEW_VERDICTS definido em 1 lugar
4. 20 re-exports orfos removidos de council.js

### Limpeza
1. 6 arquivos orfãos deletados da raiz
2. .gitignore atualizado
3. 3 arquivos removidos do tracking
4. 12 imports não usados removidos de testes
5. skills.test.js: import corrigido, skip condition atualizada

### Novos Tests (58)
- test/watchdog.test.js (17 tests)
- test/caveman.test.js (17 tests)
- test/resources.test.js (11 tests)
- test/verification.test.js (8 tests)
- test/anti-hallucination.test.js (5 tests)

### Módulos com Teste
- Antes: 22/47 (47%)
- Depois: 27/47 (57%)

## Pendente (aceitável)
- Flaky test: run_council_auto (race condition)
- 4 warnings lint (_prefix convencional)
- 6 skips (skills disk + symlink)
