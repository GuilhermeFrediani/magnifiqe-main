# ai-rules/15-modular-backend.md

- kind: md
- lines: 128
- bytes: 4689

## Summary
15 - Arquitetura Modular BackEnd (Serviços Organizados e Escaláveis)

## Imports
- none

## Exports
- none

## Source
```md
# 15 - Arquitetura Modular BackEnd (Serviços Organizados e Escaláveis)

> **META:** O Backend é a fundação da casa. Se os serviços estão bagunçados, qualquer reforma quebra tudo. Esta regra impõe separação de responsabilidades: controllers orquestram, services executam, repositories acessam dados, utils compartilham lógica pura.

## 1. A Regra dos 4 Níveis (Controllers → Services → Repositories → Utils)

**Controllers:** Só orquestram. Recebem request, validam, chamam service, retornam response. NUNCA contêm lógica de negócio.

**Services:** Lógica de negócio. Processam regras, transformam dados, orquestram chamadas.

**Repositories:** Acesso a dados. Só fazem queries/commits. NUNCA contêm lógica de negócio.

**Utils/Helpers:** Funções puras, sem side effects. Helpers, formatações, validações genéricas.

```js
// ❌ BAD — Controller com lógica de negócio
def create_user(request):
    data = request.json
    if not data.get('email'):
        return {'error': 'Email required'}, 400
    existing = db.query('SELECT * FROM users WHERE email = ?', data['email'])
    if existing:
        return {'error': 'Exists'}, 409
    hashed = bcrypt.hash(data['password'])
    user = db.insert('users', {**data, 'password': hashed})
    send_welcome_email(user['email'])
    return user, 201
```

```js
// ✅ GOOD — Controller limpo, lógica no service
@app.route('/users', methods=['POST'])
def create_user(request):
    payload = CreateUserSchema.parse(request.json)
    user = user_service.create(payload)
    return user, 201
```

## 2. Nomenclatura de Arquivos e Pastas

Estrutura padrão:

```
src/
  controllers/
    user_controller.js
    auth_controller.js
  services/
    user_service.js
    email_service.js
  repositories/
    user_repository.js
  models/
    user.js
  middlewares/
    auth.js
    validation.js
  utils/
    helpers.js
    constants.js
```

- Cada arquivo exporta UMA coisa principal (classe, função, ou objeto)
- Nomes no plural para pastas, singular para arquivos de modelo

## 3. Middlewares como Composição

- Middlewares são funções puras que compõem behavior
- Cada middleware faz UMA coisa: auth, rate-limit, logging, validation
- NUNCA coloque lógica de negócio em middlewares
- Use middleware chains para composição:

```js
app.post('/users', authMiddleware, validate(CreateUserSchema), userController.create)
```

## 4. Error Handling Centralizado

- Cada controller tem try/catch que delega para error handler central
- Services lançam erros específicos (NotFound, ValidationError, Conflict)
- Error handler traduz para HTTP status apropriado
- NUNCA retorne erros de banco diretamente ao cliente

## 5. Database: Conexões e Queries

- Conexões usam Pool (nunca abrir/conectar a cada request)
- Queries usam parameterized statements (nunca concatenação de strings)
- Transactions para operações que escrevem em múltiplas tabelas
- N+1 é proibido: use JOINs ou DataLoader

## 6. Configuração e Environment

- Variáveis de ambiente para config (nunca hardcoded)
- Arquivo .env.example com todas as vars documentadas
- Validação de env vars no startup (fail fast)
- Configuracoes tipadas: port, db_url, api_keys

## 7. Testes Organizados

- Um arquivo de teste para cada arquivo de source
- Testes de integração separados de unitários
- Mocks apenas quando necessário (não mocke o mundo)
- Cobertura mínima: 80% em services, 60% em controllers

## Checklist de Validação

- [ ] Controllers contêm apenas orquestração (receive → validate → delegate → respond)
- [ ] Services contêm toda a lógica de negócio
- [ ] Repositories contêm apenas queries/commits (zero business logic)
- [ ] Utils são funções puras sem side effects
- [ ] Arquivos seguem nomenclatura: plural para pastas, singular para models
- [ ] Cada arquivo exporta UMA coisa principal
- [ ] Middlewares são compostos e fazem UMA coisa cada
- [ ] Nenhuma lógica de negócio em middlewares
- [ ] Error handling centralizado (try/catch delega para handler)
- [ ] Services lançam erros específicos (NotFound, ValidationError, Conflict)
- [ ] Erros de banco NUNCA vão para o cliente
- [ ] Conexões usam Pool (não abrem por request)
- [ ] Queries usam parameterized statements
- [ ] Transactions para operações multi-tabela
- [ ] N+1 resolvido com JOINs ou DataLoader
- [ ] Variáveis de ambiente para configuração (zero hardcoded)
- [ ] .env.example existe e documenta todas as vars
- [ ] Env vars validadas no startup (fail fast)
- [ ] Um arquivo de teste por arquivo de source
- [ ] Testes de integração separados de unitários
- [ ] Cobertura mínima: 80% services, 60% controllers

```
