<a href="https://afilimax.net"><img src="https://raw.githubusercontent.com/Afilimax/.github/main/assets/npm-banner.svg" alt="Afilimax — Encontre a oferta. Gere o link. Divulgue sozinho." width="100%" /></a>

[![npm version](https://img.shields.io/npm/v/%40afilimax%2Fmercado-livre-scraper?logo=npm)](https://www.npmjs.com/package/@afilimax/mercado-livre-scraper)
[![npm downloads](https://img.shields.io/npm/dm/%40afilimax%2Fmercado-livre-scraper?logo=npm)](https://www.npmjs.com/package/@afilimax/mercado-livre-scraper)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/Afilimax/mercado-livre-scraper/blob/HEAD/LICENSE)
[![Website](https://img.shields.io/badge/website-afilimax.net-7857FF)](https://afilimax.net)

# @afilimax/mercado-livre-scraper

Biblioteca TypeScript para pesquisar produtos e extrair páginas do Mercado Livre Brasil. O pacote automatiza o navegador com Puppeteer Stealth e combina dados estruturados JSON-LD com seletores HTML para produzir os contratos do `@afilimax/core`.

## Recursos

- Busca de produtos com limite e deslocamento para paginação.
- Extração de detalhes de um produto a partir da URL.
- Navegação com `puppeteer-extra` e `puppeteer-extra-plugin-stealth`.
- Extração prioritária de JSON-LD com fallback para cards HTML.
- Normalização de preços, avaliações, imagens, estoque e informações de frete.
- Identificação de IDs externos do Mercado Livre em diferentes formatos de URL.
- Logs adicionais opcionais por meio da variável de ambiente `DEBUG`.

## Instalação

```bash
npm install @afilimax/mercado-livre-scraper @afilimax/core
```

O `@afilimax/core` é uma dependência de par obrigatória, na versão `^0.5.0`.

## Como usar

### Pesquisar produtos

```typescript
import { MercadoLivreScraper } from "@afilimax/mercado-livre-scraper"

async function main() {
    const scraper = new MercadoLivreScraper({ headless: true })

    try {
        const products = await scraper.searchProducts({
            query: "smart tv 55",
            limit: 5,
            offset: 0,
        })

        console.log("Products found:", products.length)
        console.log(JSON.stringify(products, null, 2))
    } catch (error) {
        console.error("Search failed:", error)
    } finally {
        await scraper.close()
    }
}

main()
```

Para consultar a próxima página de dez resultados, use `offset: 10`.

### Extrair um produto

```typescript
const product = await scraper.getProduct({
    url: "https://www.mercadolivre.com.br/p/MLB72297423",
})

console.log("Product title:", product.title)
console.log("Current price:", product.price.value)
```

Chame `close()` ao finalizar para encerrar o navegador compartilhado entre as chamadas.

## Configuração

O construtor aceita `MercadoLivreScraperOptions`:

| Opção | Tipo | Padrão | Descrição |
| :--- | :--- | :--- | :--- |
| `headless` | `boolean \| "shell"` | `true` | Modo de execução do navegador. Use `false` para acompanhar a automação. |

O scraper procura o Chrome nos caminhos usuais do Windows e, quando não o encontra, utiliza a resolução padrão do Puppeteer. Defina `DEBUG=1` para exibir diagnósticos da URL final e das estratégias de extração.

## Referência da API

### Métodos

#### `searchProducts(options): Promise<ScrapedProductPreview[]>`

Pesquisa produtos no Mercado Livre Brasil. O método tenta primeiro os blocos JSON-LD e depois os cards HTML quando necessário.

| Opção | Tipo | Padrão | Descrição |
| :--- | :--- | :--- | :--- |
| `query` | `string` | Obrigatório | Termo de pesquisa. |
| `limit` | `number` | `20` | Quantidade máxima de itens retornados. |
| `offset` | `number` | `0` | Quantidade de resultados ignorados no início da listagem. |

A navegação da busca usa tempo limite de 30 segundos. Redirecionamentos para CAPTCHA ou verificação de conta interrompem a extração da página e resultam em uma lista vazia.

#### `getProduct(options): Promise<ScrapedProduct>`

Abre uma página de produto, aguarda o conteúdo principal e retorna os dados normalizados.

| Opção | Tipo | Descrição |
| :--- | :--- | :--- |
| `url` | `string` | URL do produto no Mercado Livre. |

A navegação do produto usa tempo limite de 35 segundos.

#### `close(): Promise<void>`

Fecha a instância do navegador, quando aberta, e limpa a referência interna.

### Estrutura do retorno

`getProduct` retorna o contrato `ScrapedProduct`. Exemplo da estrutura produzida:

```typescript
const product = {
    marketplace: "mercado_livre",
    externalId: "MLB72297423",
    title: "Smart Speaker with Voice Assistant",
    description: "Smart speaker with integrated voice control",
    brand: "Example Brand",
    price: {
        value: 468,
        originalValue: 549,
        currency: "BRL",
        pixPrice: null,
        installment: { count: 10, value: 46.8 },
    },
    shipping: {
        price: 0,
        currency: "BRL",
        freeShipping: true,
        full: true,
        prime: null,
        estimatedTime: null,
    },
    rating: {
        average: 4.9,
        totalReviews: 698,
    },
    availability: {
        inStock: true,
        quantity: null,
    },
    images: ["https://http2.mlstatic.com/example-product.jpg"],
    thumbnails: ["https://http2.mlstatic.com/example-product.jpg"],
    categories: null,
    features: null,
    specifications: null,
    coupons: null,
    scrapedAt: "2026-10-17T21:34:16.832Z",
}
```

Campos ausentes na página recebem `null` ou valores vazios conforme o contrato. A busca retorna `ScrapedProductPreview[]`, com `marketplace`, `externalId`, `title`, `url`, `thumbnail`, `price`, `rating`, `brand` e `scrapedAt`.

## Desenvolvimento

Instale as dependências com `npm install`. Os scripts disponíveis são:

| Comando | Finalidade |
| :--- | :--- |
| `npm run dev` | Executa `src/index.ts` com `ts-node`. |
| `npm run build` | Compila o TypeScript para `dist/`. |
| `npm test` | Executa os testes com Vitest. |
| `npm run test:watch` | Executa os testes em modo de observação. |
| `npm run test:cov` | Executa os testes com cobertura. |
| `npm run lint` | Executa o ESLint com correção automática. |
| `npm run format` | Formata os arquivos de `src/` com Prettier. |

## Licença

Distribuído sob a licença [MIT](./LICENSE).

---

## Automatize sua operação de afiliados

> Use este pacote para automatizar sua operação de afiliados. Conheça a plataforma Afilimax e transforme ofertas em links e divulgação automática.

[Conheça a Afilimax](https://afilimax.net) · [Pacote no npm](https://www.npmjs.com/package/@afilimax/mercado-livre-scraper) · [Repositório no GitHub](https://github.com/Afilimax/mercado-livre-scraper)
