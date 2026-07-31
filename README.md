# @afilimax/mercado-livre-scraper

[![NPM Version](https://img.shields.io/npm/v/@afilimax/mercado-livre-scraper.svg)](https://www.npmjs.com/package/@afilimax/mercado-livre-scraper)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

O `@afilimax/mercado-livre-scraper` é uma biblioteca de alta performance e resiliência para busca e extração de dados de produtos do **Mercado Livre** (Mercado Libre), integrada ao ecossistema **Afilimax**.

Projetada para contornar desafios de segurança avançados e verificações de automação (*bot challenges* / `gz-account-verification`), a biblioteca utiliza navegação automatizada via `puppeteer-extra` com `puppeteer-extra-plugin-stealth`, extraindo dados padronizados via parsing de blocos `JSON-LD` (`@graph`).

---

## ✨ Principais Características

- **🛡️ Evasão de Anti-Bot de Nível Avançado**: Equipado nativamente com `puppeteer-extra-plugin-stealth`, contornando os desafios dinâmicos de verificação do Mercado Livre.
- **⚡ Extração Estruturada via JSON-LD**: Parser nativo de dados estruturados Schema.org (`@type: Product` e `@graph`), garantindo máxima precisão em títulos, preços, thumbnails, avaliações e marcas.
- **🔍 Busca Padronizada**: Retorna resultados no formato padronizado `ScrapedProductPreview` do `@afilimax/core`.
- **🌎 Suporte Multi-Região (Site ID)**: Suporta diferentes regiões do Mercado Livre via `siteId` (ex: `MLB` para Brasil, `MLA` para Argentina, `MLM` para México).
- **📦 Tipagem TypeScript**: 100% escrito em TypeScript com autocompletar e tipos rigorosos.

---

## 🚀 Instalação

```bash
npm install @afilimax/mercado-livre-scraper
```

> [!IMPORTANT]
> Este pacote requer `@afilimax/core` como dependência de par (*peer dependency*).

---

## 🛠️ Como Usar

### Exemplo Básico de Busca de Produtos

```typescript
import { MercadoLivreScraper } from "@afilimax/mercado-livre-scraper";

async function run() {
    // Inicializa o scraper (padrão para Brasil - MLB)
    const scraper = new MercadoLivreScraper({
        siteId: "MLB"
    });

    try {
        console.log("Pesquisando produtos no Mercado Livre...");

        const products = await scraper.searchProducts({
            query: "Echo Dot 5ª Geração",
            limit: 10
        });

        console.log(`Encontrados ${products.length} produtos:`);
        console.log(JSON.stringify(products, null, 2));
    } catch (error) {
        console.error("Erro ao pesquisar produtos:", error);
    } finally {
        // Sempre feche a instância do navegador ao finalizar
        await scraper.close();
    }
}

run();
```

---

## 📋 API Reference

### `MercadoLivreScraper`

#### `constructor(options?: MercadoLivreScraperOptions)`

| Opção | Tipo | Padrão | Descrição |
| :--- | :--- | :--- | :--- |
| `siteId` | `string` | `"MLB"` | Identificador do site/país (`MLB` = Brasil, `MLA` = Argentina, `MLM` = México). |

#### `searchProducts(options: MercadoLivreScraperSearchProductsOptions): Promise<ScrapedProductPreview[]>`

Realiza a busca de produtos no Mercado Livre e retorna um array de previews padronizados.

| Parâmetro | Tipo | Padrão | Descrição |
| :--- | :--- | :--- | :--- |
| `query` | `string` | **Obrigatório** | Termo de busca (ex: `"notebook i5"`). |
| `limit` | `number` | `20` | Quantidade máxima de resultados a retornar. |
| `offset` | `number` | `0` | Deslocamento para paginação de resultados. |

#### `close(): Promise<void>`

Encerra a instância do navegador headless Puppeteer. Deve ser chamado para liberar recursos.

---

## 🗃️ Estrutura de Dados Retornada (`ScrapedProductPreview`)

Cada item retornado pelo método `searchProducts` segue a interface do `@afilimax/core`:

```typescript
{
    marketplace: "mercado_livre",
    externalId: "MLB46024018",
    title: "Alexa Amazon Echo Dot 5a Geração Com Assistente Virtual Casa Bivolt Cor Preto",
    url: "https://www.mercadolivre.com.br/alexa-amazon-echo-dot-5a-geracao-com-assistente-virtual-casa-bivolt-cor-preto/p/MLB46024018",
    thumbnail: "http://http2.mlstatic.com/D_900823-MLA96122146197_102025-C.jpg",
    price: {
        value: 509.00,
        originalValue: null,
        currency: "BRL"
    },
    rating: {
        average: 4.9,
        totalReviews: 1054
    },
    brand: "Amazon",
    scrapedAt: "2026-07-31T19:38:37.755Z"
}
```

---

## 🧪 Desenvolvimento e Testes

### Scripts Disponíveis

- `npm run build`: Compila o código TypeScript para a pasta `dist`.
- `npm run test`: Executa a suíte de testes unitários com Vitest.
- `npm run format`: Formata os arquivos com Prettier.
- `npm run lint`: Verifica e corrige regras de linting com ESLint.

---

## 📄 Licença

Distribuído sob a licença MIT. Produzido com ❤️ pela equipe **Afilimax**.
