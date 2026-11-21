# BAYE — architecture multidomaine et fournisseurs IA

**Version de cette proposition :** 1.0.0  
**Branche :** `baye-capability-architecture`

## Routage multidomaine

`server/ai/domain-router.js` fournit un registre extensible de domaines, un routeur déterministe par mots-clés et des consignes méthodologiques adaptées. Le routeur choisit une discipline probable; il ne mesure pas une compétence réelle du modèle et ne remplace pas une classification sémantique évaluée.

Domaines actuellement enregistrés : mathématiques, physique, chimie, biologie, médecine et santé, informatique, ingénierie, intelligence artificielle, cybersécurité, économie et finance, droit, histoire, géographie, langues, littérature, philosophie, éducation, entrepreneuriat et stratégie, arts et création, connaissances générales.

## Fournisseurs IA

`server/ai/provider-adapter.js` prend en charge un fournisseur principal et un fournisseur de secours facultatif compatible avec l'API Chat Completions.

Variables du fournisseur principal déjà utilisées :
- `AI_API_KEY`
- `AI_API_BASE_URL`
- `AI_MODEL`

Variables facultatives de secours :
- `AI_FALLBACK_API_KEY`
- `AI_FALLBACK_API_BASE_URL`
- `AI_FALLBACK_MODEL`

Le secours est activé uniquement si les trois variables facultatives sont renseignées. Aucun fournisseur n'est ajouté automatiquement et aucune dépense supplémentaire n'est déclenchée sans configuration explicite. Le statut public expose uniquement des booléens, jamais les secrets.

## API

- `GET /api/capabilities` : domaines, capacités disponibles et état de configuration des fournisseurs.
- `POST /api/generate` : sélectionne une spécialité, applique ses consignes et retourne le domaine sélectionné avec la réponse.

## Limites déclarées

Le routage est lexical et peut se tromper sur les requêtes ambiguës ou multidisciplinaires. La couche de secours améliore la disponibilité, mais ne crée pas de consensus indépendant. Cette version n'inclut pas encore :
- un second modèle indépendant activement évalué;
- une recherche web/documentaire avec citations vérifiées;
- un moteur de calcul symbolique;
- un vérificateur de preuves formelles;
- une mémoire utilisateur persistante;
- des modèles fondamentaux auto-hébergés;
- des paiements en production;
- un fournisseur média alternatif opérationnel.

Ces fonctions ne doivent pas être annoncées comme disponibles avant leur implémentation et leurs tests d'intégration.

## Validation

La CI exécute `npm test` et `npm run build`. Les tests de cette branche vérifient le routage, la transparence du catalogue, l'activation explicite du secours et le comportement de bascule simulé. Ils ne prouvent pas la disponibilité réelle des fournisseurs externes.

## Génération d’images et de vidéos

- **Images :** adaptateur `server/ai/media-adapter.js` utilisant `@cf/black-forest-labs/flux-1-schnell` via Cloudflare Workers AI. La génération est synchrone et le résultat image est renvoyé sous forme de data URI. Configuration serveur requise : `CLOUDFLARE_ACCOUNT_ID` et `CLOUDFLARE_API_TOKEN`.
- **Quota image :** Cloudflare documente une allocation Workers AI gratuite de 10 000 Neurons par jour sur le plan Workers Free; les limites et modèles disponibles peuvent évoluer. Le dépassement du quota gratuit échoue au lieu de basculer vers une facturation cachée.
- **Vidéos :** génération asynchrone via fal.ai/Kling. Elle reste indisponible sans `FAL_KEY` et sans solde valide chez le fournisseur. Aucun fournisseur vidéo gratuit récurrent et suffisamment vérifié n’est activé par défaut.
- `GET /api/capabilities` expose séparément la configuration des fournisseurs image et vidéo, sans révéler les secrets.
- L’interface affiche directement l’image générée; la vidéo conserve le suivi de tâche. Les erreurs de quota et d’absence de configuration sont explicites.
- Aucun fournisseur de secours payant n’est activé automatiquement. La disponibilité réelle doit être confirmée par un test de production après configuration des secrets.