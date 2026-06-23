# 19 - Fullstack Architecture Rule (Modular Construction Standard)

> **META:** Enforced separation of concerns like building a house with specialized professionals. Every project MUST follow this structure. This is LAW, not suggestion. The IDE/CLI/IA MUST build projects in this modular format.

## Reasoning

Each file name must say what it does without opening it.
Each layer only talks to its neighbor layer — never skip layers.

---

## Frontend Rules

### HTML
- Semantic tags only: `nav`, `header`, `main`, `footer`, `section`, `article`
- No inline styles, no `style` attributes
- Minimum classes — prefer element selectors scoped to section file
- Meaningful `alt` on content images, empty `alt=""` on decorative ones
- Order in `<head>`: meta charset, meta viewport, title, fonts preconnect, stylesheet

### CSS
- `/styles` folder — one file per section
- `global.css` is the single source of truth for variables and reset
- `index.css` is the entry point — only `@import` statements, global first
- Never hardcode colors, fonts or sizes — always use custom properties
- Always prefer shorthand properties
- No duplicate rules, no dead code

**Structure:**
```
styles/
├── global.css     → reset, :root variables, base (body, a)
├── nav.css        → only navigation styles
├── header.css     → only header styles
├── main.css       → only main content styles
├── footer.css     → only footer styles
└── index.css      → only @import statements
```

### JavaScript
- `/scripts` folder — one file per feature or responsibility
- `main.js` as entry point only
- Never manipulate styles directly — toggle CSS classes instead
- `const` by default, `let` when needed, never `var`
- Small functions, descriptive names, single responsibility
- No `console.log` in production

**Structure:**
```
scripts/
├── main.js        → entry point, only initialization
├── api.js         → all fetch/axios calls isolated here
└── ui.js          → DOM manipulation, class toggling
```

---

## Backend Rules

### Structure
```
src/
├── routes/        → endpoint definition only, no logic
├── controllers/   → request/response handling only
├── services/      → business logic, no DB access
├── repositories/  → all DB queries isolated here
├── models/        → entity/schema definitions
├── middlewares/   → auth, validation, error handling
├── config/        → env vars, DB connection
└── utils/         → shared helpers
```

### Code Rules
- One responsibility per file — strict layer separation
- No hardcoded values — always `process.env`
- Centralized error handler middleware — no scattered `try/catch`
- Input validation at route/middleware layer only
- Small functions, descriptive names
- No `console.log` — use structured logger
- API responses always: `{ data, error, status }`

### Request Flow
```
route → controller → service → repository → model → database
  ↑         ↑            ↑          ↑
 only URL  request/    business   query
          response     logic     isolated
```

Each layer only talks to its neighbor. Controller never accesses database directly.

---

## Database Rules

- Every schema change via migration file, never manual `ALTER`
- Seeds separate from migrations
- Always parameterized queries — never string concatenation
- Naming: `NNN_action_table.js` (e.g., `001_create_users_table.js`)

**Structure:**
```
database/
├── migrations/
│   └── 001_create_users_table.js
├── seeds/
│   └── users.seed.js
└── schema.sql      → reference snapshot (optional)
```

---

## Project Rules

- `.env.example` committed, `.env` in `.gitignore`
- README with setup, env vars, and folder structure
- All dependencies declared in `package.json` only
- UI libraries never mixed into `/styles`

---

## Debugging Principle

Because each layer is isolated, a bug should be traceable to exactly one file:

| Symptom | Where to look |
|---------|---------------|
| Wrong data in database | `repositories/` |
| Wrong business logic | `services/` |
| Wrong API response | `controllers/` |
| Route not found | `routes/` |
| Style broken | `styles/[section].css` |
| Button not working | `scripts/ui.js` |
| API connection error | `scripts/api.js` |

**Never fix a bug by adding logic to the wrong layer "to make it work fast".**

---

## Mandatory Enforcement

The IDE/CLI/IA MUST:
1. Create projects in this modular format from the start
2. Reject requests to create monolithic files when modular structure applies
3. Enforce layer separation — no shortcuts
4. Use this structure even for small projects (scales down, never out)

**This is not optional. This is LAW.**
