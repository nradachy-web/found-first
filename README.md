# Found First

AEO and ChatGPT advertising, with an ASCII brand identity.

Live website: https://befoundfirst.ai/

Pushes to main publish automatically through GitHub Actions.

Static website. Open index.html through a local HTTP server for development.

The research-led homepage and research articles use `research.js`. Inquiry handling
is isolated in `inquiry.js`; keep its disabled-by-default form and email fallback
when changing the homepage. Online delivery stays off until a validated endpoint
is configured in `config/public-inquiry.json`.

Before opening a pull request, run `node --test tests/*.test.mjs` and
`node tools/validate-public-content.mjs`. The publication build copies only files
in `config/public-files.json`, including the research pages; add new public assets
there explicitly. `node tools/build-public.mjs` creates `_site` and refuses to
overwrite an existing build.

Contact: nick@modernapexstrategies.com

Font license: assets/FONT-LICENSE.txt
