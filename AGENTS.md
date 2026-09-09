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
- **Deux sources d'abonnement, une seule API interne.** Les écrans importent
  depuis `src/lib/catalog.ts`, qui aiguille vers `xtream.ts` ou `m3u-catalog.ts`
  selon `credentials.source`. N'importez pas un backend directement depuis un
  composant. Ce qu'une playlist ne peut pas fournir (guide, rattrapage,
  résumés, abonnement) renvoie vide ou `null` — ne l'inventez pas, et laissez
  les écrans l'expliquer.
- **Les portails Xtream sont incohérents.** Le même champ peut être un nombre ou
  une chaîne selon le serveur. Tout passe par `src/lib/xtream-normalize.ts`
  avant d'atteindre l'interface ; ajoutez-y les nouveaux champs plutôt que de
  lire le JSON brut dans un composant.
- **Pas de `setState` dans un effet.** Le plugin `react-hooks` v7 l'interdit.
  L'état issu de `localStorage` passe par `src/lib/local-store.ts`
  (`useSyncExternalStore`), et les fenêtres de pagination se réinitialisent via
  une `key` de remontage, pas via un effet.
- **Pas de `Date.now()` pendant le rendu.** Le même plugin le refuse comme
  impur. Utilisez `useNow()` (`src/hooks/use-now.ts`), qui renvoie `0` côté
  serveur et pendant l'hydratation — les écrans qui dépendent de l'heure
  attendent cette première valeur.
- **L'heure du rattrapage est celle du portail.** Le paramètre `start` d'une URL
  timeshift est une heure murale lue sur le portail, pas un instant UTC ni
  l'heure du spectateur. Passez toujours par `formatTimeshiftStart`
  (`src/lib/catchup.ts`), qui privilégie le fuseau IANA du portail — un décalage
  fixe mesuré aujourd'hui est faux pour un enregistrement situé de l'autre côté
  d'un changement d'heure.
- **Libellés du guide TV.** Dans `src/components/epg-grid.tsx`, le libellé d'un
  programme est en `position: sticky` pour rester lisible quand le bloc commence
  avant la zone visible. Il lui faut `w-max` : un élément collant aussi large que
  son bloc conteneur n'a aucune marge pour glisser et ne bouge jamais. Et le bloc
  ne doit pas avoir `overflow-hidden`, qui en ferait un conteneur de défilement
  et annulerait la fixation.
