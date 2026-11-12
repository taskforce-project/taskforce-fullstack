package com.taskforce.tf_api.modules.storage.service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Component;

import com.taskforce.tf_api.core.service.agent.AgentContext;
import com.taskforce.tf_api.core.service.agent.CortexGesture;
import com.taskforce.tf_api.modules.storage.domain.StorageKind;
import com.taskforce.tf_api.modules.storage.domain.StorageTarget;
import com.taskforce.tf_api.modules.storage.domain.StoredDocument;

import lombok.RequiredArgsConstructor;

/**
 * Cortex range un document qu'il a écrit (un compte rendu, une synthèse, un plan) là où l'espace, ou son projet, l'a
 * choisi (séance n°22, R156).
 *
 * <p>Ranger hors de la conversation est une sortie (R93) : l'outil se juge comme une écriture dans un outil de
 * l'entreprise ({@code mcp.write}), quelle que soit la cible. La table demande, et le socle garde la sortie d'un agent
 * pour une personne (R157) : Cortex propose une carte et rien ne s'écrit avant l'accord. La carte porte ce qui sera écrit
 * et où ({@link #ask}) ; à l'accord, un endroit qui a changé depuis est refusé.</p>
 */
@Component
@RequiredArgsConstructor
public class SaveDocumentTool implements CortexGesture {

    public static final String NAME = "save_document";

    private final DocumentStorageService storage;
    private final StorageTargetService targets;

    @Override
    public String name() {
        return NAME;
    }

    @Override
    public String description() {
        return "Save a document you wrote for the person (a report, minutes, a summary, a plan) where this workspace "
            + "or its project keeps TaskForce's documents: TaskForce, a folder on the computer, Google Drive, OneDrive "
            + "or SharePoint. Call it only when the person asks to save, store or file a document. The person approves it "
            + "before anything is saved.";
    }

    @Override
    public Map<String, Object> parametersSchema() {
        Map<String, Object> props = new LinkedHashMap<>();
        props.put("title", Map.of("type", "string", "description", "The document's title, also its file name"));
        props.put("content", Map.of("type", "string", "description", "The whole document, in Markdown"));
        props.put("projectId", Map.of("type", "integer",
            "description", "The project the document belongs to, when it belongs to one"));
        return Map.of("type", "object", "properties", props, "required", List.of("title", "content"));
    }

    /** Ranger hors de la conversation : une sortie, jugée comme une écriture chez l'entreprise. */
    @Override
    public String action() {
        return "mcp.write";
    }

    /** La carte : le titre, le texte, le projet, et l'endroit où il ira, que l'accord reprend tel quel. */
    @Override
    public Map<String, Object> ask(Map<String, Object> args, AgentContext ctx) {
        Long projectId = projectOf(args, ctx);
        StorageTarget target = targets.effective(ctx.workspaceId(), projectId).target();
        Map<String, Object> card = new LinkedHashMap<>();
        card.put("title", text(args.get("title")));
        card.put("content", text(args.get("content")));
        if (projectId != null) card.put("projectId", projectId);
        card.put("storage", target.getKind().wire());
        String folder = folderOf(target);
        if (folder != null) card.put("folder", folder);
        card.put("place", target.place());
        return card;
    }

    /** Ce que la carte annonce, pour le modèle : où le document ira, une fois accordé. */
    @Override
    public Done preview(Map<String, Object> args, AgentContext ctx) {
        StorageKind kind = StorageKind.of(text(args.getOrDefault("storage", "server")));
        return new Done("It will be saved " + where(kind, text(args.get("folder"))) + ".", null, null);
    }

    @Override
    public Done perform(Map<String, Object> args, AgentContext ctx) {
        StoredDocument doc = storage.save(ctx, new DocumentStorageService.SaveRequest(projectOf(args, ctx),
            text(args.get("title")), text(args.get("content")), text(args.get("place")), "cortex"));
        StringBuilder out = new StringBuilder("Saved \"").append(doc.getTitle()).append("\" ");
        if (doc.getKind() == StorageKind.MACHINE) out.append("on this computer: ").append(doc.getLocation());
        else out.append(where(doc.getKind(), doc.getFolderName()));
        out.append('.');
        if (doc.getWebUrl() != null) out.append(" Link: ").append(doc.getWebUrl()).append('.');
        if (doc.getVersion() != null) out.append(" Version: ").append(doc.getVersion()).append('.');
        return new Done(out.toString(), null, null);
    }

    // -------------------------------------------------------------------------

    /** Où le document vit, dans les mots de la personne. */
    static String where(StorageKind kind, String folder) {
        return switch (kind) {
            case SERVER -> "in TaskForce";
            case MACHINE -> "on this computer" + (folder == null ? "" : ", in " + folder);
            case GOOGLE_DRIVE -> "to Google Drive" + (folder == null ? "" : ", in " + folder);
            case ONEDRIVE -> "to OneDrive or SharePoint" + (folder == null ? "" : ", in " + folder);
        };
    }

    private static String folderOf(StorageTarget target) {
        if (target.getKind() == StorageKind.MACHINE) return target.getLocalPath();
        return target.getFolderName();
    }

    private static Long projectOf(Map<String, Object> args, AgentContext ctx) {
        Object raw = args == null ? null : args.get("projectId");
        if (raw instanceof Number n) return n.longValue();
        if (raw instanceof String s && s.strip().matches("\\d{1,18}")) return Long.parseLong(s.strip());
        return ctx.project();
    }

    private static String text(Object value) {
        return value == null ? null : value.toString();
    }
}
