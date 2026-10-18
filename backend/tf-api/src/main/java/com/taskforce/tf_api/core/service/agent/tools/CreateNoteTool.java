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
        return "Creates a note in the Brain OS of the workspace. Pick a domain (PROJET, PRODUIT, "
            + "ARCHITECTURE, ENGINEERING, API, INFRA, SECURITE, OPERATIONS, AUDITS, RUNBOOKS, PCA_PRA, "
            + "DECISIONS, ROADMAP, DESIGN, UTILISATEUR, HISTORIQUE) and a type (ADR, DECISION, RUNBOOK, "
            + "SOP, FINDING, DOC, SPEC, NOTE). Use [[Title]] to link notes and #tags to classify them.";
    }

    @Override public Map<String, Object> parametersSchema() {
        return Map.of(
            "type", "object",
            "properties", Map.of(
                "domain",  Map.of("type", "string", "description", "Domain (e.g. DECISIONS)"),
                "type",    Map.of("type", "string", "description", "Note type (e.g. DECISION)"),
                "title",   Map.of("type", "string", "description", "Short, clear title"),
                "content", Map.of("type", "string", "description", "Markdown content"),
                "tags",    Map.of("type", "array", "items", Map.of("type", "string"), "description", "Optional tags")
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
        return "Note created: \"" + node.getTitle() + "\" in " + node.getDomain() + " (id " + node.getId() + ").";
    }
}
