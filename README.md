# @afilimax/mercado-livre-scraper

[![NPM Version](https://img.shields.io/npm/v/@afilimax/mercado-livre-scraper.svg)](https://www.npmjs.com/package/@afilimax/mercado-livre-scraper)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

O `@afilimax/mercado-livre-scraper` é uma biblioteca TypeScript de alta performance e resiliência para busca e extração estruturada de dados de produtos do **Mercado Livre** (Mercado Libre), integrada ao ecossistema **Afilimax**.

Projetada para contornar desafios avançados de segurança e verificações de automação (*bot challenges* / CAPTCHA), a biblioteca utiliza navegação automatizada com `puppeteer-extra` e `puppeteer-extra-plugin-stealth`. Ela opera com uma estratégia dupla de extração: parsing nativo de dados estruturados Schema.org (`JSON-LD` / `@graph`) com fallback automático para seletores HTML modernos dos cards de produto (`.poly-card`).

---

## ✨ Principais Características

- **🛡️ Evasão Anti-Bot Avançada**: Integração nativa com `puppeteer-extra-plugin-stealth` e flags de navegador para contornar verificações dinâmicas e bloqueios do Mercado Livre.
- **⚡ Estratégia Dupla de Extração**:
  - **Primária (JSON-LD)**: Extração rápida e precisa de blocos estruturados Schema.org (`@type: Product`).
  - **Fallback (HTML Poly-Card)**: Extração resiliente via seletores dos cards modernos de listagem com cálculo de preços fracionados, centavos e descontos.
- **🔍 Retorno Padronizado**: Resultados entregues no formato universal `ScrapedProductPreview` do `@afilimax/core`.
- **🇧🇷 Focado no Mercado Livre Brasil**: Extração direcionada exclusivamente para o catálogo brasileiro (`mercadolivre.com.br`).
- **📦 100% TypeScript**: Tipagem estrita com autocompletar e validação de contratos.

---

## 🚀 Instalação

```bash
npm install @afilimax/mercado-livre-scraper
```

> [!IMPORTANT]
> Este pacote utiliza o `@afilimax/core` como dependência de par (*peer dependency*). Certifique-se de tê-lo instalado no seu projeto:
> ```bash
> npm install @afilimax/core
> ```

---

## 🛠️ Como Usar

### Exemplo Básico de Busca de Produtos

```typescript
import { MercadoLivreScraper } from "@afilimax/mercado-livre-scraper";

async function run() {
    // Inicializa o scraper
    const scraper = new MercadoLivreScraper();

    try {
        console.log("Pesquisando produtos...");

        const products = await scraper.searchProducts({
            query: "Echo Dot 5ª Geração",
            limit: 5
        });

        console.log(`Encontrados ${products.length} produtos:`);
        console.log(JSON.stringify(products, null, 2));
    } catch (error) {
        console.error("Erro na busca:", error);
    } finally {
        // Encerra a instância do navegador Puppeteer
        await scraper.close();
    }
}

run();
```

### Busca Paginada / Offset

```typescript
const page2Products = await scraper.searchProducts({
    query: "Smart TV 55",
    limit: 10,
    offset: 10 // Pula os primeiros 10 itens
});
```

---

## 📋 API Reference

### `MercadoLivreScraper`

#### `constructor(options?: MercadoLivreScraperOptions)`

Inicializa a instância do scraper para o Mercado Livre Brasil.

#### `searchProducts(options: MercadoLivreScraperSearchProductsOptions): Promise<ScrapedProductPreview[]>`

Realiza a busca de produtos na listagem do Mercado Livre Brasil e retorna uma lista padronizada.

| Parâmetro | Tipo | Padrão | Descrição |
| :--- | :--- | :--- | :--- |
| `query` | `string` | **Obrigatório** | Termo de pesquisa (ex: `"notebook i5"`). |
| `limit` | `number` | `20` | Quantidade máxima de itens a retornar. |
| `offset` | `number` | `0` | Deslocamento inicial para paginação. |

#### `close(): Promise<void>`

Fecha o navegador Puppeteer subjacente e libera recursos de memória.

---

## 🗃️ Estrutura do Objeto Retornado (`ScrapedProductPreview`)

```typescript
{
    marketplace: "mercado_livre",
    externalId: "MLB72297423",
    title: "Alexa Echo Dot 5ª Geração Preta Controle Por Movimento E Cor Branco",
    url: "https://www.mercadolivre.com.br/alexa-echo-dot-5-geracao-preta-controle-por-movimento-e-cor-branco/p/MLB72297423",
    thumbnail: "https://http2.mlstatic.com/D_NQ_NP_856189-MLA111682464874_062026-F.jpg",
    price: {
        value: 468.00,
        originalValue: null,
        currency: "BRL"
    },
    rating: {
        average: 4.9,
        totalReviews: 698
    },
    brand: "Amazon",
    scrapedAt: "2026-10-17T21:34:16.832Z"
}
```

---

## 🧪 Scripts do Projeto

- `npm run build`: Compila os arquivos TypeScript gerando a pasta `dist`.
- `npm run test`: Executa os testes automatizados com o Vitest.
- `npm run lint`: Valida as regras de linting com ESLint.
- `npm run format`: Formata o código com Prettier.

---

## 📄 Licença

Distribuído sob a licença **MIT**. Desenvolvido com ❤️ pelo ecossistema **Afilimax**.
