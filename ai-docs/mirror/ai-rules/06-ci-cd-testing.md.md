# ai-rules/06-ci-cd-testing.md

- kind: md
- lines: 51
- bytes: 2983

## Summary
06 - CI/CD Moderno: Pipeline como Produto (2026)

## Imports
- none

## Exports
- none

## Source
```md
# 06 - CI/CD Moderno: Pipeline como Produto (2026)

> **META:** Todo código escrito por um Agente IA só é considerado "Pronto" se não quebrar o pipeline automatizado. Trate o pipeline como a única fonte da verdade, não o "funciona na minha máquina".

## 1. O Pipeline é a Lei
A estrutura CI/CD deve ser tratada como um produto de software auditável: versionada no repositório, repetível e blindada com checks automáticos.
- **Sem Pipeline Quebrado:** O código sugerido pela IA ou escrito por ela DEVE respeitar os linters, formatações e tipagens que estarão no pipeline. 
- **Obrigatório:** Faça a IA usar a ferramenta `build-test-verify` sempre que possível antes de afirmar "O recurso está concluído".

```yaml
# ❌ BAD — pipeline sem gate, qualquer código entra
name: CI
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@master  # sem versão fixa — risco supply chain
      - run: npm install
      - run: npm test  # se falhar, continua mesmo assim

# ✅ GOOD — pipeline com gates de qualidade
name: CI
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4  # versão fixa
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test  # falha aqui = bloqueia o merge
```

## 2. Ferramentas e Infraestrutura Padrão
Se for requisitada a criação de workflows (ex: `.github/workflows/*.yml`), siga o ecossistema moderno:
- **GitHub Actions (CI):** A base principal de integração. Crie pipelines pequenos, rápidos, baseados em Matrix e Caching. Evite steps gigantes e ineficientes.
- **Argo CD / Kubernetes (CD):** Use padrões declarativos (GitOps). A configuração YAML ou Helm charts deve ser a fonte da verdade para o estado do cluster.
- Sempre versione e utilize tags de versões fixas para as Actions (ex: `actions/checkout@v4`), não utilize `master` ou `latest` devido a riscos de Supply Chain.

## 3. As 4 Frentes de Segurança Contínua
Nenhuma automação está completa sem as quatro frentes obrigatórias (CI Check):
1. **Lint e Typecheck:** (`npm run lint`, `tsc --noEmit`, `ruff`, etc.) falhas de build bloqueiam commits.
2. **SAST (Static Application Security Testing):** Integração com Semgrep, CodeQL ou similar. Código com hardcoded secrets ou injeção detectada não passa.
3. **Dependabot / Dependências Seguras:** Manter bibliotecas com versões fixas em arquivos de lock (ex: `pnpm-lock.yaml`, `poetry.lock`).
4. **Testes e Coverage:** Código de negócios novo gerado pela IA obrigatoriamente deve vir acompanhado de teste unitário correspondente (Jest, Pytest, Go Test).

## 4. Rollback Seguro
Qualquer alteração na infraestrutura ou script de deploy DEVE considerar o caminho inverso. A IA não proporá scripts destrutivos ou irreversíveis para o deploy em produção. A automação deve permitir promoção controlada por ambiente (Dev -> Staging -> Prod) e rollbacks confiáveis.

```
