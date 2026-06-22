# ai-rules/07-frontend-semantic.md

- kind: md
- lines: 56
- bytes: 3799

## Summary
07 - Frontend Semântico e Acessibilidade (2026)

## Imports
- none

## Exports
- none

## Source
```md
# 07 - Frontend Semântico e Acessibilidade (2026)

> **META:** Esqueça a "sopa de divs". A web moderna e os algoritmos de SEO e Leitores de Tela exigem estruturação de conteúdo rica, hierarquizada e CSS eficiente. Componentes puramente visuais não são desculpa para HTML ruim.

## 1. A Base: HTML Semântico (A Regra do Ouro do Frontend)
Sempre que estruturar o Layout, você **DEVE** utilizar as tags apropriadas para a intenção do bloco:
- Use `<header>` e `<footer>` para topo e rodapé (do documento inteiro ou de artigos isolados).
- Use `<nav>` exclusivamente para listas de links de navegação.
- Use `<main>` para o conteúdo central e único da página.
- Use `<article>` para conteúdos autossuficientes e redistribuíveis (ex: cards de post, produtos, comentários).
- Use `<section>` para agrupar conteúdo logicamente relacionado que, em geral, possua um cabeçalho (`<h2>`-`<h6>`).
- Use `<aside>` para conteúdos indiretamente relacionados (sidebars, pull quotes).
- **PROIBIDO:** Usar `<div>` e `<span>` indiscriminadamente como primeira opção, a menos que o agrupamento não tenha valor semântico e seja puramente para aplicação de estilo ou flexbox.

```html
<!-- ❌ BAD — sopa de divs, zero semântica -->
<div class="top">
  <div class="menu">
    <div class="item">Home</div>
    <div class="item">About</div>
  </div>
</div>
<div class="content">...</div>
<div class="bottom">© 2024</div>

<!-- ✅ GOOD — HTML semântico, acessível, indexável -->
<header>
  <nav>
    <ul>
      <li><a href="/">Home</a></li>
      <li><a href="/about">About</a></li>
    </ul>
  </nav>
</header>
<main>...</main>
<footer>© 2024</footer>
```

## 2. Acessibilidade Agressiva (a11y)
Se a IA construir a interface de forma semântica, a maior parte do trabalho a11y estará feito nativamente.
- Imagens (`<img>` ou `<svg>`): Se possuírem significado visual importante, exigem obrigatoriamente um atributo `alt="descrição"`. Se forem puramente decorativas, use `alt=""` ou `aria-hidden="true"`.
- Formulários: Sempre associe `<label>` ao seu respectivo `<input>` (com o atributo `for` / `id` correspondente).
- Navegação por Teclado: Não remova os `outlines` de focus de links ou botões sem fornecer uma estilização equivalente visível no estado `:focus-visible`.
- Botões e Interações: Ações de clique devem sempre ser feitas com a tag `<button>` ou `<a href>`, NUNCA adicione `onClick` solto em uma `<div>`.

## 3. CSS Moderno: Flexbox, Grid e Variáveis
Mantenha a arquitetura CSS (mesmo usando Tailwind, Styled-Components ou Vanilla CSS) alinhada com as melhores práticas de mercado (2026):
- **Flexbox e Grid (Layout 1D e 2D):** A abordagem primária para organizar layouts complexos. Evite ao máximo o uso de floats ou margens e paddings hardcoded exagerados (ex: `margin-left: 200px`) para empurrar o conteúdo, a menos que absolutamente necessário.
- **Variáveis CSS (Custom Properties):** Use o conceito de Design Tokens. Se for sugerir estilos raw, proponha o uso de variáveis no `:root` para cor, tipografia e espaçamento, garantindo facilidade de suporte a temas dinâmicos (Dark/Light).
- **Semântica no Estilo:** Não misture lógica de negócios com convenções de estilo na nomenclatura das classes (CSS Modules ou classes genéricas).

## 4. Otimização de Performance e Core Web Vitals
- Assegure carregamento eficiente de fontes (com `font-display: swap`).
- Sugira e aplique a tag `<picture>` ou formatos web modernos (WebP, AVIF) associados ao carregamento `loading="lazy"` para imagens abaixo da dobra (off-screen).
- O Frontend não pode quebrar os padrões de "Largest Contentful Paint" com imagens gigantes não redimensionadas, ou "Cumulative Layout Shift" injetando blocos no topo sem altura previamente definida no CSS.

```
