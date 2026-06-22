# Levantamento de Skills Importáveis — 3 Projetos → Magnifiqe

**Data:** 2026-06-20
**Fontes:** Anthropic-Cybersecurity-Skills (754 skills), Oh My Pi 16.1.3 (3 skills + 18 rules), NVIDIA Agent Skills (~200 skills)
**Alvo:** magnifiqe / stack-perfeita-mcp (55 tools, Node.js, ES modules)

---

## Estado Atual do Magnifiqe (55 tools)

| Categoria | Tools |
|-----------|-------|
| Rules & Skills | list_rules, get_rules, get_context, get_rules_bundle, list_skills, get_skill |
| Validation | validate_bad_code, validate_response_style, validate_git_commit, dependency_validate |
| Code Reading | smart_outline, smart_unfold, smart_read |
| Memory | save_observation, search_observations |
| State | get_project_state, save_project_state, checkpoint_task, list_checkpoints, resume_task |
| Compaction | compact_conversation_state, compact_logs, compact_diff, promote_summary_to_checkpoint |
| Activation | get_model_profile, activate_role, start_task_contract, activate_project, doctor_runtime_setup, get_prompt_script |
| Anti-Hallucination | verify_file_sync, detect_hallucination, groundedness_score, diff_since_last, run_test_and_report, auto_validate_output |
| Watchdog | detect_output_dedup, session_watchdog, session_health |
| Caveman | validate_caveman_output, caveman_budget |
| Compression | compress_tool_output, decompress_tool_output, compression_stats, compress_markdown, semantic_compress, classify_tokens |
| TTSR | ttsr_check_output, ttsr_stats |
| Learn | headroom_learn_run, headroom_learn_status |
| Prompt Standards | validate_prompt_standards, analyze_prompt |
| Commands | run_command |

---

## TOP 15 — Prioridade MÁXIMA (Alto Impacto + Esforço Baixo/Médio)

### 1. Detecção de Prompt Injection (Anthropic)
**Origem:** `detecting-ai-model-prompt-injection-attacks`
**O que faz:** Regex + heurística + classificador para detectar injeção de prompts em inputs de LLM
**Importabilidade:** ADAPT (port regex + heurística para JS)
**Esforço:** 1-2 dias
**Mapeia para:** Novo tool `detect_prompt_injection`, melhoria do `detect_hallucination`
**Por quê:** Magnifique detecta alucinação mas NÃO detecta prompt injection — lacuna crítica de segurança
**Ação:** Portar 25+ regex patterns + heurística (instruction density, special chars, language mixing)

### 2. Rega Frontmatter + TTSR Bucket System (Oh My Pi)
**Origem:** Rule system do OMP (18 builtin rules)
**O que faz:** Schema frontmatter para regras com condition/astCondition/scope/interruptMode + sistema de 3 tiers (TTSR, Always-apply, Rulebook)
**Importabilidade:** ADAPT
**Esforço:** 2-3 dias
**Mapeia para:** Extensão do sistema de 18 AI rules existente
**Por quê:** As rules atuais não têm trigger conditions nem scope limiting — ativarão em tempo real
**Ação:** Adotar schema frontmatter: `condition` (regex), `astCondition` (ast-grep), `scope` (tool tokens), `interruptMode`

### 3. Semantic Compression — 3 Deletion Tiers (Oh My Pi)
**Origem:** `.omp/skills/semantic-compression/SKILL.md`
**O que faz:** 3 tiers de deletação gramatical: Tier 1 (artigos, cópulas) → Tier 2 (auxiliares, pronomes) → Tier 3 (preposições restantes)
**Importabilidade:** DIRECT (copiar tiers para compress_tool_output)
**Esforço:** Horas
**Mapeia para:** `compress_tool_output`, `compress_markdown`, `semantic_compress`
**Por quê:** A compressão atual é baseada em tipo de conteúdo; falta compressão gramatical LLM-aware
**Ação:** Injetar 3 deletion tiers no pipeline CCR existente

### 4. Typosquatting Detection em npm (Anthropic)
**Origem:** `detecting-typosquatting-packages-in-npm-pypi`
**O que faz:** Levenshtein distance + metadata heuristics para detectar pacotes maliciosos
**Importabilidade:** DIRECT (port para JS — Levenshtein é trivial em JS)
**Esforço:** 1 dia
**Mapeia para:** Novo tool `detect_typosquat`, melhoria do `dependency_validate`
**Por quê:** Validação de dependências atual não verifica typosquatting
**Ação:** Portar scoring (Levenshtein, download count, publish recency, author mismatch)

### 5. System Prompts com RFC 2119 (Oh My Pi)
**Origem:** `.omp/skills/system-prompts/SKILL.md`
**O que faz:** Guia de authoring: NEVER/AVOID over MUST NOT/SHOULD NOT, structural tags, density rules, voice patterns
**Importabilidade:** DIRECT
**Esforço:** Horas
**Mapeia para:** Melhoria dos 18 AI rules existentes + prompt scripts
**Por quê:** Prompts atuais não seguem RFC 2119 consistently — gasta tokens desnecessários
**Ação:** Aplicar convenções RFC 2119 nos rules e prompts existentes

### 6. System Prompts — Structural Tags (Oh My Pi)
**Origem:** `.omp/skills/system-prompts/SKILL.md`
**O que faz:** Tags XML semânticas: `<critical>`, `<workflow>`, `<completeness>`, `<yielding>`, `<anti-patterns>`
**Importabilidade:** DIRECT
**Esforço:** Horas
**Mapeia para:** Prompt scripts, AI rules
**Por quê:** Tags estruturais melhoram a atención do LLM em prompts longos
**Ação:** Adotar tags nos prompts e rules existentes

### 7. Guardrail Pipeline Architecture (Anthropic)
**Origem:** `implementing-llm-guardrails-for-security`
**O que faz:** Pipeline input rails → output rails com injection detection, PII redaction, topic enforcement
**Importabilidade:** ADAPT
**Esforço:** 2-3 dias
**Mapeia para:** Novo tool `guardrail_pipeline`, extensão de `validate_response_style`
**Por quê:** Validação atual étool-by-tool; falta um pipeline centralizado
**Ação:** Criar pipeline: input validation → processing → output validation com rails configuráveis

### 8. Session Memory com Handoff (NVIDIA)
**Origem:** `nemo-rl-session-memory`
**O que faz:** Diretórios timestamped com session_state.md, timeline.md, files.md, handoff.md
**Importabilidade:** ADAPT
**Esforço:** 2-3 dias
**Mapeia para:** Extensão de `save_observation` / `search_observations`
**Por quê:** Memória atual é flat observations; falta handoff protocol para multi-session
**Ação:** Adicionar session_state schema + handoff protocol ao memory system

### 9. Failure Classification (NVIDIA)
**Origem:** `dynamo-troubleshoot`
**O que faz:** Classificação de falhas em 10+ buckets com evidence → signal → cause → next_command
**Importabilidade:** ADAPT
**Esforço:** 1-2 dias
**Mapeia para:** Extensão de `session_watchdog`, `session_health`
**Por quê:** Watchdog atual é reativo; falta framework de diagnóstico proativo
**Ação:** Criar failure classifier com structured output contract

### 10. API Schema Validation (Anthropic)
**Origem:** `implementing-api-schema-validation-security`
**O que faz:** OpenAPI/JSON Schema enforcement com `additionalProperties: false`, XSS/SQLi detection
**Importabilidade:** DIRECT (JSON Schema é nativo em JS)
**Esforço:** 1 dia
**Mapeia para:** `validate_bad_code`, `dependency_validate`
**Por quê:** Validação atual usa regex; falta JSON Schema validation para tool inputs
**Ação:** Portar padrões JSON Schema para validação de inputs MCP

---

## MÉDIA PRIORIDADE (Alto Impacto + Esforço Médio)

### 11. Tool Prompt Optimization (Oh My Pi)
**Origem:** `.omp/skills/tool-prompt-optimization/SKILL.md`
**O que faz:** Mede overlap schema-vs-prompt para podar descrições de tools
**Importabilidade:** ADAPT
**Esforço:** 1-2 dias
**Mapeia para:** Otimização das 55 tool descriptions existentes

### 12. Policy Generation com Taxonomy (NVIDIA)
**Origem:** `nemotron-policy-generator`
**O que faz:** Geração estruturada de políticas com taxonomy JSON + severity model
**Importabilidade:** ADAPT
**Esforço:** 2-3 dias
**Mapeia para:** Geração dinâmica de AI rules

### 13. Custom SAST Rules (Anthropic)
**Origem:** `implementing-semgrep-for-custom-sast-rules`
**O que faz:** YAML rules para AST pattern matching (SQLi, XSS, hardcoded secrets)
**Importabilidade:** ADAPT
**Esforço:** 2-3 dias
**Mapeia para:** `validate_bad_code`, `smart_read`

### 14. CI/CD Config Validation (Anthropic)
**Origem:** `securing-github-actions-workflows`
**O que faz:** SHA pinning, token minimization, script injection prevention
**Importabilidade:** DIRECT
**Esforço:** 1 dia
**Mapeia para:** Novo tool `validate_ci_config`

### 15. RAG Quality Evaluation (NVIDIA)
**Origem:** `rag-eval`
**O que faz:** Dataset contracts + RAGAS metrics (faithfulness, relevance, precision)
**Importabilidade:** ADAPT
**Esforço:** 2-3 dias
**Mapeia para:** Framework de avaliação para `detect_hallucination`, `groundedness_score`

---

## REFERÊNCIA (Padrões para Estudar)

| # | Skill | Projeto | Padrão Extraível |
|---|-------|---------|------------------|
| 16 | Review PRs | Oh My Pi | Classificação slop/superseded/worthy, scope discipline |
| 17 | Fix Issues | Oh My Pi | Reproduce-first, parallel fan-out, worktree isolation |
| 18 | Triage | Oh My Pi | Label taxonomy (priority/category/provider/platform) |
| 19 | Recipe YAML | NVIDIA | Config-driven execution com validation gates |
| 20 | Skill Card Generator | NVIDIA | 3-stage pipeline: discover → render → validate |
| 21 | Image Provenance | Anthropic | Supply chain verification com Cosign |
| 22 | HTTP Headers Audit | Anthropic | Security headers checklist (CSP, HSTS, cookies) |
| 23 | Policy as Code (OPA) | Anthropic | Declarative rule enforcement pattern |
| 24 | Todo Tool Design | Oh My Pi | Phased task management com verbatim addressing |
| 25 | Checkpoint/Rewind | Oh My Pi | Context window management para investigações longas |

---

## SCRIPTS REUTILIZÁVEIS

| Script | Projeto | Importabilidade | O que faz |
|--------|---------|----------------|-----------|
| `tools/validate-skill.py` | Anthropic | DIRECT | Valida SKILL.md frontmatter (292 lines, stdlib-only) |
| `discover_assets.py` | NVIDIA | REFERENCE | Descobre assets de skills |
| `render_card.py` | NVIDIA | REFERENCE | Renderiza governance cards |
| `agent.py` pattern | Anthropic | ADAPT | CLI com --input/--file/--mode/--output json |

---

## SCHEMAS REUTILIZÁVEIS

| Schema | Projeto | Uso no Magnifiqe |
|--------|---------|------------------|
| Rule Frontmatter (condition/astCondition/scope) | Oh My Pi | Ativar rules em tempo real |
| Failure Classification (class/evidence/signal/cause) | NVIDIA | Diagnóstico proativo |
| Session State (goal/plan/blockers/handoff) | NVIDIA | Multi-session continuity |
| Evaluation Dataset (question/ground_truth/contexts) | NVIDIA | Validação de anti-hallucination |
| Policy Taxonomy (category/severity/examples) | NVIDIA | Geração dinâmica de rules |

---

## ROADMAP DE IMPLEMENTAÇÃO

### Fase 1 — Quick Wins (1 semana)
1. Port regex prompt injection → `detect_prompt_injection` (Anthropic)
2. Port typosquatting detection → `detect_typosquat` (Anthropic)
3. Port semantic compression tiers → `compress_tool_output` (Oh My Pi)
4. Aplicar RFC 2119 + structural tags nos prompts (Oh My Pi)
5. Port JSON Schema validation → `validate_bad_code` (Anthropic)

### Fase 2 — Arquitetura (2 semanas)
1. Rule Frontmatter + TTSR Bucket System (Oh My Pi)
2. Guardrail Pipeline (Anthropic)
3. Session Memory + Handoff (NVIDIA)
4. Failure Classification (NVIDIA)
5. CI/CD Config Validation (Anthropic)

### Fase 3 — Validação (3 semanas)
1. Tool Prompt Optimization (Oh My Pi)
2. Policy Generation + Taxonomy (NVIDIA)
3. Custom SAST Rules (Anthropic)
4. RAG Quality Evaluation (NVIDIA)
5. Review PRs / Fix Issues / Triage commands (Oh My Pi)
