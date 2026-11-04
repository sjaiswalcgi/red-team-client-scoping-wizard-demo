# CGI AI Red-Team Scope Builder — Public Demo

Static demonstration of a guided client-scoping workflow for Generative AI and Agentic AI red-team assessments.

## Demo status

This is a **draft demonstration**, not a production application. Use synthetic, non-sensitive information only.

- No application login or backend database
- Assessment drafts remain in the browser's local storage
- Exports are created only when the user downloads them
- No central audit, tenant isolation, RBAC, backup or recovery capability
- Technique recommendations require qualified security and risk-owner review

## Standards baseline

- MITRE ATLAS content version `2026.09`
- Platform filters: `Generative AI` and `Agentic AI`
- AWS Generative AI and Agentic AI security scoping concepts
- NIST AI RMF context and risk-mapping approach

Official ATLAS source: <https://github.com/mitre-atlas/atlas-data/releases/tag/v2026.09>

## Run locally

```bash
python3 -m http.server 8080
```

Open <http://localhost:8080>.

Do not open `index.html` directly because the application uses JavaScript modules and loads its catalogue over HTTP.

## Public demo

GitHub Pages can publish this repository directly from the `main` branch and repository root.

Expected URL: <https://sjaiswalcgi.github.io/red-team-client-scoping-wizard-demo/>

## Attribution

MITRE ATLAS™ is a public knowledge base maintained by The MITRE Corporation. Technique names, identifiers and relationships are sourced from the pinned ATLAS release above.
