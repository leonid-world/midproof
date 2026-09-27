# MidProof UI

Vue 3 frontend for an integrated Midnight Preview financial eligibility demo. The
subject chooses a synthetic financial scenario and authorizes evaluation of the
requester's public criteria. Midnight proves the combined result without
publishing the raw values. This is not bank/accounting verification or funding
approval. Receivable asset transactions remain on a separate test network;
this UI branding change does not migrate them onto Midnight.

MidProof is an independent hackathon project built with Midnight. Its original
logo is stored in `public/midproof-logo.svg`; the favicon uses the same mark.
The editable social card is `public/og-midproof.svg`, with a 1200x630 PNG for
Open Graph / Twitter. Theme tokens live in `src/assets/base.css`. Historical
asset URLs remain compatible and serve the MidProof artwork.

Public copy and artwork use MidProof branding. Protocol field names, signature
domains, request headers, historical file-import compatibility, and actual
network settings remain unchanged to preserve the working proof flow. The
implementation history, source baseline, and network architecture remain
recorded in the root repository's `docs/ai` documents.

Public demo: [midproof.vercel.app](https://midproof.vercel.app/).
Canonical, Open Graph / Twitter image URLs and the sitemap use this origin.
The sitemap lists only the public entry page; authenticated application routes
remain excluded, with their existing `noindex` behavior unchanged. Local
diagnostic routes remain disabled in production. The current
`VITE_MIDNIGHT_DEMO_ENABLED=true` flag enables the authenticated hosted v2 routes.

Select **Midnight Demo** and Run in IntelliJ to start the integrated backend.
The frontend uses `VITE_API_URL=http://localhost:18080` locally; on Vercel, use
the existing Railway application origin. Both ordinary API and proof requests
go to that origin. No local attestation/reader/proof URLs are needed in Vercel.
The login screen has three shared synthetic demo account buttons. Subject
MetaMask consent remains required. The gateway expands named fictional fixtures;
the operator processes those values, while the requester sees the policy result.

Use Node `^22.18.0 || >=24.12.0` (verified with 24.19.0).

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur).

## Recommended Browser Setup

- Chromium-based browsers (Chrome, Edge, Brave, etc.):
  - [Vue.js devtools](https://chromewebstore.google.com/detail/vuejs-devtools/nhdogjmejiglipccpnnnanhbledajbpd)
  - [Turn on Custom Object Formatter in Chrome DevTools](http://bit.ly/object-formatters)
- Firefox:
  - [Vue.js devtools](https://addons.mozilla.org/en-US/firefox/addon/vue-js-devtools/)
  - [Turn on Custom Object Formatter in Firefox DevTools](https://fxdx.dev/firefox-devtools-custom-object-formatters/)

## Customize configuration

See [Vite Configuration Reference](https://vite.dev/config/).

## Project Setup

```sh
npm install
```

### Compile and Hot-Reload for Development

```sh
npm run dev
```

### Compile and Minify for Production

```sh
npm run build
```

### Lint with [ESLint](https://eslint.org/)

```sh
npm run lint
```
