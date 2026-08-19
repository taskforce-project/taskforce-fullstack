# Phase 4 — Architecture IA : Recommandation technique

> Document de référence pour l'implémentation de l'IA dans Taskforce  
> Date : Mai 2026 · Auteur : Copilot IA

---

## Contexte & périmètre

La Phase 4 couvre deux usages distincts de l'IA dans Taskforce :

| Fonctionnalité | Description | Complexité |
|----------------|-------------|-----------|
| **Smart Assign** | Suggère automatiquement le meilleur assignee pour une issue | Moyenne |
| **Assistant IA** | Chat conversationnel sur le workspace (agents page, command palette) | Haute |
| **AI Insights** | Résumés et anomalies sur le dashboard | Moyenne |

---

## Comparatif des approches

### Option 1 — Algorithme déterministe pur (pas d'IA)

Scoring basé sur : charge actuelle (open issues), historique d'assignation, skills/labels.

**✅ Avantages**
- Aucune dépendance externe, 0 coût
- Prévisible, debuggable, rapide
- Déjà partiellement implémenté dans `SmartAssignPanel`

**❌ Limites**
- Incapable de comprendre le contexte sémantique d'une issue
- "Fix bug in payment stripe webhook" → ne sait pas que c'est du backend JS
- Nécessite des métadonnées structurées (skills bien renseignés)

---

### Option 2 — Modèle fine-tuné hébergé soi-même

Entraîner un modèle (ex. BERT/DeBERTa pour classification) sur les données d'historique d'assignation du workspace.

**✅ Avantages**
- Modèle spécialisé sur le domaine exact
- Pas de dépendance cloud une fois entraîné

**❌ Limites**
- Nécessite un volume de données d'entraînement significatif (> 1000 issues assignées)
- Infra GPU pour l'entraînement + serving (pas viable sur ton PC)
- Time-to-value très long, ROI discutable pour ce projet

**⛔ Verdict : hors-scope pour Taskforce à ce stade.**

---

### Option 3 — Microservice Python dédié (API séparée)

Un service FastAPI/Flask qui expose un endpoint `/smart-assign` appelé par le backend Spring Boot.

**✅ Avantages**
- Liberté de lib (scikit-learn, sentence-transformers, etc.)
- Peut tourner en local ou sur un petit VPS

**❌ Limites**
- Complexité infra supplémentaire (un service de plus à docker-composer)
- Pour un LLM classique, Python n'apporte rien par rapport à un appel HTTP depuis Java
- Justifié seulement si tu veux des embeddings locaux (sentence-transformers)

**⚠️ Verdict : utile uniquement si tu veux éviter Groq et faire du ML local. Sinon, surcoût pour rien.**

---

### Option 4 — LLM via API Groq ✅ Recommandé

Appel direct depuis Spring Boot vers l'API Groq (compatible OpenAI). Le LLM reçoit le contexte (description de l'issue, profils des membres) et retourne une suggestion structurée.

**✅ Avantages**
- **Quota très généreux** : Llama 3.3 70B → 14 400 req/jour, 6 000 tokens/min sur le tier gratuit
- **Latence ultra-faible** : ~300–500ms pour une réponse complète (Groq = hardware LPU)
- Zéro infra à gérer
- Compatible `OpenAI` SDK : API identique, juste changer la base URL
- **Streaming** natif pour l'assistant IA (Server-Sent Events)
- Appel HTTP depuis Java avec `RestTemplate` ou `WebClient` — aucune lib Python nécessaire

**❌ Limites**
- Dépendance réseau externe (+ clé API à stocker en env var)
- Quota partagé si plusieurs workspaces actifs (à surveiller)
- Pas de données privées envoyées au modèle → acceptable pour une issue description, pas pour du code propriétaire

---

## Recommandation finale : Hybride Déterministe + Groq

```
Issue créée / bouton Smart Assign
        │
        ▼
┌─────────────────────────────────┐
│  Étape 1 — Pré-filtre Java      │  (gratuit, instantané)
│  Score par workload + labels    │
│  → top 5 candidats              │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│  Étape 2 — Groq LLM             │  (~350ms)
│  Prompt : issue + top 5         │
│  → classement sémantique        │
│  → explication en 1 phrase      │
└──────────────┬──────────────────┘
               │
               ▼
        Réponse au frontend
        { assignee, score, reason }
```

**Pourquoi hybride ?**
- Le pré-filtre évite d'envoyer 20 membres au LLM → réduit les tokens consommés
- Le LLM comprend le contexte ("intégration Stripe" → dev backend, pas designer)
- Si Groq est indisponible → fallback gracieux sur le résultat déterministe seul

---

## Choix du modèle Groq

| Modèle | Contexte | Vitesse | Quota gratuit | Usage recommandé |
|--------|----------|---------|---------------|-----------------|
| `llama-3.1-8b-instant` | 128k tokens | ⚡⚡⚡ Très rapide | 14 400 req/jour | Smart Assign (réponse courte) |
| `llama-3.3-70b-versatile` | 128k tokens | ⚡⚡ Rapide | 14 400 req/jour | Assistant IA (qualité > vitesse) |
| `mixtral-8x7b-32768` | 32k tokens | ⚡⚡ | 14 400 req/jour | Alternative si 70B saturé |
| `llama-3.2-11b-vision-preview` | 128k tokens | ⚡⚡ | Limité | Si besoin d'image (pas nécessaire ici) |

**Recommandation :**
- Smart Assign → `llama-3.1-8b-instant` (réponse JSON structurée, rapide)
- Assistant IA / chat → `llama-3.3-70b-versatile` (meilleure qualité de raisonnement)

---

## Architecture d'intégration

### Backend Spring Boot

```
backend/tf-api/
├── shared/config/
│   └── GroqConfig.java          ← Bean WebClient configuré pour Groq
├── core/service/
│   ├── SmartAssignService.java  ← Pré-filtre + appel GroqService
│   └── GroqService.java         ← Client Groq (chat completions)
└── core/api/
    ├── SmartAssignController.java   ← POST /issues/{id}/smart-assign
    └── AssistantController.java     ← POST /workspaces/{slug}/assistant (streaming)
```

### Appel Groq depuis Java (exemple)

```java
// GroqService.java
@Service
public class GroqService {

    @Value("${groq.api-key}")
    private String apiKey;

    private final WebClient webClient = WebClient.builder()
        .baseUrl("https://api.groq.com/openai/v1")
        .defaultHeader("Authorization", "Bearer " + apiKey)
        .build();

    public String chatCompletion(String model, String systemPrompt, String userPrompt) {
        // POST /chat/completions — format OpenAI standard
        GroqRequest req = GroqRequest.builder()
            .model(model)
            .messages(List.of(
                new Message("system", systemPrompt),
                new Message("user", userPrompt)
            ))
            .responseFormat(new ResponseFormat("json_object"))  // JSON mode
            .maxTokens(512)
            .build();

        return webClient.post()
            .uri("/chat/completions")
            .bodyValue(req)
            .retrieve()
            .bodyToMono(GroqResponse.class)
            .map(r -> r.choices().get(0).message().content())
            .block(Duration.ofSeconds(10));
    }
}
```

### Prompt Smart Assign

```
SYSTEM:
Tu es un assistant de gestion de projet. Tu reçois une issue et une liste
de membres de l'équipe avec leur spécialité et leur charge actuelle.
Retourne UNIQUEMENT un JSON valide de cette forme :
{
  "assigneeEmail": "user@example.com",
  "confidenceScore": 0.87,
  "reason": "Phrase courte expliquant le choix"
}

USER:
Issue : "Fix Stripe webhook signature validation on payment service"
Labels : ["bug", "backend", "payment"]
Priorité : HIGH

Candidats (triés par charge croissante) :
1. alice@company.com — spécialité: backend Java, charge: 3 issues ouvertes
2. bob@company.com   — spécialité: frontend React, charge: 5 issues ouvertes
3. carol@company.com — spécialité: backend Node.js/payments, charge: 2 issues ouvertes
```

### Assistant IA — Streaming SSE

```
POST /api/workspaces/{slug}/assistant
Body: { "message": "Quelles issues sont bloquées cette semaine ?" }

Response: text/event-stream
data: {"chunk": "Voici"}
data: {"chunk": " les issues"}
data: {"chunk": " bloquées..."}
data: [DONE]
```

Le backend fait une requête streaming vers Groq et pipe les chunks directement vers le client via `Flux<String>` (WebFlux) ou SSE avec `SseEmitter` (Spring MVC).

---

## Variables d'environnement à ajouter

### `.env.dev`
```bash
# IA — Groq
GROQ_API_KEY=gsk_xxxxxxxxxxxx
GROQ_SMART_ASSIGN_MODEL=llama-3.1-8b-instant
GROQ_ASSISTANT_MODEL=llama-3.3-70b-versatile
```

### `application-dev.yml`
```yaml
groq:
  api-key: ${GROQ_API_KEY:}
  smart-assign-model: ${GROQ_SMART_ASSIGN_MODEL:llama-3.1-8b-instant}
  assistant-model: ${GROQ_ASSISTANT_MODEL:llama-3.3-70b-versatile}
  enabled: ${GROQ_API_KEY:} != ""   # désactiver gracieusement si pas de clé
```

---

## Plan d'implémentation Phase 4 (révisé)

| # | Tâche | Statut | Notes |
|---|-------|--------|-------|
| 4.1 | `GroqService.java` + `GroqConfig.java` | ✅ Terminé | `chatCompletion()` + `streamCompletion()`, JSON mode, `groqRestTemplate` 30s timeout |
| 4.2 | `SmartAssignService.java` — remplacer localhost:8000 par Groq | ✅ Terminé | `fetchGroqScores()` — 1 seul appel LLM, fallback déterministe si clé absente |
| 4.3 | `AssistantController.java` + streaming SSE | ✅ Terminé | `SseEmitter`, `AssistantService.java`, contexte workspace injecté dans prompt |
| 4.4 | `AssistantService.java` — contexte workspace | ✅ Terminé | Charge membres + projets + 20 issues récentes dans le system prompt |
| 4.5 | UI `agents/page.tsx` — connecter au vrai streaming SSE | ✅ Terminé | Remplace mock `setTimeout` par `fetch` + ReadableStream SSE |
| 4.6 | `AI_INSIGHTS` dashboard — endpoint `/analytics/insights` | ⏳ À faire | LLM résume l'état du workspace |
| 4.7 | Connecter `SmartAssignPanel` frontend à l'endpoint réel | ⏳ À faire | Remplacer `setTimeout` + `TEAM_PROFILES` côté UI SmartAssign |

**Clé API à obtenir** : https://console.groq.com (gratuit, sans carte bleue)

---

## FAQ

**Q : Pourquoi pas OpenAI / Anthropic ?**  
Groq est plus rapide (LPU hardware) et le tier gratuit est beaucoup plus généreux. Pour un projet personnel/portfolio, Groq domine.

**Q : Et si les quotas Groq sont dépassés ?**  
Le fallback déterministe (Étape 1 seule) assure que Smart Assign fonctionne toujours. Pour l'assistant IA, retourner un message d'erreur explicite.

**Q : Faut-il un microservice Python ?**  
Non, pour des appels LLM cloud (Groq), Java avec WebClient est parfaitement adapté. Un microservice Python n'apporterait de valeur que pour du ML local (embeddings, modèles Hugging Face sans GPU cloud) — hors-scope ici.

**Q : Les données issues/workspace sont-elles envoyées à Groq ?**  
Oui, les titres et descriptions d'issues + les noms/emails des membres sont inclus dans le prompt. C'est acceptable pour un usage B2B standard (comparable à GitHub Copilot, Linear AI, etc.). À mentionner dans les CGU du produit.

**Q : Comment obtenir une clé Groq gratuite ?**  
→ https://console.groq.com — inscription gratuite, pas de carte bleue requise pour le tier gratuit.
