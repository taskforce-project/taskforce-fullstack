package com.taskforce.tf_api.core.harness.rules;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.Optional;

import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.taskforce.tf_api.core.model.HarnessRuleSet;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.HarnessRuleSetRepository;

/**
 * Le paquet de règles que reçoit un runner pour une mission (spécification de la v2, §6.4) : la dernière version des
 * règles de l'espace, ou la table par défaut, dont chaque règle a pour propriétaire celui de l'espace (invariant 8).
 * Son empreinte ({@link RulesDigest}) se recalcule chez le runner, qui refuse un paquet qui ne s'y accorde pas.
 */
@Service
public class HarnessRulesService {

    static final String DEFAULT_RESOURCE = "harness/default.rules.json";
    static final String OWNER_PLACEHOLDER = "workspace-owner";

    private static final ObjectMapper JSON = new ObjectMapper();

    private final HarnessRuleSetRepository repository;
    private final ArrayNode defaultRules;

    public HarnessRulesService(HarnessRuleSetRepository repository) {
        this.repository = repository;
        this.defaultRules = loadDefaultRules();
    }

    @Transactional(readOnly = true)
    public RulesBundle bundleFor(Workspace workspace) {
        ObjectNode bundle = JSON.createObjectNode();
        bundle.put("format", RulesBundle.FORMAT);
        bundle.put("workspace", workspace.getSlug());
        bundle.putNull("project");
        Optional<HarnessRuleSet> latest = repository.findFirstByWorkspaceIdOrderByVersionDesc(workspace.getId());
        if (latest.isPresent()) {
            bundle.put("version", latest.get().getVersion());
            bundle.set("rules", JSON.valueToTree(latest.get().getRules()));
        } else {
            bundle.put("version", 1);
            bundle.set("rules", ownedBy(workspace.getOwner().getEmail()));
        }
        bundle.put("digest", RulesDigest.of(bundle));
        return JSON.convertValue(bundle, RulesBundle.class);
    }

    private ArrayNode ownedBy(String owner) {
        ArrayNode rules = defaultRules.deepCopy();
        for (JsonNode rule : rules) {
            if (OWNER_PLACEHOLDER.equals(rule.path("owner").asText())) {
                ((ObjectNode) rule).put("owner", owner);
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
