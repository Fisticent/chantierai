# ChantierExpress

Application PWA pour artisans et professionnels du bâtiment : dictez votre compte rendu de
chantier à la voix, prenez des photos en même temps, et générez un rapport PDF structuré par
pièce en quelques secondes — même hors-ligne.

## Fonctionnalités

- **Dictée vocale** — enregistrement audio local, transcrit via **Groq Whisper** (gratuit, rapide).
  Fonctionne même si vous prenez une photo pendant que vous parlez (l'enregistrement n'est pas
  interrompu par l'ouverture de l'appareil photo).
- **Photos liées aux tâches** — chaque photo prise pendant la dictée est automatiquement associée
  à la phrase prononcée au même moment.
- **Structuration automatique** — **Gemini** regroupe le texte dicté par zone/pièce (Salle de bain,
  Cuisine...) sous forme de tâches courtes et factuelles, dans le style d'un vrai compte rendu de
  chantier.
- **Export PDF** — rapport avec logo, coordonnées de l'artisan, tâches groupées par pièce et
  photos associées.
- **Partage WhatsApp / email** — envoi du rapport et des photos en un geste.
- **Annuaire clients** et **profil artisan** persistés localement.
- **PWA installable**, fonctionne hors-ligne (Service Worker).

## Stack technique

- React 19 + Vite
- [Groq](https://console.groq.com/) (Whisper `whisper-large-v3`) pour la transcription vocale
- [Google Gemini](https://aistudio.google.com/) (`gemini-3.1-flash-lite`) pour la structuration du texte
- `jsPDF` pour la génération du rapport
- `localforage` (IndexedDB) pour le stockage local
- `lucide-react` pour les icônes

## Démarrage

```bash
npm install
```

Copiez `.env.example` en `.env` et renseignez vos clés :

```
VITE_GEMINI_API_KEY=...   # https://aistudio.google.com/apikey
VITE_GROQ_API_KEY=...     # https://console.groq.com/keys
```

```bash
npm run dev        # serveur de développement (HTTPS, accessible sur le réseau local)
npm run build       # build de production
npm run lint         # oxlint
```

Le serveur dev utilise un certificat HTTPS auto-signé (requis pour le micro, la caméra, les
notifications et l'installation PWA). Sur un autre appareil du même réseau, acceptez
l'avertissement de sécurité du navigateur pour continuer.

## Données de démonstration

Au tout premier lancement, l'application charge automatiquement 3 clients et 3 interventions
d'exemple (avec photos) pour montrer le fonctionnement de l'app. Elles ne réapparaissent jamais
après une modification de vos propres données.

## Structure du projet

```
src/
  App.jsx        # toute la logique et l'interface (composant unique)
  index.css       # design system (tokens de couleur, composants)
  main.jsx        # point d'entrée React + enregistrement du Service Worker
public/
  manifest.json    # manifeste PWA
  sw.js            # Service Worker (cache hors-ligne)
compte_rendu_exemples/
  *.pdf            # comptes rendus de chantier réels utilisés comme référence de style
                     # (vocabulaire métier, structure par zone) pour les prompts Groq/Gemini
```
