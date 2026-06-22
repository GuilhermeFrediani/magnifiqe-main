# ai-rules/14-modular-frontend.md

- kind: md
- lines: 196
- bytes: 6205

## Summary
14 - Arquitetura Modular FrontEnd (CSS e HTML Organizados)

## Imports
- none

## Exports
- none

## Source
```md
# 14 - Arquitetura Modular FrontEnd (CSS e HTML Organizados)

> **META:** A casa precisa de alicerces firmes. CSS bagunçado é como fiação elétrica exposta — funciona até o dia que pega fogo. Esta regra impõe organização modular: tokens globais, componentes isolados, entry point limpo.

## 1. A Regra do Entry Point (index.css)
Todo projeto **DEVE** ter um arquivo de entrada CSS (`index.css` ou `style.css`) que importa todos os módulos. **NUNCA** inclua estilos inline no HTML além de variáveis CSS essenciais. A ordem de importação segue a hierarquia visual: **global → layout → componentes → utilities**.

```css
/* ✅ GOOD — entry point limpo, ordem hierárquica */
@import url(global.css);
@import url(layout.css);
@import url(nav.css);
@import url(header.css);
@import url(main.css);
@import url(footer.css);
```

```css
/* ❌ BAD — tudo em um arquivo gigante */
* { margin: 0; padding: 0; box-sizing: border-box; }
header { padding: 20px; }
nav { display: flex; }
footer { background: #333; }
/* + 500 mais linhas */
```

## 2. Design Tokens (global.css)
Todo projeto **DEVE** ter um `global.css` com variáveis CSS no `:root`. Tokens incluem: cores, tipografia, espaçamento, breakpoints, sombras. **NUNCA** use cores hardcoded nos componentes (ex: `color: #333` é **PROIBIDO**). Use sempre `var(--nome-da-variavel)`.

```css
/* ✅ GOOD — tokens centralizados */
:root {
  --brand-color: #EF5F4C;
  --background-color: #FFFFFF;
  --surface-color: #F5F5F5;
  --text-color-primary: #313131;
  --text-color-secondary: #6C6C6C;
  --font-family: 'Poppins', sans-serif;
  --text-lg: bold 32px/125% var(--font-family);
  --text: 16px/1.5 var(--font-family);
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 32px;
}
```

```css
/* ❌ BAD — cores hardcoded espalhadas */
.card {
  background: #F5F5F5;
  color: #313131;
  padding: 16px;
}
```

```css
/* ✅ GOOD — usando tokens */
.card {
  background: var(--surface-color);
  color: var(--text-color-primary);
  padding: var(--spacing-md);
}
```

## 3. Componentes Isolados (Um Componente = Um Arquivo)
Cada componente visual **DEVE** ter seu próprio arquivo CSS. O nome do arquivo espelha o elemento HTML: `nav.css`, `header.css`, `footer.css`, `card.css`. **NUNCA** misture estilos de componentes diferentes no mesmo arquivo. Cada arquivo CSS é auto-contido: só estilos daquele componente.

```
✅ GOOD — estrutura organizada
styles/
├── global.css        # Tokens e reset
├── index.css         # Entry point com imports
├── layout.css        # Grid/flex do layout principal
├── nav.css           # Estilos da navegação
├── header.css        # Estilos do header
├── main.css          # Estilos do conteúdo principal
├── card.css          # Estilos dos cards
└── footer.css        # Estilos do footer
```

```
❌ BAD — tudo misturado
styles/
└── style.css         # 800 linhas de tudo junto
```

## 4. HTML Semântico como Base
Antes de escrever qualquer CSS, o HTML **DEVE** usar tags semânticas: `<header>`, `<nav>`, `<main>`, `<article>`, `<section>`, `<aside>`, `<footer>`. Classes CSS usam BEM ou naming claro: `.card`, `.card__title`, `.card--featured`. **PROIBIDO:** classes como `div-container`, `div-wrapper`, `div-content`.

```html
<!-- ❌ BAD — semântica zero, classes genéricas -->
<div class="top">
  <div class="container">
    <div class="menu-item">Home</div>
  </div>
</div>
<div class="content-wrapper">...</div>

<!-- ✅ GOOD — semântico, BEM, acessível -->
<header class="header">
  <nav class="nav">
    <ul class="nav__list">
      <li class="nav__item"><a href="/" class="nav__link">Home</a></li>
    </ul>
  </nav>
</header>
<main class="main">...</main>
```

## 5. Layout com Flexbox/Grid, Sem Floats
Layouts 1D usam **Flexbox**. Layouts 2D usam **Grid**. Floats são **PROIBIDOS** para layout (só para envolvimento de texto se necessário). **NUNCA** use `margin-left: 200px` para posicionar algo — use flexbox/grid.

```css
/* ✅ GOOD — Flexbox para 1D */
.nav__list {
  display: flex;
  gap: var(--spacing-md);
}

/* ✅ GOOD — Grid para 2D */
.layout {
  display: grid;
  grid-template-columns: 250px 1fr;
  gap: var(--spacing-lg);
}

/* ❌ BAD — float para layout */
.sidebar {
  float: left;
  width: 250px;
}
.content {
  margin-left: 260px;
}
```

## 6. Responsividade com Media Queries Organizadas
**Mobile-first**: estilos base são mobile, media queries adicionam desktop. Breakpoints ficam no `global.css` ou em um `_breakpoints.css` separado. **NUNCA** repita media queries no mesmo componente — uma vez por arquivo no final.

```css
/* ✅ GOOD — mobile-first, media query no final do componente */
.card {
  padding: var(--spacing-sm);
  font-size: 14px;
}

@media (min-width: 768px) {
  .card {
    padding: var(--spacing-md);
    font-size: 16px;
  }
}
```

```css
/* ❌ BAD — desktop-first, media queries repetidas */
.card {
  padding: 32px;
  font-size: 16px;
}

@media (max-width: 768px) {
  .card {
    padding: 16px;
  }
}

@media (max-width: 768px) { /* DUPLICADA! */
  .card {
    font-size: 14px;
  }
}
```

## 7. Arquivos CSS que NÃO devem existir
- `style.css` gigante com tudo misturado (**VIOLAÇÃO**)
- Inline styles no HTML (**VIOLAÇÃO** exceto para dynamic values)
- `!important` em qualquer lugar (**VIOLAÇÃO**)
- CSS modules desnecessários (ex: `.hide`, `.show`, `.flex` — use utilitários do framework)

## Checklist de Validação

Antes de submeter código, verifique:

- [ ] `index.css` existe e importa todos os módulos na ordem correta
- [ ] `global.css` define todas as variáveis CSS no `:root`
- [ ] Nenhuma cor hardcoded aparece em arquivos de componentes
- [ ] Cada componente visual tem seu próprio arquivo CSS
- [ ] HTML usa tags semânticas (`header`, `nav`, `main`, `footer`, etc.)
- [ ] Classes seguem BEM ou naming claro (sem `div-*`)
- [ ] Layouts usam Flexbox (1D) ou Grid (2D), sem floats
- [ ] Media queries são mobile-first e não duplicadas
- [ ] Nenhum `!important` no código
- [ ] Nenhum inline style no HTML (exceto dynamic values)
- [ ] Arquivos de componentes são auto-contidos (só seus próprios estilos)

```
