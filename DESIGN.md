---
name: ChantierExpress
description: PWA chantier — dictée, photos, CR PDF pour artisans
colors:
  primary: "#26314f"
  primary-deep: "#1a2340"
  primary-soft: "#eef0f5"
  primary-mid: "#d8dce8"
  paper: "#faf8f5"
  surface: "#ffffff"
  ink: "#1c1b19"
  neutral-100: "#f7f5f1"
  neutral-200: "#ece9e2"
  neutral-300: "#ddd7cc"
  neutral-500: "#a89f8b"
  neutral-700: "#6b6352"
  neutral-900: "#242019"
  success: "#25a95a"
  ai: "#5b4fd6"
  error: "#ef4444"
  warning: "#b45309"
typography:
  title:
    fontFamily: "Outfit, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 800
    lineHeight: 1.1
  body:
    fontFamily: "Outfit, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Outfit, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1.3
rounded:
  sm: "8px"
  md: "12px"
  lg: "20px"
  full: "9999px"
spacing:
  sm: "8px"
  md: "12px"
  lg: "18px"
  xl: "20px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.paper}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.primary-deep}"
    textColor: "{colors.paper}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  button-ai:
    backgroundColor: "{colors.ai}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  input:
    backgroundColor: "{colors.neutral-100}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "12px 14px"
  tag-done:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
---

# Design System: ChantierExpress

## 1. Overview

**Creative North Star: "Le carnet de chantier"**

L’interface est un carnet de terrain numérique : pages courtes, écriture nette, navy sérieux, papier clair. Elle sert l’artisan qui a une main libre et deux minutes — pas un dashboard SaaS. La densité reste raisonnable ; chaque écran pousse une action principale (nouvelle fiche, dicter, PDF).

Philosophie : **fiable · terrain · sobre**. Le navy (`#26314f`) porte l’autorité du rapport client ; le papier (`#faf8f5`) reste lisible en plein soleil. Outfit en unique famille, poids 700–800 pour les titres et CTA, corps 400–500. Pas de décoration qui rivalise avec le CR.

Explicitement rejeté (cf. PRODUCT.md) : dashboards “hero metrics”, esthétique AI purple/glow/glass, landing crème + serif éditorial, clones WhatsApp, ERP lourds.

**Key Characteristics:**
- Shell mobile max 480px, nav bas + FAB micro
- Une famille typo (Outfit), hiérarchie par poids
- Accent navy ≤10 % surface ; violet AI réservé au bouton Optimiser
- Cibles tactiles ≥44–48px ; toasts et états d’enregistrement visibles
- Ombres légères ; profondeur surtout tonale

## 2. Colors

Palette **restrained** : neutrals papier + un primary navy. Le violet AI est un signal de feature, pas une identité.

### Primary
- **Chantier Navy** (#26314f): header PDF, CTA primaire, nav active, pills “Terminé”. Rareté volontaire.
- **Navy Deep** (#1a2340): hover / pressed primary.
- **Navy Mist** (#eef0f5 / #d8dce8): fonds soft, tags, focus ring.

### Secondary
- **AI Violet** (#5b4fd6): uniquement bouton Optimiser / actions IA. Ne pas étendre à la chrome.

### Neutral
- **Jobsite Paper** (#faf8f5): fond app.
- **Surface** (#ffffff): cartes, modals.
- **Ink** (#1c1b19): texte principal.
- **Warm Stone** (#ece9e2 → #6b6352): chrome externe, labels, muted.

### Named Rules
**The One Navy Rule.** Le primary navy occupe ≤10 % d’un écran. S’il devient décoration de fond, c’est raté.

**The Sunlight Rule.** Texte body et labels doivent rester lisibles sur papier en lumière forte — pas de gris pâle décoratif sur `#faf8f5`.

## 3. Typography

**Display Font:** Outfit (system-ui)
**Body Font:** Outfit (system-ui)

**Character:** Une seule grotesque géométrique chaude. Technique sans froideur ; titres en 800, UI en 700, corps en 400.

### Hierarchy
- **Title** (800, 16px, 1.1): titres d’onglet / dialog.
- **Body** (400, 14px, ~1.45): descriptions, champs.
- **Label** (700, 12px): labels de champs, meta.
- **Micro** (600–700, 9.5–11px): actions de carte, sous-titres header.

### Named Rules
**The One Family Rule.** Pas de seconde police “pour le PDF marketing”. Outfit partout, y compris l’esprit du rapport.

## 4. Elevation

Hybride léger : surfaces plates + ombres ambient pour modals, toasts, dropdowns. Pas de glass, pas de multi-shadow cards.

### Shadow Vocabulary
- **Rest** (`0 1px 3px rgba(28, 27, 25, 0.07)`): cartes / éléments discrets.
- **Raise** (`0 8px 24px rgba(28, 27, 25, 0.09)`): sheets / popovers.
- **Modal** (`0 24px 60px rgba(28, 27, 25, 0.18)`): dialogs.

### Named Rules
**The Flat-By-Default Rule.** À rest, border + tonal fill. Shadow = état (modal ouvert, toast, dropdown).

## 5. Components

### Buttons
- **Shape:** coins doux (12px)
- **Primary:** navy sur paper, min-height 48–52px full-width pour CTA principaux
- **Secondary:** transparent + divider border
- **AI:** violet plein, même géométrie
- **Hover / Focus:** darken primary ; focus ring `0 0 0 3px` mist

### Chips / Tags
- Pills full-radius ; accent mist pour Terminé, neutral pour En cours

### Cards / Containers
- Surface blanche, radius 12px, border divider, padding interne ~14–16px
- Groupes journal : header client puis cartes CR imbriquées

### Inputs / Fields
- Fond neutral-100, radius 8px, focus → surface + border navy + ring mist
- Labels 12px bold stone

### Navigation
- Bottom bar sticky ; item actif en navy ; FAB micro centré (recording = error red pulse)

### Signature: Recording / Dictation
- Waveform + indicateur Pause/Arrêter ; feedback terrain avant tout

## 6. Do's and Don'ts

### Do:
- **Do** garder les CTA primaires pleine largeur ≥48px dans le flux chantier.
- **Do** parler métier (fiche, compte rendu, zone, Terminé) — langage PRODUCT.md.
- **Do** montrer l’état système (enregistrement, pause, transcription, toast).
- **Do** grouper le journal par client avant les CR.

### Don't:
- **Don't** faire des dashboards SaaS “hero metrics” (gros chiffres + cards identiques).
- **Don't** adopter l’esthétique “AI purple / glow / glassmorphism” hors du bouton Optimiser.
- **Don't** basculer en landing crème + serif éditorial.
- **Don't** cloner WhatsApp / messagerie comme coquille UX.
- **Don't** empiler une densité type ERP / devis logiciel lourd.
- **Don't** utiliser une `border-left` accent >1px comme stripe décorative.
- **Don't** partager des URLs `blob:` comme “liens” PDF.
