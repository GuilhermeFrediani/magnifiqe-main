# Histórico de Alterações

Todas as mudanças notáveis neste projeto são documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/),
e o projeto adere ao [Semantic Versioning](https://semver.org/lang/pt-BR/).

---

## [4.8.0] - 2026-06-15

### Adicionado
- `NODE_BUILTINS` consolidado em `config.js` como `Set` para resolução de importações nativas do Node.
- `parseSkillFrontmatter` extraído para `helpers.js` como função reutilizável para parsing de YAML frontmatter em arquivos `SKILL.md`.
- Rate limiting aplicado a todas as ferramentas MCP via `rate-limiter.js` (janela de 60s, máximo de 20 chamadas por ferramenta).

### Corrigido
- `.gitattributes` atualizado para normalização correta de binários e line endings.
- Testes de ativação (`activation.test.js`) melhorados com cobertura de edge cases.

### Removido
- Artefatos obsoletos removidos: `AGENTS.md` e patchs de review anteriores.

---

## [4.7.0] - 2026-06-14

### Adicionado
- **Council Live runtime** (`council-live.js`): orquestração model-agnóstica com três modos de execução (`simple`, `deep`, `auto`).
- Contratos JSON para saída normalizada do Council.
- Ferramentas MCP adicionadas: `run_council_simple`, `run_council_deep`, `run_council_auto`, `get_council_execution_prompt`, `normalize_council_json`.
- Regra `13-live-council-runtime.md` e mapeamento de tópicos correspondente.
- Perfis de modelo (`profiles.js`): ajuste fino de comportamento e verbosidade para Claude, GPT e Gemini.
- Compacção de estado (`state-compaction.js`): `compact_logs`, `compact_diff`, `compact_conversation_state`, `promote_summary_to_checkpoint`.
- Documentação AI-first expandida: bundles `council-runtime`, `runtime-core`, `integration`, `testing-validation` e espelho completo em `ai-docs/mirror/`.
- Testes: `council-live.test.js`, `state-compaction.test.js`.

---

## [4.6.0] - 2026-06-10

### Adicionado
- **Resolução de dependências** (`dependency-resolution.js`): workspaces, resolução de paths, aliases e exports de pacotes.
- Ferramenta MCP `dependency_validate` expandida com suporte a bare imports, `tsconfig` paths, Node builtins e aliases `~/`.
- **Leitura de código aprimorada** (`code-reading.js`): reescrita completa com parsing AST, modos `auto/outline/full/symbol`.
- `smart_outline` e `smart_unfold` atualizados para parsing AST com fallback regex.
- Testes: `dependency-resolution.test.js`, `code-reading-phase2.test.js`.

---

## [4.5.0] - 2026-06-10

### Adicionado
- **Sistema de Skills** (`skills.js`): `list_skills` e `get_skill` como ferramentas MCP para descoberta e execução de playbooks de tarefas.
- Skills são arquivos `SKILL.md` com frontmatter YAML em `.claude/skills/`.
- **Bundle de regras** com 14 módulos temáticos (`ai-rules/00-13`), cobrindo workflow, segurança, debug, frontend, backend e comportamento LLM.
- Perfis de modelo expansíveis com configuração por provedor.
- Ferramentas MCP adicionadas: `activate_role`, `start_task_contract`, `assert_step_evidence`.
- Funções de roles e task-runtime para orquestração de ciclo de trabalho.
- Suporte a `.windsurfrules` para IDE Windsurf.
- Testes: `skills.test.js`, `roles.test.js`, `task-runtime.test.js`.

---

## [4.0.0] - 2026-06-06

### Adicionado
- **Validação AST** (`validators.js`): análise de risco com scoring 0-100 (PASS/WARN/HALT) via `acorn-loose`.
- **Compactação de contexto** (`compaction.js`): redução inteligente de logs e conversas para economia de tokens.
- **Perfis de modelo** (`profiles.js`): configuração de comportamento por modelo LLM.
- **Ativação de projeto** (`activation.js`): `activate_project` com manifesto e fingerprint do projeto.
- `smart_read` com modos `auto/outline/full/symbol`.
- Ferramenta `doctor_runtime_setup` com config portátil e config resolvida para diagnóstico.
- Ferramenta `get_prompt_script` para injeção de prompts operacionais.
- Setup enxuto para IDEs (`setup:ide:lean`) com `opencode.json` otimizado.
- 24 ferramentas MCP registradas, 104 testes em 15 módulos.

---

## [3.0.0] - 2026-06-06

### Adicionado
- **Persistência de estado** (`project-state.js`): 4 ferramentas MCP — `get_project_state`, `save_project_state`, `checkpoint_task`, `resume_task`.
- Estado do projeto persistido em `.claude/project_state.json` com 8 seções (objetivo, decisões, riscos, etc.).
- Deep-clone em checkpoints para prevenir bugs de referência compartilhada.
- Prompt de State Recovery adicionado ao `PROMPTS.md`.
- Linguagem ritual suavizada: "CAVEMAN ULTRA" → Terseness Adaptativa.
- 80 testes em 20 suítes (16 novos testes de project-state).

---

## [2.0.0] - 2026-06-06

### Adicionado
- **Arquitetura modular**: refactorização do monolito `index.js` em 11 módulos sob `src/`.
- Módulos: `config`, `validators`, `code-reading`, `commands`, `helpers`, `memory`, `rate-limiter`, `resources`, `rules`, `skills`.
- Suporte a Python nos padrões de código ruim (`BAD_PATTERNS`): `empty-except`, `broad-except`, `print-debug`, `todo-py`.
- Detecção de processos órfãos via heartbeat `ppid` e proteção do stdout do MCP.
- Fix de bug `get_rules` (dead code) e condição de corrida em `saveMemory`.
- Setup assistido via CLI (`stack-perfeita init`).
- 64 testes em 7 arquivos com `node:test` (zero dependências externas).
- Bundle `ai-rules/` com 12+ módulos de regras temáticas.
- `.claude/skills/` com 5 skills: `build-test-verify`, `core-conventions`, `create-pull-request`, `git-commit`, `self-review-checklist`.
- Integração IDE: `.cursorrules`, `copilot-instructions.md`, `.github/copilot-instructions.md`.

---

## [1.0.0] - 2026-06-06

### Adicionado
- Versão inicial do stack-perfeita-mcp.
- Servidor MCP via stdio com ferramentas básicas de validação.
- Validação de código com regex e patterns.
- Ferramentas: `validate_bad_code`, `get_rules`, `get_prompt`, `save_memory`.
- `PROMPTS.md` com prompts operacionais para agentes.
- Suporte a Cursor, VS Code e clientes MCP compatíveis.
