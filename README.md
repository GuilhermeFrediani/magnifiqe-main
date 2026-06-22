# [Stack Perfeita MCP](https://github.com/GuilhermeFrediani/magnifiqe)

**MCP funcional para agentes de código.** Entrega runtime real com validação executável, checkpoints, compactação de contexto, leitura inteligente, Council estruturado com 5 bots + Chairman, runtime Council Live agnóstico a modelo e setup enxuto para IDEs. [Repositório](https://github.com/GuilhermeFrediani/magnifiqe)

[![Cursor](https://img.shields.io/badge/Cursor-Ready-purple)](https://cursor.com)
[![Windsurf](https://img.shields.io/badge/Windsurf-Ready-blue)](https://windsurf.com)
[![Claude Code](https://img.shields.io/badge/Claude_Code-Ready-orange)](https://claude.ai)
[![VS Code](https://img.shields.io/badge/VS_Code-Ready-blue)](https://code.visualstudio.com)

---

## O que esta revisão entrega

- MCP realmente executável, não só guia de boas práticas.
- Chamada robusta para IDEs com `--project-root .`.
- Setup **lean** para IDEs com menos contexto inicial e menor custo de tokens.
- Prompt pack operacional incorporado ao runtime via `PROMPTS.md` + tool `get_prompt_script`.
- `doctor_runtime_setup()` agora devolve config portátil para copiar e colar e também a config resolvida para diagnóstico.
- `opencode.json` reduzido para instruções essenciais.
- Bundles AI-first mantidos para leitura barata e modular.
- Testes, smoke test e docs AI-first integrados no fluxo de validação.

---

## Resposta curta

### O projeto é funcional?
Sim. O servidor MCP sobe por stdio, registra ferramentas reais, mantém estado local, executa Council, valida código, valida dependências, gera docs AI-first e possui cobertura de testes e smoke test. [Repositório](https://github.com/GuilhermeFrediani/magnifiqe)

### A chamada atual precisa correção?
**Sim, vale corrigir.** A forma antiga abaixo pode funcionar quando a IDE nasce exatamente na raiz do projeto, mas falha com mais frequência quando o `cwd` muda, quando há wrappers de execução ou quando o projeto é aberto por outra pasta de workspace.

```json
{
  "mcpServers": {
    "stack-perfeita": {
      "command": "npx",
      "args": ["stack-perfeita-mcp", "--rules-dir", "./ai-rules"]
    }
  }
}
```

A forma recomendada fixa explicitamente a raiz operacional do MCP:

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

Se você ainda não copiou `ai-rules/` para o projeto atual, use o fallback com regras empacotadas:

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

## Instalação

```bash
npm install
npm run docs:ai
```

### Execução local

```bash
npx stack-perfeita-mcp --project-root . --rules-dir ./ai-rules
```

### Fallback com regras empacotadas

```bash
npx stack-perfeita-mcp --project-root .
```

### Setup assistido

```bash
npm install -g stack-perfeita-mcp
stack-perfeita init
```

### Setup enxuto para IDEs

```bash
npm run setup:ide:lean
```

Isso gera arquivos de instrução mais curtos para IDEs e um `opencode.json` mais econômico em tokens.

---

## Scripts principais

```bash
npm test
npm run test:smoke:council
npm run setup:ide
npm run setup:ide:init
npm run setup:ide:lean
npm run docs:ai
npm run validate
npm start
npm run dev
```

---

## Configuração por IDE

### Cursor / VS Code / clientes MCP compatíveis

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

### Claude Code / Claude Desktop

```bash
claude mcp add stack-perfeita --command "npx stack-perfeita-mcp --project-root . --rules-dir ./ai-rules"
```

### OpenCode

O `opencode.json` padrão foi reduzido para as instruções mais úteis de boot. Para um preset ainda mais curto, use `examples/opencode.lean.json`.

### Exemplos prontos

- `examples/mcp.cursor.json`
- `examples/mcp.cursor.bundled-rules.json`
- `examples/opencode.lean.json`
- `examples/ide-lean.prompt.md`

---

## Prompt pack operacional

O roteiro que você usa para chamar o MCP agora está incorporado de três formas:

1. `PROMPTS.md` com os blocos atualizados.
2. `get_prompt_script(...)` para recuperar um prompt específico sem abrir o arquivo inteiro.
3. `setup:ide:lean` para gerar instruções enxutas em `.cursorrules`, `.windsurfrules` e `opencode.json`.

### Blocos disponíveis em `get_prompt_script(...)`

- `initial`
- `resume`
- `anti_loop`
- `council`
- `caveman`
- `ide_config`
- `ide_lean`
- `all`

---

## Ferramentas principais do MCP

### Regras
- `list_rules` — Lista todas as regras AI disponíveis no projeto.
- `get_rules` — Retorna o conteúdo de uma regra por tópico. Modo `summary` retorna descrição (~20 tokens); `full` retorna conteúdo completo.
- `get_context` — Retorna CONTEXT.md de um módulo/feature antes de editar arquivos nesse módulo.
- `get_rules_bundle` — Concatena todas as regras em ordem estável para cache de prompt. Modo `index` retorna nomes + descrições; `full` retorna tudo.

### Ativação
- `activate_project` — Monta manifesto completo do projeto (stack, rules, skills, state) em uma chamada. Use ao iniciar sessão.
- `doctor_runtime_setup` — Verifica setup, diretórios de rules, skills, AI docs e devolve config MCP portátil para copiar e colar.
- `get_prompt_script` — Retorna um prompt do PROMPTS.md pronto para uso. Seções: `initial`, `resume`, `anti_loop`, `council`, `caveman`, `ide_config`, `ide_lean`, `all`.

### Validação
- `validate_bad_code` — Verifica código contra padrões proibidos, complexidade, tamanho e aninhamento. Retorna score 0-100 com PASS/WARN/HALT.
- `validate_response_style` — Verifica se uma resposta contém tokens de excitação, hesitação ou prosa excessivamente verbosa.
- `validate_git_commit` — Valida mensagem de commit contra o padrão Conventional Commits.
- `dependency_validate` — Valida imports e referências: paths relativos, workspaces, package exports, aliases tsconfig/jsconfig/Vite e assets HTML.

### Leitura inteligente
- `smart_outline` — Extrai outline estrutural (funções, classes, métodos, tipos) com assinaturas via AST. Suporta JS/TS/Python.
- `smart_unfold` — Expande um símbolo específico (função, classe, método) retornando o corpo completo via AST.
- `smart_read` — Leitor inteligente: conteúdo completo para arquivos pequenos (<50 linhas), outline para maiores. Modos: `auto`, `outline`, `full`, `symbol`.
- `compress_markdown` — Compacta markdown in-memory (remove comments HTML, espaços extras, normaliza linhas vazias) sem alterar o arquivo no disco.

### Habilidades
- `list_skills` — Lista todas as skills disponíveis em `.claude/skills/`. Skills são playbooks de tarefa composáveis e descobertas.
- `get_skill` — Retorna o conteúdo completo de uma skill específica por nome ou diretório.

### Memória
- `save_observation` — Salva uma observação, aprendizado ou decisão arquitetural na memória persistente da sessão. Duplicatas são deduplicadas.
- `search_observations` — Busca observações salvas por palavra-chave.

### Estado do projeto
- `get_project_state` — Retorna o estado atual do projeto ou uma seção específica. Use antes de retomar trabalho ou fazer mudanças de risco.
- `save_project_state` — Atualiza uma seção do estado do projeto. Seções array são appendadas com dedupe; escalares são substituídos. Compaction automática no threshold.
- `checkpoint_task` — Cria snapshot rotulado do estado atual. Use antes de edits arriscados, refactors ou resets de contexto.
- `list_checkpoints` — Lista checkpoints salvos em ordem cronológica reversa com labels e timestamps.
- `resume_task` — Restaura estado do projeto a partir de um checkpoint. Omita label para o mais recente.

### Compactação
- `compact_conversation_state` — Salva um resumo estruturado da conversa em memória do projeto para liberar contexto.
- `compact_logs` — Extrai apenas erros e warnings de output de log, descartando ruído informativo.
- `compact_diff` — Resume um diff unificado mostrando apenas arquivos alterados, hunks de função e contagem de linhas.
- `promote_summary_to_checkpoint` — Promove o último resumo de compactação em um checkpoint formal com rollback.

### Perfil de modelo
- `get_model_profile` — Retorna orientação operacional para um provider ou alias de modelo. Cobertura: verbosidade, compaction, caching, strictness, capability flags.

### Papéis
- `activate_role` — Retorna preset de papel operacional adaptado ao perfil do modelo. Calibra verbosidade, retries, tool budget, gates e política de checkpoint.

### Runtime de tarefa
- `start_task_contract` — Cria ou atualiza contrato formal de tarefa com objetivo, inputs, outputs, non-goals, acceptance criteria, riscos e evidência mínima.
- `assert_step_evidence` — Registra evidência de nível de step com hipótese, evidência, ação de verificação e status. Evita afirmar progresso sem prova.

### Comandos
- `run_command` — Executa template de slash-command predefinido de `ai-rules/commands/`. Útil para prompts complexos repetitivos.

### Council estruturado
- `council_gate` — Avalia se uma tarefa merece deliberação do Council. Use antes de pagar custo de coordenação em trabalho simples.
- `start_council_session` — Cria sessão persistente do Council com briefs de 5 bots, fila de peer-review, regras de parada, rubrica de scoring e síntese do Chairman.
- `get_council_session` — Lista sessões do Council ou retorna uma sessão específica com contadores de progresso e fila de peer-review.
- `record_council_position` — Armazena ou atualiza posição de um bot na sessão. Exige claims estruturados para síntese auditável.
- `record_council_review` — Armazena um peer review entre bots. Auto-review é bloqueado. Reviews são upserted por par reviewer-target.
- `synthesize_council` — Executa síntese determinística do Council a partir de posições e reviews. Gera consenso, divergências, ideias descartadas e próximo passo recomendado.

### Council Live
- `run_council_simple` — Contrato de execução de chamada única, agnóstico a modelo, para trabalho de baixa latência.
- `run_council_deep` — Cria plano persistente do Council com prompts para 5 bots, ordem de peer-review, stage do Chairman e handoff I/O final.
- `run_council_auto` — Resolve automaticamente entre modo simple e deep, retornando o plano correto agnóstico a provider.
- `get_council_execution_prompt` — Retorna prompt de contrato estrito para um stage do Council Live: `bot_position`, `peer_review`, `chairman` ou `io_final`.
- `normalize_council_json` — Normaliza JSON ruidoso gerado por modelo para stages do Council Live. Remove fences, trailing commas e corrige tipos.

### Compressão e Performance
- `compress_tool_output` — Comprime output de ferramentas via pipeline CCR (Content-Detector → Cache-Aligner → CCR Hierarchy → Store). Detecta tipo de conteúdo e aplica nível de compressão apropriado.
- `decompress_tool_output` — Restaura output comprimido usando hash do sentinel. Recupera conteúdo original armazenado pelo pipeline CCR.
- `compression_stats` — Retorna estatísticas do pipeline de compressão: tamanho do store, estado do circuit breaker, detecções do cache aligner.

### TTSR (Time-Traveling Streamed Rules)
- `ttsr_check_output` — Verifica output contra regras TTSR registradas. Retorna HALT se violar alguma regra. Monitora outputs em tempo real.
- `ttsr_stats` — Retorna estatísticas do TTSR engine: número de regras, triggers, regras disparadas.

### Aprendizado
- `headroom_learn_run` — Executa ciclo de aprendizado manual: escaneia sessões .claude/, analisa padrões e escreve recomendações na memória da sessão.
- `headroom_learn_status` — Retorna status do trigger periódico: se o ciclo está ativo, se está rodando, último timestamp, total de execuções e último resultado.

### Verificação Anti-Alucinação
- `verify_file_sync` — Verifica que um arquivo no disco corresponde ao conteúdo esperado. Compara hash do arquivo com hash esperado. Retorna PASS/FAIL com evidência.
- `detect_hallucination` — Valida que paths de arquivos, imports e símbolos realmente existem no disco. Recebe array de claims e verifica cada uma. Retorna PASS/FAIL por claim.
- `groundedness_score` — Pontua o quão "grounded" uma resposta está em fatos verificáveis. Verifica referências a arquivos, claims de código e asserções de teste contra o filesystem. Retorna score 0-10.
- `diff_since_last` — Mostra o que mudou em um arquivo desde a última verificação. Compara hash atual com hash armazenado. Útil para rastrear mudanças incrementais.

### Monitoramento e Diagnóstico
- `detect_output_dedup` — Rastreia hashes de output e detecta outputs idênticos repetidos. Modos: `track` (registra e verifica), `check` (verifica sem registrar).
- `session_watchdog` — Monitora timing de chamadas de ferramentas e detecta loops potenciais ou operações travadas. Ações: `start`, `end`, `status`.
- `session_health` — Diagnóstico completo da saúde da sessão: estatísticas de rate limit, dedup, loop detection, memória e compressão.
- `run_test_and_report` — Executa comando de teste e reporta resultado. Útil para validação automática de código.
---

## Arquitetura resumida

```text
src/
  index.js                 # entrypoint MCP
  config.js                # resolução de paths, catálogos, padrões
  activation.js            # ativação, runtime doctor, prompt scripts
  validators.js            # validação executável de código/resposta/deps
  project-state.js         # estado, checkpoints, retomada
  compaction.js            # compactação de contexto
  council.js               # sessões, gate, peer review, síntese
  council-live.js          # simple/deep/auto + contratos JSON
  dependency-resolution.js # workspaces, paths, aliases, exports
  safety-guards.js         # rate limiting, dedup, loop detection, validation
  compression-orchestrator.js # pipeline CCR para compressão de outputs
  ttsr-manager.js          # Time-Traveling Streamed Rules para monitoramento
  learn-trigger.js         # ciclos de aprendizado periódicos e manuais
  anti-hallucination.js    # verificação de arquivos, detecção de alucinação
  verification.js          # file sync, hallucination detection, groundedness
  watchdog.js              # output dedup, session timing, test execution
  caveman.js               # output budget enforcement, auto-validation
  compression/             # pipeline CCR completo
    content-detector.js    # detecção de tipo de conteúdo
    cache-aligner.js       # alinhamento para cache de prompt
    ccr-hierarchy.js       # hierarquia de compressão
    store.js               # armazenamento de originais
    circuit-breaker.js     # circuit breaker para falhas
    thresholds.js          # thresholds de compressão
  ttsr/                    # Time-Traveling Streamed Rules
    ttsr-engine.js         # engine de regras
    halt-bridge.js         # bridge para interrupções
    rule-types.js          # tipos de regras
    settings.js            # configurações do TTSR
  learn/                   # módulo de aprendizado
    analyzer.js            # analisador de padrões
    writer.js              # escritor de recomendações
    scanner.js             # scanner de sessões
  observability/           # observabilidade
    metrics.js             # métricas do sistema
    logger.js              # logger estruturado

ai-rules/
  00-17 *.md              # regras modulares sob demanda
  commands/               # slash-commands predefinidos

ai-docs/
  compact-index.md        # entrada mais barata
  bundle-index.md         # entrada por tarefa
  bundles/                # contexto temático curto
  mirror/                 # espelho markdown dos arquivos
```

---

## Estratégia para reduzir tokens

1. Comece por `ai-docs/compact-index.md`.
2. Abra `ai-docs/bundle-index.md` antes de abrir arquivos brutos.
3. Use `examples/ide-lean.prompt.md` ou `npm run setup:ide:lean` em IDEs.
4. Use `get_prompt_script("initial")` ou `get_prompt_script("resume")` em vez de colar o prompt pack inteiro sempre.
5. Use `run_council_auto(...)` para não cair em modo deep à toa.
6. Só abra `src/...` quando `ai-docs` não bastar.
7. Use `compress_markdown` em docs grandes.
8. Use `compress_tool_output(...)` para comprimir outputs de ferramentas automaticamente via pipeline CCR.
9. Use `decompress_tool_output(...)` para recuperar outputs comprimidos quando necessário.
10. Verifique `compression_stats` para monitorar eficiência do pipeline de compressão.

### Evite
- carregar `README.md`, todas as regras e todo `src/` no mesmo contexto;
- usar Council deep em tarefa local ou mecânica;
- rodar com a chamada antiga sem `--project-root .`;
- tratar `PROMPTS.md` como documentação passiva em vez de fonte operacional.

---

## Melhorias aplicadas nesta revisão

- correção da chamada recomendada do MCP para IDEs;
- runtime doctor com config portátil e config resolvida;
- tool `get_prompt_script` para injetar os prompts atualizados no fluxo real;
- setup lean por script;
- `opencode.json` enxugado;
- smoke/e2e alinhados com a chamada robusta;
- exemplos extras para setup enxuto;
- README consolidado e sem instruções duplicadas.

---

## Validação recomendada antes de publicar

```bash
npm run validate
```

Esse comando executa testes, smoke test do Council e gera a camada AI-first em Markdown.

---

## Fonte

- Projeto original: [GuilhermeFrediani/magnifiqe](https://github.com/GuilhermeFrediani/magnifiqe)
