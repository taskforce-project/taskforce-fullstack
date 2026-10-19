package com.taskforce.tf_api.core.service.agent.tools;

import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Component;

import com.taskforce.tf_api.core.model.KnowledgeNode;
import com.taskforce.tf_api.core.service.agent.AgentContext;
import com.taskforce.tf_api.core.service.agent.AgentTool;
import com.taskforce.tf_api.core.service.brain.BrainSearchService;

import lombok.RequiredArgsConstructor;

/** Outil : recherche sémantique dans la mémoire (Brain OS) du workspace. */
@Component
@RequiredArgsConstructor
public class SearchBrainTool implements AgentTool {

    private final BrainSearchService search;

    @Override public String name() { return "search_brain"; }

    @Override public String description() {
        return "Searches the knowledge memory (Brain OS) of the workspace: decisions, ADRs, runbooks, "
            + "notes. Use it to ground an answer in the real context.";
    }

    @Override public Map<String, Object> parametersSchema() {
        return Map.of(
            "type", "object",
            "properties", Map.of(
                "query", Map.of("type", "string", "description", "The search query"),
                "topK", Map.of("type", "integer", "description", "Number of results (default 5)")
            ),
            "required", List.of("query")
        );
    }

    @Override public String execute(Map<String, Object> args, AgentContext ctx) {
        String query = String.valueOf(args.getOrDefault("query", ""));
        int topK = args.get("topK") instanceof Number n ? n.intValue() : 5;
        List<KnowledgeNode> hits = search.retrieveRelevant(ctx.workspaceId(), query, topK);
        if (hits.isEmpty()) return "No relevant note found.";
        StringBuilder sb = new StringBuilder("Relevant notes:\n");
        for (KnowledgeNode n : hits) {
            sb.append("- [").append(n.getDomain()).append("] ").append(n.getTitle());
            String c = n.getContent();
            if (c != null && !c.isBlank()) {
                String snippet = (c.length() > 200 ? c.substring(0, 200) + "…" : c).replace("\n", " ");
                sb.append(": ").append(snippet);
            }
            sb.append("\n");
        }
        return sb.toString();
    }
}
