# 04 - Segurança Moderna e OWASP (2025/2026)

> **META:** Segurança não é um "adicional", é o alicerce. A IA deve aplicar as diretrizes do **OWASP Top 10 (2025)** e as mitigações contra **Riscos de Aplicações Agênticas (2026)** em todo código gerado.

## 1. Gestão de Segredos (A Regra de Ouro)
- **NUNCA** escreva senhas, tokens, chaves de API ou URIs de banco de dados em texto claro no código.
- Use sempre variáveis de ambiente (`process.env.NOME_DA_CHAVE`).
- Se um arquivo `.env` precisar ser criado, crie apenas um `.env.example` com valores fictícios. Alertar o humano se detectar um `.env` sendo comitado.

```js
// ❌ BAD — segredo hardcoded no código
const dbUrl = "mongodb://admin:s3cret@prod-db.example.com:27017";
const apiKey = "sk-abc123def456";

// ✅ GOOD — segredo via variável de ambiente
const dbUrl = process.env.DATABASE_URL;
const apiKey = process.env.API_KEY;
// .env.example contém: DATABASE_URL=mongodb://localhost:27017/dev
```

## 2. OWASP Top 10 (Base 2025/2026)
Ao escrever APIs ou interfaces, aplique obrigatoriamente:
- **Broken Access Control & SSRF:** Nunca confie no input do usuário para acessar arquivos, URLs internas ou registros do banco de dados. Valide as permissões e o formato do dado na borda da aplicação (usando bibliotecas como Zod, Joi ou Pydantic).
- **Injection:** Use ORMs, Query Builders ou Prepared Statements. **Zero** concatenação de strings em SQL (`"SELECT * FROM users WHERE id = " + id` é terminantemente proibido).
- **Cadeia de Suprimentos (Supply Chain):** Não instale ou importe pacotes obscuros ou não listados nas dependências principais sem explícita autorização do usuário.

## 3. Defesa contra Riscos Agênticos (OWASP Agentic AI Risks)
Como você é um LLM operando em um ambiente de desenvolvimento:
- **Autonomia Limitada:** Não tome ações destrutivas (ex: `DROP TABLE`, `rm -rf /`, `git push --force`) sem pedir permissão explícita.
- **Uso Seguro de Ferramentas:** Verifique os argumentos de comandos shell rigorosamente antes de executá-los. Se um comando Bash incluir variáveis dinâmicas, garanta que elas estejam escapadas/em aspas duplas.
- **Isolamento de Estado:** Limpe o contexto de dados sensíveis entre tarefas. Não vaze dados de um arquivo de configuração para um log público.

## 4. Tratamento de Exceções Seguro
- Falhe de forma segura (Fail Securely).
- Em ambientes de produção, **nunca** retorne o Stack Trace completo para o cliente (Frontend). Retorne códigos HTTP padronizados e mensagens genéricas (ex: 500 Internal Server Error), enquanto loga o erro real internamente de forma estruturada.
