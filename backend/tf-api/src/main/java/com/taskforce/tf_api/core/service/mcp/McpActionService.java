package com.taskforce.tf_api.core.service.mcp;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.harness.rules.RulesBundle;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.service.AuthorizationService;
import com.taskforce.tf_api.core.service.agent.AgentContext;
import com.taskforce.tf_api.core.service.agent.CortexGate;
import com.taskforce.tf_api.core.service.agent.CortexRecordService;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ForbiddenException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;
import com.taskforce.tf_api.shared.util.LogSafe;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * La console d'actions d'un outil connecté (TF-MCP-06), comme tout autre geste (séance n°22, R157 et R158 : « aucun
 * chemin hors du moteur de règles ») : l'outil est celui que la personne utilise, par sa connexion ; la demande entre
 * au dossier, puis la décision des règles de l'espace ; un refus ne fait rien ; une action demandée attend la
 * confirmation de la personne (le bouton de la console, ou l'accord de la carte de Cortex) ; le résultat entre au
 * dossier. Une écriture par une connexion partagée avec l'espace reste réservée aux propriétaires et administrateurs.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class McpActionService {

    /** Ce que la console a fait : {@code success}, {@code refused}, {@code confirm} (à confirmer), ou {@code error}. */
    public record ActionResult(String toolRef, String status, String output, String reason) {}

    private final WorkspaceMcpService workspaceMcp;
    private final CortexGate gate;
    private final CortexRecordService records;
    private final AuthorizationService authorization;
    private final ObjectMapper objectMapper;

    /**
     * Lance un outil de la console pour une personne. {@code confirmed} : la personne a confirmé, après avoir vu ce que
     * l'outil allait faire. Sans confirmation, une action que les règles demandent ne tourne pas : la réponse le dit
     * ({@code confirm}), avec la raison de la règle.
     */
    public ActionResult run(Workspace ws, Long userId, String toolRef, Map<String, Object> args, boolean confirmed) {
        AgentContext ctx = new AgentContext(ws.getSlug(), ws.getId(), userId);
        ExternalMcpTool tool = workspaceMcp.toolFor(ws.getId(), userId, toolRef)
            .orElseThrow(() -> new ResourceNotFoundException("This action is not available: " + toolRef));
        if (!tool.isReadOnly() && tool.shared() && !authorization.isManager(ws.getId(), userId)) {
            throw new ForbiddenException(
                "Only workspace owners and admins can change data through a connection shared with the workspace.");
        }
        Map<String, Object> arguments = args == null ? Map.of() : args;
        UUID record = records.open(ctx, "Action console: " + tool.originalName(), Map.of("via", "console"));
        append(record, "action.requested", CortexRecordService.Actor.person(userId),
            Map.of("tool", tool.name(), "arguments", CortexRecordService.shorten(json(arguments))));
        RulesBundle bundle = gate.rulesFor(ctx);
        CortexGate.Verdict verdict = gate.judge(bundle, tool);
        append(record, "action.decided", CortexRecordService.Actor.rule(verdict.ruleId()),
            Map.of("effect", verdict.effect(), "facts", verdict.facts()));
        if (verdict.denied()) {
            result(record, tool.name(), "refused", verdict.reason());
            return new ActionResult(toolRef, "refused", null, verdict.reason());
        }
        if (!verdict.allowed()) {
            if (!confirmed) {
                result(record, tool.name(), "pending", verdict.reason());
                return new ActionResult(toolRef, "confirm", null, verdict.reason());
            }
            append(record, "human.decision", CortexRecordService.Actor.person(userId),
                Map.of("tool", tool.name(), "decision", "approved",
                    "arguments", CortexRecordService.shorten(json(arguments))));
        }
        String output;
        try {
            output = tool.execute(arguments, ctx);
        } catch (RuntimeException e) {
            result(record, tool.name(), "error", e.getMessage());
            throw e;
        }
        result(record, tool.name(), "success", output);
        return new ActionResult(toolRef, "success", output, null);
    }

    // -------------------------------------------------------------------------

    /** Avant tout effet : sans dossier, l'action ne part pas. */
    private void append(UUID record, String type, CortexRecordService.Actor actor, Map<String, ?> data) {
        if (records.append(record, type, actor, data).isEmpty()) {
            throw new BusinessException("The record of this action is full, so it does not run.");
        }
    }

    /** Le résultat au dossier ; une panne ici ne défait pas ce qui a été fait. */
    private void result(UUID record, String tool, String status, String output) {
        try {
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("tool", tool);
            data.put("status", status);
            data.put("output", CortexRecordService.shorten(output));
            records.append(record, "action.result", CortexRecordService.Actor.SERVER, data);
        } catch (RuntimeException e) {
            log.warn("Console : resultat de {} non garde au dossier : {}", LogSafe.of(tool), LogSafe.of(e.getMessage()));
        }
    }

    private String json(Map<String, Object> args) {
        try {
            return objectMapper.writeValueAsString(args);
        } catch (Exception e) {
            return "{}";
        }
    }
}
