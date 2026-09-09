# MBA Player

Lecteur multimédia web pour portails **Xtream Codes** : TV en direct, films et
séries, dans le navigateur. PWA installable sur mobile et desktop.

MBA Player est un **lecteur**, pas un fournisseur de contenu — comme VLC. Il ne
contient aucun flux, aucune chaîne et aucun catalogue : vous saisissez l'adresse
et les identifiants de votre propre abonnement, et l'application les lit.
N'utilisez que des services auxquels vous êtes légalement abonné.

## Fonctionnalités

- **Connexion Xtream Codes** — adresse du portail, identifiant, mot de passe.
  Coller un lien M3U complet (`get.php?username=…&password=…`) remplit le
  formulaire automatiquement.
- **TV en direct** — liste des chaînes par catégorie, recherche, lecteur intégré
  et guide EPG « en ce moment / à suivre ».
- **Guide TV** — grille complète des programmes : axe du temps horizontal,
  colonne des chaînes figée, repère « maintenant », navigation sur plusieurs
  jours (deux jours en arrière, quatre en avant), trois niveaux de zoom, et le
  détail d'un programme au clic.
- **Rattrapage** — revoir un programme passé sur les chaînes que le portail
  enregistre. Les programmes rejouables sont marqués dans la grille, et le
  bouton « Revoir » lance l'enregistrement.
- **Films et séries** — catalogue avec catégories, recherche, fiches détaillées,
  navigation par saison et par épisode.
- **Reprise de lecture** — position mémorisée par film et par épisode, reprise
  depuis l'accueil.
- **Favoris** — chaînes, films et séries, mémorisés sur l’appareil.
- **Profils multiples** — plusieurs abonnements sur le même appareil.
- **Lecteur** — HLS via hls.js, sélection de qualité et de piste audio, raccourcis
  clavier, plein écran, lecture automatique de l'épisode suivant.
- **PWA** — installable, avec un service worker qui met en cache la coquille de
  l'application (jamais les flux ni les données du portail).

## Démarrage

```bash
npm install
npm run dev
```

Puis ouvrez http://localhost:3000 et saisissez les informations de votre portail.

## Scripts

| Commande            | Effet                                        |
| ------------------- | -------------------------------------------- |
| `npm run dev`       | Serveur de développement (Turbopack)         |
| `npm run build`     | Build de production                          |
| `npm run start`     | Sert le build de production                  |
| `npm run typecheck` | Vérification TypeScript                      |
| `npm run lint`      | ESLint                                       |
| `npm test`          | Tests unitaires et d'intégration (Vitest)    |
| `npm run icons`     | Régénère les icônes PWA                      |

## Variables d'environnement

| Variable                        | Défaut | Effet                                                                                                       |
| ------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------- |
| `MBAPLAYER_ALLOW_PRIVATE_HOSTS` | absent | À `1`, autorise les portails sur adresse privée ou locale (`192.168.…`, `localhost`). Voir la section suivante. |

## Comment ça marche

### Le proxy, et pourquoi il est obligatoire

Le navigateur ne peut pas appeler un portail directement, pour deux raisons :
les portails n'envoient pas d'en-têtes CORS, et la plupart sont en `http`, ce
qu'une page servie en `https` n'a pas le droit de charger. Toutes les requêtes
passent donc par le serveur Next.js :

- `POST /api/xtream` — appelle `player_api.php` sur le portail. Les identifiants
  voyagent dans le corps de la requête, pas dans l'URL, pour ne pas se retrouver
  dans les journaux d'accès ni l'historique du navigateur.
- `GET /api/stream?u=…` — relaie le média. Les playlists HLS sont réécrites à la
  volée pour que les segments repassent aussi par le proxy, et l'en-tête `Range`
  est transmis pour que l'avance rapide fonctionne sur les films.

### L'heure du portail, et pourquoi elle compte

Le rattrapage se demande par heure de début — mais cette heure est lue sur
**l'horloge du portail**, pas sur celle du spectateur. Un abonné à Dakar
demandant « 20:00 » à un portail parisien récupérerait sinon les deux mauvaises
heures.

`src/lib/catchup.ts` privilégie le fuseau IANA annoncé par le portail
(`server_info.timezone`), car c'est le seul moyen d'être juste de part et
d'autre d'un changement d'heure — ce qui arrive largement dans les quelques
jours d'archive conservés. À défaut, il calcule le décalage à partir de
`time_now` et `timestamp_now`, que le portail renvoie pour le même instant. En
dernier recours, il utilise l'horloge du spectateur.

### Sécurité : le filtre SSRF

Ces deux routes vont chercher une URL fournie par le client. Sans garde-fou,
c'est une faille SSRF classique. `src/lib/server/safe-fetch.ts` résout le nom
d'hôte et refuse les adresses de bouclage, les plages privées, le lien-local et
les points de terminaison de métadonnées cloud — y compris les formes IPv6 qui
encapsulent une adresse IPv4 privée.

Si votre portail est sur votre réseau local, définissez
`MBAPLAYER_ALLOW_PRIVATE_HOSTS=1`. Les points de terminaison de métadonnées
restent bloqués dans tous les cas.

### Où sont stockés les identifiants

Dans le `localStorage` du navigateur, **en clair**. MBA Player n'a pas de compte
utilisateur ni de base de données : vos identifiants ne quittent l'appareil que
pour joindre votre propre portail via le proxy. Toute personne ayant accès au
profil du navigateur peut les lire — supprimez le profil depuis l'écran
**Compte** si l'appareil est partagé.

## Limites connues

- **Conteneurs vidéo.** Les navigateurs ne décodent nativement que MP4, WebM et
  HLS. Les fichiers MKV et AVI que servent certains portails ne se liront pas :
  l'application affiche un avertissement et suggère un lecteur externe. Résoudre
  ce point demanderait un transcodage côté serveur.
- **Flux TS en direct.** Le format `.ts` brut n'est pas lisible dans un
  navigateur. Le réglage par défaut demande du `.m3u8` ; l'option TS n'est là que
  pour les portails qui n'offrent rien d'autre.
- **Rattrapage.** Sa disponibilité dépend entièrement du portail : la chaîne
  doit être enregistrée (`tv_archive`) et le programme doit rester dans la
  fenêtre conservée (`tv_archive_duration`, souvent 2 à 7 jours). L'application
  essaie deux formes d'URL, mais certains panneaux répondent en MPEG-TS, que les
  navigateurs ne décodent pas — dans ce cas la lecture échoue avec un message
  explicite.
- **Portée du guide.** L'étendue de la grille dépend du portail : la plupart
  fournissent deux à sept jours. Une chaîne sans EPG affiche une ligne vide.
- **Horaires sans fuseau.** Si un portail ne renvoie pas `start_timestamp` mais
  seulement des chaînes de caractères (`2026-09-09 20:00:00`), celles-ci sont
  lues comme de l'UTC — faute d'indication de fuseau — et les programmes
  peuvent apparaître décalés.

## Structure

```
src/
├── app/
│   ├── (app)/              Écrans protégés (accueil, direct, guide, films, séries, favoris, compte)
│   ├── api/
│   │   ├── stream/         Proxy média + réécriture des playlists HLS
│   │   └── xtream/         Proxy player_api.php
│   ├── lecture/            Lecteur plein écran (films et épisodes)
│   ├── rattrapage/         Lecteur de rattrapage (programme passé)
│   ├── manifest.ts         Manifeste PWA
│   └── page.tsx            Écran de connexion
├── components/             Interface, dont le lecteur vidéo
├── context/session.tsx     Profil actif et réglages
├── components/epg-grid.tsx Grille du guide TV
├── hooks/                  useAsync, useHls, useNow, useEpgBatch
└── lib/
    ├── catchup.ts          Horloge du portail et URLs de rattrapage
    ├── epg-layout.ts       Géométrie de la grille du guide
    ├── portal.ts           Analyse d'adresse et construction des URLs de flux
    ├── xtream.ts           Client typé de l'API
    ├── xtream-normalize.ts Normalisation des réponses de portail
    ├── local-store.ts      État localStorage via useSyncExternalStore
    └── server/             Filtre SSRF et réécriture HLS
```

## Tests

```bash
npm test
```

Les tests couvrent l'analyse des adresses de portail, la normalisation des
réponses (les portails renvoient le même champ tantôt en nombre tantôt en
chaîne), la géométrie de la grille du guide, la conversion vers l'horloge du
portail (y compris de part et d'autre d'un changement d'heure), la construction
des URLs de rattrapage, la réécriture des playlists HLS, le filtre SSRF et les
deux routes de proxy. Aucune requête réseau réelle n'est effectuée.

### Comment le guide charge ses données

Le guide interroge `get_simple_data_table` **chaîne par chaîne**, et seulement
pour les lignes visibles à l'écran, quatre requêtes à la fois. L'alternative,
`xmltv.php`, renvoie le guide de toutes les chaînes en un seul fichier —
couramment plusieurs dizaines de mégaoctets sur un portail de plusieurs milliers
de chaînes, ce qui n'est pas raisonnable sur mobile. Les résultats sont mis en
cache pour la durée de l'onglet, donc remonter dans la liste est instantané.
