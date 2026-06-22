# 00 - Project Overview & Stack Manifest (The Domain Map)

> **META:** This file is the **Source of Truth** about the current ecosystem. The LLM should read this file to calibrate its language, frameworks, libraries, and architecture. **Never** suggest dependencies outside this scope without prior approval.

## 1. Tech Stack (Fill in according to your project)
- **Main Language:** [Ex: TypeScript 5.x / Python 3.12 / Go 1.22]
- **Frontend Framework:** [Ex: Next.js 14 (App Router) / React + Vite / Vue]
- **Backend Framework:** [Ex: NestJS / FastAPI / Express / Gin]
- **Database / ORM:** [Ex: PostgreSQL + Prisma / MongoDB + Mongoose / SQLAlchemy]
- **Tests:** [Ex: Jest + Testing Library / Pytest / Vitest]
- **Package Manager:** [Ex: pnpm / npm / uv / poetry]

## 2. Architecture Pattern
- **Style:** [Ex: Hexagonal (Ports & Adapters) / MVC / Feature-Sliced Design (FSD)]
- **Separation of Concerns:** 
  - Controllers/Routers: Only receive the request and validate input. No business logic.
  - Services/Use Cases: Contain pure business logic. No HTTP context (req/res).
  - Repositories/DAL: Only layer that talks to the Database or external APIs.

## 3. Naming Conventions
- **Files:** [Ex: kebab-case for files (`user-controller.ts`), PascalCase for React components (`Button.tsx`)]
- **Variables/Functions:** [Ex: camelCase]
- **Classes/Interfaces:** [Ex: PascalCase]

## 4. Environment Variables and Configuration (Setup)
- Does the project use strict `.env` validation? [Ex: Yes, via `zod` in `env.ts`]
- How to start the project locally: `[Dev command, ex: pnpm dev]`

## 5. MCP Tools Available (If Using Stack Perfeita MCP)
- **Rules access:** `list_rules`, `get_rules(topic, mode)`
- **Code validation:** `validate_bad_code(code)`, `validate_git_commit(message)`, `dependency_validate(path)`
- **Code reading:** `smart_outline(path)`, `smart_unfold(path, symbol_name)`
- **Skills:** `list_skills()`, `get_skill(name)`
- **Memory:** `save_observation(obs)`, `search_observations(query)`
- **Utilities:** `run_command(name, args)`, `compress_markdown(path)`

## 6. Context Engineering Strategy
- **Loading:** Rules are loaded once at session start via MCP resources, not re-read every turn.
- **Compaction:** When context fills up, use `compress_markdown` for long docs and summarize state into bullet points.
- **Recovery:** Use `save_observation`/`search_observations` to persist and retrieve architectural decisions across tasks.
- **Validation:** Delegate code validation to MCP tools instead of trying to verify mentally.
