# BAYE — L'intelligence au service de vos projets

**BAYE** est une plateforme numérique intelligente développée par **WEMAD**, au Sénégal. Elle réunit dans un même espace des outils d'assistance par IA, de création, d'apprentissage et de production numérique.

> **Une technologie au service des idées.**

## Notre ambition

Faire de BAYE un espace de travail numérique accessible à tous, au Sénégal et partout dans le monde : comprendre une idée, la structurer, créer un contenu, apprendre une compétence ou préparer un projet depuis une seule plateforme.

Notre vision à long terme est celle d'une intelligence globale, multilingue, multidisciplinaire et de plus en plus autonome — avec des autorisations claires, des résultats vérifiables et le respect des utilisateurs.

## Expérience disponible dans cette version

- **BAYE Studio** — génération de textes, idées, plans, messages et code via le fournisseur IA configuré.
- **BAYE Academy** — assistance pédagogique et exploration mathématique en plusieurs étapes.
- **BAYE Motion** — interface de génération d'images et de vidéos, selon la disponibilité et la configuration des fournisseurs externes.
- **Routage multidisciplinaire** — orientation des demandes vers des consignes spécialisées.
- **BAYE SENTINEL** — surveillance technique du service et de ses points de santé.
- **Memory Engine** — fondation de mémoire privée côté serveur, protégée par un jeton dédié; son usage durable dépend du stockage persistant correctement configuré.

Les réponses génératives utilisent un fournisseur d'inférence externe configuré. BAYE est la plateforme et la couche d'orchestration développées par WEMAD; cette version ne prétend pas être un nouveau modèle de fondation entraîné par WEMAD.

## Architecture

- Frontend : React et Vite.
- Backend : Node.js et Express.
- Intelligence : noyau de mission BAYE, routage de domaines et adaptateur de fournisseur IA.
- Vérification : contrôles structurels et tests automatisés; ils ne remplacent pas une validation factuelle indépendante.
- Médias : adaptateurs séparés pour les fournisseurs image et vidéo.

## Démarrage local

Prérequis : Node.js 24.x.

```bash
npm install
npm run dev
```

Pour lancer le serveur :

```bash
npm start
```

Pour construire et tester :

```bash
npm test
npm run build
```

Le backend nécessite les variables d'environnement correspondant aux fournisseurs et fonctions que vous souhaitez activer. Ne placez jamais de clés API dans le frontend, dans Git ou dans une conversation publique.

## Capacités en développement

Les axes de développement incluent la recherche internationale en direct avec citations vérifiables, les agents spécialisés coordonnés, l'exécution d'outils avec permissions, les comptes utilisateurs, l'historique durable, les contrôles de coûts et les paiements vérifiés.

Ces éléments sont des objectifs de développement et ne doivent pas être considérés comme disponibles tant qu'ils ne sont pas intégrés, testés et publiés.

## Principes

1. **Utilité réelle** — résoudre des tâches concrètes plutôt que promettre des capacités fictives.
2. **Transparence** — distinguer les faits, les estimations, les hypothèses et les fonctions non disponibles.
3. **Autonomie responsable** — automatiser le travail autorisé; demander confirmation avant les actions sensibles ou irréversibles.
4. **Sécurité et confidentialité** — protéger les données, limiter les accès et maîtriser les coûts.
5. **Ouverture mondiale** — concevoir une expérience multilingue, accessible et adaptée à différents contextes.
6. **Exigence** — tester, mesurer et améliorer chaque version.

## Identité

- Produit : BAYE AI CORE
- Développement : WEMAD
- Créateur : CHEIKH AHMED TIDIANE TOURE
- Origine : Sénégal

---

**BAYE — Une technologie au service des idées.**
