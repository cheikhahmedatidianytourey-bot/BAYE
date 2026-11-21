# Doctrine d’autonomie technologique de BAYE

**WEMAD — BAYE**  
**Statut :** doctrine d’architecture et feuille de route  
**Principe directeur :** réduire les dépendances critiques, conserver la maîtrise des données et pouvoir remplacer un fournisseur sans reconstruire toute la plateforme.

## 1. Notre principe

BAYE doit rester ouvert aux innovations mondiales, mais ne doit jamais être structurellement captif d’un fournisseur, d’un modèle, d’un service cloud, d’un moyen de paiement ou d’une plateforme de publication.

L’autonomie se construit progressivement. Elle ne signifie pas prétendre tout posséder dès aujourd’hui, ni réinventer inutilement les technologies existantes. Elle signifie connaître nos dépendances, les maîtriser contractuellement et techniquement, prévoir des alternatives et internaliser les composants lorsque cela devient économiquement et opérationnellement raisonnable.

## 2. Règles d’architecture non négociables

1. **Aucun fournisseur unique ne doit devenir un point de défaillance permanent.** Toute fonction externe critique doit être derrière une interface interne et disposer d’un plan de remplacement documenté.
2. **Portabilité des modèles.** Les appels IA doivent passer par une couche d’adaptation BAYE indépendante du fournisseur, avec configuration explicite des modèles, limites, coûts, délais et capacités.
3. **Portabilité des médias.** Image, vidéo, audio et autres tâches média doivent utiliser des adaptateurs distincts. Le changement de fournisseur ne doit pas imposer une refonte de l’interface ou des flux métier.
4. **Données sous contrôle.** Les données utilisateurs, historiques, fichiers, paramètres et journaux doivent avoir des règles de propriété, d’accès, de conservation, d’export et de suppression clairement définies. Ne jamais envoyer de données sensibles à un service externe sans nécessité et information appropriée.
5. **Sécurité avant autonomie.** Secrets côté serveur uniquement, moindre privilège, validation des entrées, contrôle des coûts, limitation des abus, journalisation sans secrets et sauvegardes testées.
6. **Pas de fausse autonomie.** Une fonction n’est dite autonome, locale, auto-hébergée ou redondante qu’après preuve technique et tests documentés.
7. **Mode dégradé maîtrisé.** Si un fournisseur est indisponible, BAYE doit expliquer la fonction affectée, préserver les travaux lorsque possible et proposer une alternative réellement disponible — jamais simuler une réussite.
8. **Réversibilité.** Éviter les formats, API et services propriétaires lorsqu’une solution portable raisonnable existe. Documenter les procédures d’export et de migration.

## 3. Architecture cible

Le frontend BAYE communique avec une API centrale contrôlée par WEMAD. Cette API orchestre des interfaces internes stables :

- **AIProviderAdapter** : génération de texte, raisonnement et agents.
- **MediaProviderAdapter** : génération d’images, vidéos et audio.
- **StorageAdapter** : fichiers, objets et sauvegardes.
- **PaymentProviderAdapter** : paiements, remboursements et vérification serveur-à-serveur.
- **IdentityAdapter** : comptes, authentification et contrôle d’accès.
- **ObservabilityAdapter** : métriques, journaux, alertes et suivi des coûts.

Les adaptateurs ne doivent pas exposer leurs particularités au frontend. La sélection d’un fournisseur se fait côté serveur par configuration et politiques de capacité, coût, disponibilité et confidentialité.

## 4. Plan de progression

### Phase 0 — Transparence et stabilisation
- Inventorier chaque dépendance et son rôle.
- Identifier les clés, coûts, quotas, conditions de sortie et risques de verrouillage.
- Distinguer les fonctions opérationnelles, expérimentales et non configurées.
- Corriger les messages d’erreur afin de distinguer configuration absente, solde épuisé, quota, refus fournisseur et panne réseau.
- Mettre en place des tests reproductibles avant toute migration.

### Phase 1 — Couche d’abstraction
- Introduire les interfaces internes des fournisseurs IA et média.
- Garder les fournisseurs actuels comme adaptateurs initiaux.
- Normaliser les réponses, erreurs, identifiants de tâches et statuts.
- Ajouter des limites de dépenses, des délais d’attente, une politique de nouvelles tentatives prudente et une protection contre les doubles soumissions.
- Tester chaque adaptateur avec des simulations et des tests d’intégration.

### Phase 2 — Alternatives vérifiées
- Évaluer plusieurs fournisseurs et modèles selon qualité, prix, disponibilité, confidentialité et compatibilité.
- Ajouter au moins une alternative réellement testée pour chaque fonction critique avant de déclarer cette fonction tolérante aux pannes.
- Prévoir des options open source auto-hébergeables lorsque le coût total, le matériel, la sécurité et les compétences le permettent.
- Ne pas basculer automatiquement vers un fournisseur payant sans plafonds de coûts et règles explicites.

### Phase 3 — Maîtrise des données et de l’infrastructure
- Déployer une base de données durable, des sauvegardes chiffrées et des procédures de restauration testées.
- Permettre l’export des données et la migration vers une infrastructure compatible.
- Évaluer progressivement l’hébergement indépendant, les accélérateurs IA et le stockage sous contrôle WEMAD.
- Maintenir une procédure de reprise après incident et un inventaire des accès.

### Phase 4 — Internalisation sélective
- Mesurer les coûts réels et les volumes avant d’acheter du matériel ou d’entraîner des modèles.
- Internaliser d’abord les composants où l’indépendance apporte un avantage mesurable.
- Développer progressivement des modèles, outils, évaluations et composants propriétaires.
- Conserver la possibilité d’utiliser des services externes comme appoint, jamais comme dépendance invisible.

## 5. Situation technique connue au départ

Au moment de l’adoption de cette doctrine :
- Le backend BAYE utilise une configuration IA compatible avec une API de type Chat Completions.
- La génération média utilise directement fal.ai pour les images et les vidéos.
- La variable serveur attendue pour ce fournisseur média est `FAL_KEY`.
- Les comptes, paiements réels, abonnements, stockage durable des historiques et vérifications de paiement en production ne doivent pas être présentés comme opérationnels tant qu’ils ne sont pas construits et testés.
- La génération média a récemment été refusée par fal.ai avec une erreur 403 indiquant un solde épuisé. Cette panne fournisseur ne doit pas être confondue avec une panne de code ni masquée par un statut générique.

Cet état initial est un inventaire de départ, pas une garantie de disponibilité future. Il doit être actualisé à chaque évolution importante.

## 6. Critères de validation

Une dépendance critique n’est considérée comme maîtrisée que si WEMAD peut démontrer :
- qu’elle est identifiée et documentée ;
- que les secrets sont protégés ;
- qu’une solution de remplacement compatible existe ou que le risque résiduel est explicitement accepté ;
- que le remplacement a été testé dans un environnement contrôlé ;
- que les données et tâches peuvent être récupérées ou leur perte est clairement annoncée ;
- que les coûts et limites sont surveillés ;
- qu’aucune interface utilisateur ne prétend qu’une opération a réussi sans confirmation réelle.

## 7. Engagement

WEMAD construira BAYE pour gagner progressivement en autonomie, en sécurité, en portabilité et en capacité industrielle. Chaque étape sera validée par des tests et des preuves, pas par des slogans.

**Notre ambition : utiliser le monde sans être dépendants du monde.**
