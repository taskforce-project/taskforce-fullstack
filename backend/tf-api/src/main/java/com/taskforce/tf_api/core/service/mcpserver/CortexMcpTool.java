package com.taskforce.tf_api.core.service.mcpserver;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.taskforce.tf_api.core.security.DelegatedAgent;
import com.taskforce.tf_api.core.service.agent.AgentContext;
import com.taskforce.tf_api.core.service.agent.CortexGesture;
import com.taskforce.tf_api.core.service.agent.Question;
import com.taskforce.tf_api.core.service.agent.QuestionNeeded;
import com.taskforce.tf_api.core.service.agent.tools.IssueFields;

/**
 * Un outil du MCP TaskForce tel que Cortex s'en sert dans la conversation (ADR-024) : le même outil qu'un agent
 * extérieur appelle par le serveur MCP, appelé ici dans le processus du backend, au nom de la personne qui écrit (pas
 * d'une session déléguée). {@code AgentService} le juge comme toute action de Cortex, par les règles de l'espace, sur
 * l'action que l'outil porte ; l'activité de l'issue dit « Cortex », pour la personne.
 *
 * <p>Seule la présentation change : Cortex nomme l'issue, la colonne et la personne par leurs noms, comme on les lit sur
 * le tableau ; les ids, qu'un agent délégué connaît déjà, ne lui sont pas montrés. Ce que le geste exige et que la
 * demande ne dit pas, TaskForce le demande à la personne (R115) : l'issue, avec celles de l'écran en choix, un texte
 * qui manque ; un argument demandé n'est donc pas obligatoire pour le modèle, qui n'a pas à l'inventer.</p>
 */
final class CortexMcpTool implements CortexGesture {

    /** Les arguments par id, que Cortex remplace par des noms : un petit modèle ne les invente pas. */
    private static final Set<String> IDS = Set.of("projectId", "issueId", "statusId", "assigneeId");
    private static final String ISSUE = "issue";
    private static final TypeReference<Map<String, Object>> MAP = new TypeReference<>() {};

    private final McpTool tool;
    private final IssueGestures gestures;
    private final ObjectMapper mapper;

    CortexMcpTool(McpTool tool, IssueGestures gestures, ObjectMapper mapper) {
        this.tool = tool;
        this.gestures = gestures;
        this.mapper = mapper;
    }

    @Override public String name() { return tool.name(); }

    @Override public String description() { return tool.description(); }

    @Override public String action() { return tool.action(); }

    /**
     * Le schéma de l'outil, sans les ids. Ce que TaskForce demande quand il manque (R115) n'est pas obligatoire : le
     * modèle le passe quand la demande le dit, et le laisse sinon.
     */
    @Override public Map<String, Object> parametersSchema() {
        ObjectNode schema = tool.inputSchema().deepCopy();
        ObjectNode properties = (ObjectNode) schema.path("properties");
        properties.remove(IDS);
        Set<String> asked = new java.util.HashSet<>();
        tool.needs().stream().filter(McpTool.Need::isAsked).forEach(need -> asked.add(need.field()));
        List<String> required = new ArrayList<>();
        schema.path("required").forEach(name -> {
            String field = name.asText();
            if (!IDS.contains(field) && !asked.contains(field) && !required.contains(field)) required.add(field);
        });
        if (required.isEmpty()) {
            schema.remove("required");
        } else {
            ArrayNode list = schema.putArray("required");
            required.forEach(list::add);
        }
        return mapper.convertValue(schema, MAP);
    }

    /**
     * Ce qu'il manque au geste (R115), dans une seule carte de deux questions au plus (décision du CEO, 05/11/2026) :
     * l'issue, résolue parmi ce que la personne voit ou demandée avec les issues de l'écran en choix ; un texte qui
     * manque (le commentaire), en réponse libre ; puis ce que le geste demande lui-même avant d'écrire (créer un projet :
     * son nom et où vit son code), sur les arguments sans les mots que le modèle a mis à la place de ceux de la personne.
     */
    @Override public Map<String, Object> ask(Map<String, Object> args, AgentContext ctx) {
        List<Question> asked = new ArrayList<>();
        JsonNode resolved;
        try {
            resolved = resolved(args, ctx);
        } catch (QuestionNeeded needed) {
            asked.addAll(needed.questions());
            resolved = mapper.valueToTree(args == null ? Map.of() : args);
        }
        ObjectNode own = resolved.deepCopy();
        Map<String, Question.Choice> proposed = new LinkedHashMap<>();
        for (McpTool.Need need : tool.needs()) {
            JsonNode value = resolved.path(need.field());
            boolean missing = value.isMissingNode() || value.isNull() || (value.isTextual() && value.asText().isBlank());
            // Un nom que la demande ne dit pas, le modèle l'a inventé (« Web Application » pour « crée un projet Next.js »,
            // qwen3:8b, 04/11/2026) : TaskForce le demande, la proposition du modèle en suggestion.
            if (need.ownWords() && !missing && ctx.request() != null && !said(value.asText(), ctx.request())) {
                String word = value.asText().strip();
                proposed.put(need.field(), Question.Choice.of(word, word, "Cortex's suggestion: your request gives none"));
                own.remove(need.field());
                continue;
            }
            if (!need.isAsked() || need.when() != null || ISSUE.equals(need.field())) continue;
            if (missing) asked.add(Question.free(need.field(), need.header(), need.question()));
        }
        if (tool.asker() != null) {
            for (Question question : tool.asker().ask(ctx.slug(), ctx.userId(), own)) {
                Question.Choice suggestion = proposed.remove(question.field());
                asked.add(suggestion == null ? question : question.suggesting(suggestion));
            }
        }
        // Une proposition que le geste ne redemande pas : TaskForce la demande lui-même, la proposition en choix.
        proposed.forEach((field, suggestion) -> tool.needs().stream().filter(need -> need.field().equals(field))
            .findFirst().ifPresent(need -> asked.add(Question.of(field, need.header(), need.question(), List.of(suggestion)))));
        if (!asked.isEmpty()) throw new QuestionNeeded(asked);
        return mapper.convertValue(resolved, MAP);
    }

    /** La valeur se lit dans la demande, sans la casse, les accents, les espaces ni la ponctuation. */
    private static boolean said(String value, String request) {
        String wanted = IssueFields.key(value);
        return !wanted.isEmpty() && IssueFields.key(request).contains(wanted);
    }

    @Override public Done perform(Map<String, Object> args, AgentContext ctx) {
        JsonNode resolved = resolved(args, ctx);
        Object value = DelegatedAgent.actingAs(IssueGestures.CORTEX,
            () -> tool.handler().call(ctx.slug(), ctx.userId(), resolved));
        if (value instanceof IssueGestures.Gesture gesture) {
            return new Done(gesture.summary(), gesture.issue(), gesture.undo());
        }
        return new Done(write(value), null, null);
    }

    @Override public Done preview(Map<String, Object> args, AgentContext ctx) {
        JsonNode resolved = resolved(args, ctx);
        IssueGestures.Gesture gesture = gestures.preview(tool.name(), ctx.slug(), ctx.userId(), resolved);
        return gesture == null ? null : new Done(gesture.summary(), gesture.issue(), null);
    }

    /**
     * Les arguments avec les ids de l'issue, pour un geste qui en touche une : nommée par sa clé, ou par ce que la
     * personne lit à l'écran ; sinon la question de TaskForce, avec les issues de l'écran. Les autres gestes les gardent.
     * Pour supprimer, la colonne que la demande nomme désigne l'issue, plutôt que le titre que le modèle a choisi.
     */
    private JsonNode resolved(Map<String, Object> args, AgentContext ctx) {
        JsonNode named = mapper.valueToTree(args == null ? Map.of() : args);
        McpTool.Need issue = tool.needs().stream().filter(need -> ISSUE.equals(need.field())).findFirst().orElse(null);
        if (issue == null) return gestures.withIds(ctx.slug(), ctx.userId(), named);
        String request = IssueGestures.NAMED_BY_COLUMN.contains(tool.name()) ? ctx.request() : null;
        return gestures.issueOf(ctx.slug(), ctx.userId(), ctx.screen(), named, issue.question(), request);
    }

    private String write(Object value) {
        try {
            return mapper.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Tool result not serializable", e);
        }
    }
}
