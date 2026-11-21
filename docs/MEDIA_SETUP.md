# Configuration de BAYE Motion

## 1. Génération d’images (Cloudflare Workers AI)

BAYE utilise `@cf/black-forest-labs/flux-1-schnell`. Le modèle accepte une description de 2 048 caractères maximum et renvoie une image encodée en base64. La génération est effectuée côté serveur : le jeton Cloudflare n'est jamais envoyé au navigateur.

### Créer les accès

1. Créer un compte sur https://dash.cloudflare.com/ et ouvrir le tableau de bord.
2. Ouvrir **AI > Workers AI**, puis choisir **Use REST API** / **Create a Workers AI API Token**.
3. Utiliser le modèle de jeton proposé par Cloudflare, ou créer un jeton personnalisé avec les permissions de compte **Workers AI: Read** et **Workers AI: Edit**.
4. Copier l’Account ID et le jeton. Le jeton n'est affiché qu'à sa création : le conserver confidentiellement.
5. Dans Render, ouvrir le service backend BAYE (`baye-ai-gateway`), puis **Environment** et ajouter :

```text
CLOUDFLARE_ACCOUNT_ID=<identifiant du compte Cloudflare>
CLOUDFLARE_API_TOKEN=<jeton Workers AI>
```

6. Enregistrer les variables et attendre le redémarrage du backend.

### Limite gratuite et protection contre les coûts

Cloudflare annonce 10 000 Neurons gratuits par jour sur Workers Free. Les compteurs sont réinitialisés à 00:00 UTC. Si la limite est dépassée sur Workers Free, les opérations échouent. Le dépassement de la limite gratuite sur Workers Paid peut être facturé : ne pas activer ce plan ni ajouter de moyen de paiement sans décision explicite. BAYE ne bascule pas vers un autre fournisseur payant.

Consulter la consommation dans le tableau de bord Workers AI. Tarifs et quotas peuvent changer : vérifier la page officielle avant toute évolution.

## 2. Génération de vidéos

La génération vidéo reste séparée et utilise actuellement fal.ai/Kling en mode asynchrone. Elle nécessite `FAL_KEY` et un compte fournisseur avec un solde valide. Aucun service payant n'est lancé automatiquement. Tant qu'un fournisseur vidéo réellement gratuit et fiable n'est pas sélectionné et validé, cette fonction peut rester indisponible.

## 3. Vérifier l'état

- `GET https://baye-ai-gateway.onrender.com/health` : disponibilité du backend.
- `GET https://baye-ai-gateway.onrender.com/api/capabilities` : état des configurations image et vidéo, sans révéler les secrets.
- Dans BAYE Motion, soumettre une courte description d'image pour le test réel après configuration.

Ne jamais publier le jeton, le placer dans le frontend, dans GitHub, ni l'envoyer dans une conversation.

## Documentation officielle

- Workers AI REST API : https://developers.cloudflare.com/workers-ai/get-started/rest-api/
- FLUX.1 Schnell : https://developers.cloudflare.com/workers-ai/models/flux-1-schnell/
- Tarification et quotas : https://developers.cloudflare.com/workers-ai/platform/pricing/
- Permissions des jetons : https://developers.cloudflare.com/fundamentals/api/reference/permissions/