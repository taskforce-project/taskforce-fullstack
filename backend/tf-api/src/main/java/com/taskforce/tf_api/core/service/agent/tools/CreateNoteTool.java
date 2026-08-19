package com.taskforce.tf_api.core.service.agent.tools;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Component;

import com.taskforce.tf_api.core.dto.request.CreateKnowledgeNodeRequest;
import com.taskforce.tf_api.core.dto.response.KnowledgeNodeResponse;
import com.taskforce.tf_api.core.service.KnowledgeService;
import com.taskforce.tf_api.core.service.agent.AgentContext;
import com.taskforce.tf_api.core.service.agent.AgentTool;

import lombok.RequiredArgsConstructor;

/**
 * Outil de <b>write-back</b> : l'agent crée une note dans le Brain OS (en suivant les règles
 * AGENTS : bon domaine, bon type). C'est ce qui fait « vivre » la mémoire (le cerveau grandit).
 */
@Component
@RequiredArgsConstructor
public class CreateNoteTool implements AgentTool {

    private final KnowledgeService knowledgeService;

    @Override public String name() { return "create_note"; }

    @Override public String description() {
        return "Crée une note dans le Brain OS du workspace. Choisir un domaine (PROJET, PRODUIT, "
            + "ARCHITECTURE, ENGINEERING, API, INFRA, SECURITE, OPERATIONS, AUDITS, RUNBOOKS, PCA_PRA, "
            + "DECISIONS, ROADMAP, DESIGN, UTILISATEUR, HISTORIQUE) et un type (ADR, DECISION, RUNBOOK, "
            + "SOP, FINDING, DOC, SPEC, NOTE). Utiliser [[Titre]] pour lier et #tags pour classer.";
    }

    @Override public Map<String, Object> parametersSchema() {
        return Map.of(
            "type", "object",
            "properties", Map.of(
                "domain",  Map.of("type", "string", "description", "Domaine (ex. DECISIONS)"),
                "type",    Map.of("type", "string", "description", "Type de note (ex. DECISION)"),
                "title",   Map.of("type", "string", "description", "Titre court et clair"),
                "content", Map.of("type", "string", "description", "Contenu markdown"),
                "tags",    Map.of("type", "array", "items", Map.of("type", "string"), "description", "Tags optionnels")
            ),
            "required", List.of("domain", "type", "title")
        );
    }

    @Override public String execute(Map<String, Object> args, AgentContext ctx) {
        CreateKnowledgeNodeRequest req = new CreateKnowledgeNodeRequest();
        req.setDomain(String.valueOf(args.get("domain")));
        req.setType(String.valueOf(args.get("type")));
        req.setTitle(String.valueOf(args.get("title")));
        req.setContent(args.get("content") != null ? String.valueOf(args.get("content")) : null);
        if (args.get("tags") instanceof List<?> raw) {
            List<String> tags = new ArrayList<>();
            for (Object o : raw) if (o != null) tags.add(o.toString());
            req.setTags(tags);
        }
        KnowledgeNodeResponse node = knowledgeService.createNode(ctx.slug(), ctx.userId(), req);
        return "Note créée : « " + node.getTitle() + " » dans " + node.getDomain() + " (id " + node.getId() + ").";
    }
}
