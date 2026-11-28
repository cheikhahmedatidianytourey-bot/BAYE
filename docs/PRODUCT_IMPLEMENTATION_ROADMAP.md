# BAYE — audit produit et feuille de réalisation

## Position réelle (audit ciblé)
Cette note s'appuie sur les fichiers examinés sur main et le runner/validator disponibles dans G46. Ce n'est pas un audit exhaustif ni une validation de production.

- Assistant texte et routage : présents, dépendants d'un fournisseur IA configuré.
- Outils déterministes : calcul limité, statistiques textuelles et workflows bornés; pas des agents autonomes ni des actions externes.
- Mémoire : moteur/endpoints présents; les limites de coordination locale restent à considérer.
- Images : adaptateur Cloudflare Workers AI; dépend de secrets, quotas et tests réels.
- Vidéo : fournisseur externe fal.ai/Kling, dépendant de configuration; génération indépendante non démontrée.
- Applications : validator de manifestes et runner de build existent. L'exécution est déléguée à un sandbox adapter injecté; aucun provisionnement réel vérifié. Les mocks ne prouvent pas une exécution réelle.
- Interface : React propose Studio, Motion et autres surfaces; l'interface ne prouve pas que les fonctions sous-jacentes sont opérationnelles.

## Priorités de réalisation

### P0 — Architecture d'exécution isolée
Choisir sandbox et provisionnement; définir CPU/mémoire/durée, réseau désactivé par défaut, limites de sortie, isolation des secrets, nettoyage et permissions. Garder l'exécution hors du serveur Express principal. L'activation d'exécution de code non fiable requiert une autorisation explicite.

### P1 — Générateur d'applications MVP
Prompt → plan → manifestes → génération → validation; fichiers affichables/éditables, versions, erreurs lisibles et reprise contrôlée.

### P2 — Build, tests et diagnostic
Build sandbox après revue/autorisation; logs limités, erreurs et timeout; diagnostics reproductibles, corrections proposées, régressions et limites de réparation.

### P3 — Workspace et publication
Prévisualisation, versions, historique, export et sauvegarde; publication uniquement après confirmation et validations.

### P4 — Génération média
Stabiliser image (statut, quota, erreurs, affichage, sauvegarde). Workflow vidéo réel : tâches async, suivi, erreurs/reprise, stockage et coûts. Recherche ultérieure sur modèles auto-hébergés distincte des API.

### P5 — Plateforme publique
Authentification, quotas, stockage durable, observabilité, anti-abus, confidentialité et tests d'intégration; vérification coûts, disponibilité, reprise et sécurité avant lancement.

## Cadence
Regrouper les changements fonctionnels. Éviter les PR répétitives de tests de contrat lorsqu'elles ne font pas progresser le produit. Les tests soutiennent la réalisation, ils ne la remplacent pas.

## Limites
Ce document est un plan, pas la preuve de livraison. Exécution de code non fiable, provisionnement sandbox, déploiement et publication nécessitent autorisation explicite et revue des protections.
