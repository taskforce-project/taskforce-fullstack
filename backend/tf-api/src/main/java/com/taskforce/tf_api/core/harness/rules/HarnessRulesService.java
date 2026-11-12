package com.taskforce.tf_api.core.harness.rules;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.taskforce.tf_api.core.enums.RuleScope;
import com.taskforce.tf_api.core.model.HarnessRuleSet;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.HarnessRuleSetRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;

/**
 * Le paquet de règles d'un travail (spécification de la v2, §6.4 ; R157) : la table de TaskForce, dont chaque règle a
 * pour propriétaire celui de l'espace (invariant 8), et au-dessus, la version en vigueur de chaque couche de l'entreprise
 * qui s'applique au travail : celle de la personne, de son rôle, du processus, du projet, puis de l'organisation. Une
 * couche ne porte dans le paquet que ce qui durcit (demander, refuser) : même un moteur d'avant les couches n'en tire
 * rien de plus permissif. Son empreinte ({@link RulesDigest}) se recalcule chez le runner, qui refuse un paquet qui ne
 * s'y accorde pas.
 */
@Service
public class HarnessRulesService {

    static final String DEFAULT_RESOURCE = "harness/default.rules.json";
    static final String OWNER_PLACEHOLDER = "workspace-owner";

    /** L'ordre des couches dans le paquet : à effet égal, la plus précise l'emporte et sa raison se lit. */
    static final List<RuleScope> ORDER = List.of(RuleScope.PERSON, RuleScope.ROLE, RuleScope.PROCESS, RuleScope.PROJECT,
        RuleScope.WORKSPACE);

    /** Ce qu'une règle d'une couche porte dans le paquet ; ses cas restent avec la couche. */
    private static final List<String> ENGINE_FIELDS = List.of("id", "when", "class", "effect", "inverse", "owner",
        "reason", "review", "text", "require");
    private static final Set<String> CONDITIONS = Set.of("action", "tool", "command", "path", "branch",
        "repoVisibility", "server", "sensitivity", "actor", "over");
    private static final Set<String> REQUIRE = Set.of("approvers", "signatures", "separate");

    private static final ObjectMapper JSON = new ObjectMapper();

    private final HarnessRuleSetRepository repository;
    private final WorkspaceMemberRepository members;
    private final ArrayNode defaultRules;

    /**
     * Le travail que les règles jugent : son projet, son processus (TF-J2-2 ; aucun pour l'instant), et la personne pour
     * qui il se fait, la personne qui a délégué ou qui demande. Ce qu'on ne connaît pas reste nul : sa couche ne
     * s'applique pas.
     */
    public record Work(Long projectId, String process, Long personId) {
        public static final Work NONE = new Work(null, null, null);
    }

    /** Une couche de l'espace : sa portée, et ce qu'elle vise (le projet, le processus, le rôle, la personne). */
    public record LayerKey(RuleScope scope, String ref) {

        public static final LayerKey WORKSPACE = new LayerKey(RuleScope.WORKSPACE, null);

        public static LayerKey of(HarnessRuleSet set) {
            return switch (set.getScope()) {
                case WORKSPACE -> WORKSPACE;
                case PROJECT -> new LayerKey(RuleScope.PROJECT, String.valueOf(set.getProject().getId()));
                case PROCESS -> new LayerKey(RuleScope.PROCESS, set.getProcessKey());
                case ROLE -> new LayerKey(RuleScope.ROLE, set.getRole());
                case PERSON -> new LayerKey(RuleScope.PERSON, String.valueOf(set.getPerson().getId()));
            };
        }
    }

    /** Une version de couche telle que le paquet la lit : ses règles, son numéro, son empreinte. */
    public record LayerVersion(LayerKey key, int version, String digest, List<Map<String, Object>> rules) {
    }

    public HarnessRulesService(HarnessRuleSetRepository repository, WorkspaceMemberRepository members) {
        this.repository = repository;
        this.members = members;
        this.defaultRules = loadDefaultRules();
    }

    /** Le paquet de l'espace sans projet ni personne : la table et la couche de l'organisation. */
    @Transactional(readOnly = true)
    public RulesBundle bundleFor(Workspace workspace) {
        return bundleFor(workspace, Work.NONE);
    }

    /** Le paquet d'un travail : la table, puis chaque couche de l'entreprise qui s'y applique, dans sa version en vigueur. */
    @Transactional(readOnly = true)
    public RulesBundle bundleFor(Workspace workspace, Work work) {
        return build(workspace, work, roleOf(workspace, work.personId()), currentLayers(workspace.getId()));
    }

    /** La version en vigueur de chaque couche de l'espace. */
    @Transactional(readOnly = true)
    public Map<LayerKey, LayerVersion> currentLayers(Long workspaceId) {
        Map<LayerKey, LayerVersion> current = new LinkedHashMap<>();
        for (HarnessRuleSet set : repository.findByWorkspaceIdOrderByVersionDesc(workspaceId)) {
            LayerKey key = LayerKey.of(set);
            current.putIfAbsent(key, new LayerVersion(key, set.getVersion(), set.getDigest(), set.getRules()));
        }
        return current;
    }

    /** Le rôle de la personne dans l'espace ({@code OWNER}, {@code ADMIN}, {@code MEMBER}), ou null. */
    public String roleOf(Workspace workspace, Long personId) {
        if (personId == null) {
            return null;
        }
        return members.findByWorkspaceIdAndUserId(workspace.getId(), personId)
            .map(m -> m.getRole().name()).orElse(null);
    }

    /**
     * Le paquet de ces couches pour ce travail : celui qu'on remettrait si l'espace en était là. Sert au paquet en
     * vigueur comme à l'essai d'une règle avant qu'elle entre (ses cas, R98).
     */
    public RulesBundle build(Workspace workspace, Work work, String role, Map<LayerKey, LayerVersion> layers) {
        ObjectNode bundle = JSON.createObjectNode();
        bundle.put("format", RulesBundle.FORMAT);
        bundle.put("workspace", workspace.getSlug());
        if (work.projectId() == null) {
            bundle.putNull("project");
        } else {
            bundle.put("project", work.projectId());
        }
        bundle.put("version", 1);
        ArrayNode rules = bundle.putArray("rules");
        ArrayNode applied = JSON.createArrayNode();
        int version = 1;
        for (LayerVersion layer : applicable(work, role, layers)) {
            version = Math.max(version, layer.version());
            ObjectNode descriptor = applied.addObject();
            descriptor.put("scope", layer.key().scope().layer());
            if (layer.key().ref() != null) {
                descriptor.put("ref", layer.key().ref());
            }
            descriptor.put("version", layer.version());
            descriptor.put("digest", layer.digest() != null ? layer.digest() : digestOf(layer.rules()));
            for (Map<String, Object> rule : layer.rules()) {
                ObjectNode engine = engineRule(rule, layer.key().scope());
                if (engine != null) {
                    rules.add(engine);
                }
            }
        }
        rules.addAll(ownedBy(workspace.getOwner() == null ? null : workspace.getOwner().getEmail()));
        bundle.put("version", version);
        if (work.process() != null) {
            bundle.put("process", work.process());
        }
        if (!applied.isEmpty()) {
            bundle.set("layers", applied);
        }
        RulesBundle unsigned = JSON.convertValue(bundle, RulesBundle.class);
        String digest = RulesDigest.of(JSON.valueToTree(unsigned));
        return new RulesBundle(unsigned.format(), unsigned.workspace(), unsigned.project(), unsigned.version(), digest,
            unsigned.issuedAt(), unsigned.rules(), unsigned.process(), unsigned.layers());
    }

    /** L'empreinte des règles d'une version de couche : {@code sha256:} et le SHA-256 de leur JSON canonique. */
    public static String digestOf(List<Map<String, Object>> rules) {
        return RulesDigest.of(JSON.valueToTree(rules));
    }

    /** Les couches qui s'appliquent à ce travail, de la plus précise à la plus large. */
    static List<LayerVersion> applicable(Work work, String role, Map<LayerKey, LayerVersion> layers) {
        List<LayerVersion> out = new ArrayList<>();
        for (LayerVersion layer : layers.values()) {
            String ref = layer.key().ref();
            boolean applies = switch (layer.key().scope()) {
                case WORKSPACE -> true;
                case PROJECT -> work.projectId() != null && String.valueOf(work.projectId()).equals(ref);
                case PROCESS -> work.process() != null && work.process().equals(ref);
                case ROLE -> role != null && role.equals(ref);
                case PERSON -> work.personId() != null && String.valueOf(work.personId()).equals(ref);
            };
            if (applies && !layer.rules().isEmpty()) {
                out.add(layer);
            }
        }
        out.sort(Comparator.comparingInt(l -> ORDER.indexOf(l.key().scope())));
        return out;
    }

    /**
     * Une règle d'une couche telle que le moteur la lit : ses champs du contrat, sa couche, et rien de ce qui n'y est pas.
     * Une règle qui autorise ne durcit rien : elle n'entre pas dans le paquet (le moteur l'ignorerait de toute façon).
     * Une condition inconnue tombe : la règle couvre alors plus d'actions, ce qui ne fait que durcir.
     */
    static ObjectNode engineRule(Map<String, Object> stored, RuleScope scope) {
        Object effect = stored.get("effect");
        if (!RulesEngine.ASK.equals(effect) && !RulesEngine.DENY.equals(effect)) {
            return null;
        }
        JsonNode tree = JSON.valueToTree(stored);
        ObjectNode out = JSON.createObjectNode();
        for (String field : ENGINE_FIELDS) {
            JsonNode value = tree.get(field);
            if (value == null || value.isNull()) {
                continue;
            }
            if ("when".equals(field) && value.isObject()) {
                out.set("when", only(value, CONDITIONS));
            } else if ("require".equals(field)) {
                if (RulesEngine.ASK.equals(effect) && value.isObject()) {
                    out.set("require", only(value, REQUIRE));
                }
            } else {
                out.set(field, value);
            }
        }
        out.put("layer", scope.layer());
        return out;
    }

    private static ObjectNode only(JsonNode value, Set<String> keys) {
        ObjectNode out = JSON.createObjectNode();
        value.fields().forEachRemaining(f -> {
            if (keys.contains(f.getKey()) && !f.getValue().isNull()) {
                out.set(f.getKey(), f.getValue());
            }
        });
        return out;
    }

    /** La table de TaskForce, dont la personne propriétaire de l'espace répond. */
    public ArrayNode ownedBy(String owner) {
        ArrayNode rules = defaultRules.deepCopy();
        for (JsonNode rule : rules) {
            if (OWNER_PLACEHOLDER.equals(rule.path("owner").asText())) {
                ((ObjectNode) rule).put("owner", Objects.requireNonNullElse(owner, OWNER_PLACEHOLDER));
            }
        }
        return rules;
    }

    private static ArrayNode loadDefaultRules() {
        try (InputStream in = new ClassPathResource(DEFAULT_RESOURCE).getInputStream()) {
            return (ArrayNode) JSON.readTree(in).get("rules");
        } catch (IOException e) {
            throw new UncheckedIOException("Default harness rules missing: " + DEFAULT_RESOURCE, e);
        }
    }
}
