<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## MBA Player

Points à connaître avant de modifier le code :

- **Rien ne va directement du navigateur au portail.** Toute requête passe par
  `/api/xtream` (données) ou `/api/stream` (média). Les portails n'envoient pas
  d'en-têtes CORS et sont souvent en http, donc injoignables depuis une page
  https. Ne remplacez pas ces appels par un `fetch` direct.
- **`src/lib/server/safe-fetch.ts` est un garde-fou de sécurité.** Les deux
  routes fetchent une URL fournie par le client ; sans ce filtre, c'est une
  faille SSRF. Les tests dans `tests/safe-fetch.test.ts` cadrent son
  comportement — ne les affaiblissez pas pour faire passer un cas.
- **Les portails Xtream sont incohérents.** Le même champ peut être un nombre ou
  une chaîne selon le serveur. Tout passe par `src/lib/xtream-normalize.ts`
  avant d'atteindre l'interface ; ajoutez-y les nouveaux champs plutôt que de
  lire le JSON brut dans un composant.
- **Pas de `setState` dans un effet.** Le plugin `react-hooks` v7 l'interdit.
  L'état issu de `localStorage` passe par `src/lib/local-store.ts`
  (`useSyncExternalStore`), et les fenêtres de pagination se réinitialisent via
  une `key` de remontage, pas via un effet.
