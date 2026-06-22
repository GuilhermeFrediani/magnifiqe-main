# 08 - Arquitetura de Produção e Backend Semântico (2026)

> **META:** O Backend é a muralha do sistema. APIs frágeis, ORMs mal configurados e vazamentos de estado são proibidos. A IA deve construir rotas que funcionem em escala, sem gargalos.

## 1. APIs e Contratos Claros (Validation at the Edge)
- **Regra de Ouro:** Nunca confie no objeto que vem do cliente (`req.body`, `query params`).
- Todo payload de entrada (DTO) e saída deve ser tipado e validado usando bibliotecas de schemas rigorosas (Zod, Joi, Pydantic, Marshmallow).
- Não passe o objeto da requisição cru para a camada de serviços (ex: `service.createUser(req.body)`). Passe objetos destrinchados e validados (`{ email, name, role }`).

```js
// ❌ BAD — God Route: validação + lógica + persistência tudo junto
app.post("/users", async (req, res) => {
  if (!req.body.email) return res.status(400).send("Missing email");
  const exists = await db.user.findUnique({ where: { email: req.body.email } });
  if (exists) return res.status(409).send("Exists");
  const user = await db.user.create({ data: req.body });
  await emailService.sendWelcome(user.email);
  return res.json(user);
});

// ✅ GOOD — validação na borda, lógica no service, route só orquestra
app.post("/users", async (req, res) => {
  const payload = CreateUserSchema.parse(req.body); // Zod na borda
  const user = await userService.create(payload);     // lógica isolada
  return res.status(201).json(UserResponseSchema.parse(user));
});
```

## 2. Banco de Dados e Conexões
- **Conexões (Pooling):** Certifique-se de que conexões de banco de dados não sejam abertas a cada requisição (instanciar cliente no topo do arquivo ou usar um Pool global).
- **Transações (ACID):** Se um endpoint altera mais de uma tabela relacionada (ex: criar usuário + criar perfil associado), utilize `Transactions`. Nunca crie dados órfãos se a etapa B falhar.
- **N+1 Problem:** Ao buscar listas com relações, não faça um `loop` gerando dezenas de `SELECT`s. Use `JOINs` explícitos, `populate()`, `include` ou DataLoaders.

## 3. Serviços "Stateless" e Concorrência
- **O Backend é Sem Estado (Stateless):** Nunca armazene estado da requisição ou do usuário autenticado em variáveis globais da aplicação. Toda informação específica de um usuário deve vir de Tokens (JWT) validados a cada requisição ou Caches temporários (Redis) indexados.
- **Race Conditions (Condições de Corrida):** Ao atualizar saldos, estoque ou inventário, use locks no banco (Pessimistic ou Optimistic Locking) ou comandos atômicos (`UPDATE estoque SET qtd = qtd - 1 WHERE id = x AND qtd > 0`). Não faça um `SELECT` para ler a quantidade e depois um `UPDATE` baseando-se no valor lido anteriormente sem travamento.

## 4. Tratamento de Erros e Logs de Servidor (Error Translation)
- Não retorne erros do Banco de Dados (ex: Constraint Violation 1062) diretamente na resposta HTTP. O usuário e o frontend só devem saber que "Ocorreu um erro no cadastro".
- O Backend deve interceptar o erro na borda, traduzi-lo para uma mensagem "humana" com código HTTP apropriado (400, 401, 403, 404, 409) e logar a exceção crua com stack trace internamente (DataDog, Sentry, Pino).
