package com.taskforce.tf_api.core.service.delivery;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.enums.WorkspaceRole;
import com.taskforce.tf_api.core.harness.evidence.EvidenceSeal;
import com.taskforce.tf_api.core.harness.evidence.EvidenceSigner;
import com.taskforce.tf_api.core.model.MissionDossier;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.MissionDossierRepository;
import com.taskforce.tf_api.core.repository.MissionDossierSealRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.ProjectVisibilityGuard;
import com.taskforce.tf_api.shared.exception.ForbiddenException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;

/**
 * Qui lit le dossier d'une mission, et qui en efface un texte (TF-J2-7). Le dossier survit à son issue et à son projet :
 * tant que le projet existe, le lit qui voit le projet, comme avant ; quand il n'existe plus, la personne qui a délégué
 * la mission et les responsables de l'espace (propriétaire, administrateurs). Un texte gardé à côté de la chaîne s'efface
 * par ces mêmes personnes : la personne qui a délégué, ou un responsable de l'espace. Un dossier d'un autre espace
 * répond comme un dossier inexistant.
 */
@Service
@RequiredArgsConstructor
public class MissionDossierAccess {

    static final String NOT_FOUND = "This run has no evidence file";
    static final String LEGACY = "This record was written before TaskForce 1.18 and names people by their email: only an "
        + "owner or admin of the workspace can export it as JSON. The Markdown export hides the emails.";

    private final MissionEvidenceService evidence;
    private final ProjectRepository projects;
    private final ProjectVisibilityGuard visibilityGuard;
    private final WorkspaceMemberRepository members;
    private final UserRepository users;
    private final WorkspaceRepository workspaces;
    private final MissionDossierSealRepository seals;
    private final EvidenceSigner signer;
    private final MissionDossierRepository dossiers;

    private static final ObjectMapper JSON = new ObjectMapper();

    /** Le dossier en JSON ({@code taskforce-evidence/1}), en Markdown, ou son dernier sceau seul (l'enveloppe DSSE). */
    public enum Format { JSON, MARKDOWN, DSSE }

    @Transactional(readOnly = true)
    public Optional<String> export(String slug, Long runId, Long userId, Format format) {
        MissionDossier dossier = readable(slug, runId, userId);
        // Une chaîne d'avant la 1.18 nomme les personnes par leur courriel, et son sceau aussi : le JSON et l'enveloppe ne
        // s'exportent que pour un responsable de l'espace ; le Markdown, lui, les masque (R159, second tour, N4).
        if (format != Format.MARKDOWN && evidence.legacy(runId) && !manager(dossier, userId)) {
            throw new ForbiddenException(LEGACY);
        }
        return switch (format) {
            case JSON -> evidence.dossierJson(runId);
            case MARKDOWN -> evidence.dossierMarkdown(runId);
            case DSSE -> evidence.envelope(runId);
        };
    }

    /** Le dossier que désigne un lien du témoin : son espace et sa mission, pour ouvrir sa page. */
    public record Linked(String workspace, Long runId) {
    }

    /**
     * Ce que désigne le lien d'un témoin (R159, second tour, M-b) : le lien ne porte qu'un identifiant opaque du dossier, et
     * la page qu'il ouvre garde ses contrôles d'accès. La personne doit pouvoir lire le dossier, comme par son adresse dans
     * l'espace ; sinon, le lien répond comme un lien qui ne mène à rien, sans dire lequel.
     */
    @Transactional(readOnly = true)
    public Linked byLink(String linkId, Long userId) {
        MissionDossier dossier = linkId == null ? null : dossiers.findByLinkId(linkId).orElse(null);
        if (dossier == null || dossier.getWorkspace() == null) {
            throw new ResourceNotFoundException(NOT_FOUND);
        }
        try {
            readable(dossier.getWorkspace().getSlug(), dossier.getRunId(), userId);
        } catch (ForbiddenException e) {
            throw new ResourceNotFoundException(NOT_FOUND);
        }
        return new Linked(dossier.getWorkspace().getSlug(), dossier.getRunId());
    }

    /** Efface un texte du dossier ; sa chaîne et son sceau tiennent, et l'effacement s'y ajoute. */
    @Transactional
    public void eraseText(String slug, Long runId, String hash, Long userId) {
        MissionDossier dossier = readable(slug, runId, userId);
        if (!delegator(dossier, userId) && !manager(dossier, userId)) {
            throw new ForbiddenException("Only the person who delegated this mission, or an owner or admin of the workspace, can erase its texts.");
        }
        User person = users.findById(userId).orElseThrow(() -> new ResourceNotFoundException("User not found"));
        evidence.eraseText(runId, hash, person);
    }

    /** Une clé qui a scellé des dossiers de l'espace : sa clé publique et sa garde telles que son dernier sceau les dit. */
    public record UsedKey(String id, String publicKey, String custody, Boolean kept, String firstUsed, String lastUsed, long seals) {
    }

    /** La clé d'aujourd'hui, et celles qui ont scellé les dossiers de l'espace, la plus récente d'abord. */
    public record Keys(EvidenceSeal.Key current, List<UsedKey> used) {
    }

    /**
     * La clé qui scelle aujourd'hui (son identifiant, sa clé publique, sa garde), et les clés publiques qui ont déjà scellé
     * des dossiers de cet espace (R159, M3), tirées des sceaux en place avec leur premier et leur dernier usage : un sceau
     * d'avant un changement de clé se compare encore à la clé qui l'a fait. Rien de secret (chaque sceau porte sa clé),
     * mais la route vit sous l'espace : un membre de l'espace la lit.
     */
    @Transactional(readOnly = true)
    public Keys keys(String slug, Long userId) {
        Workspace workspace = member(slug, userId);
        List<UsedKey> used = new ArrayList<>();
        for (MissionDossierSealRepository.KeyUse use : seals.keysUsedIn(workspace.getId())) {
            JsonNode key = seals.lastEnvelopeOf(workspace.getId(), use.getKeyId())
                .map(envelope -> EvidenceSeal.open(parse(envelope)).statement())
                .map(statement -> statement.path("predicate").path("key")).orElse(null);
            used.add(new UsedKey(use.getKeyId(), key == null ? null : key.path("publicKey").asText(null),
                key == null ? null : key.path("custody").asText(null), key == null || !key.has("kept") ? null : key.get("kept").asBoolean(),
                use.getFirstUsed(), use.getLastUsed(), use.getSeals() == null ? 0 : use.getSeals()));
        }
        return new Keys(signer.key(), used);
    }

    private Workspace member(String slug, Long userId) {
        Workspace workspace = workspaces.findBySlug(slug).orElseThrow(() -> new ResourceNotFoundException("Workspace not found"));
        if (members.findByWorkspaceIdAndUserId(workspace.getId(), userId).isEmpty()) {
            throw new ForbiddenException("Access denied: you're not a member of this workspace");
        }
        return workspace;
    }

    private static JsonNode parse(String json) {
        try {
            return JSON.readTree(json);
        } catch (JsonProcessingException e) {
            return null;
        }
    }

    /**
     * Le dossier, si cette personne peut le lire. Elle doit être membre de son espace, vérifié ici et pas seulement par
     * l'intercepteur des routes (R159, L8) : la personne qui a délégué et qui a quitté l'espace ne le lit plus.
     */
    MissionDossier readable(String slug, Long runId, Long userId) {
        MissionDossier dossier = evidence.dossier(runId).orElseThrow(() -> new ResourceNotFoundException(NOT_FOUND));
        if (dossier.getWorkspace() == null || !slug.equals(dossier.getWorkspace().getSlug())) {
            throw new ResourceNotFoundException(NOT_FOUND);
        }
        if (members.findByWorkspaceIdAndUserId(dossier.getWorkspace().getId(), userId).isEmpty()) {
            throw new ForbiddenException("Access denied: you're not a member of this workspace");
        }
        Project project = dossier.getProjectId() == null ? null : projects.findById(dossier.getProjectId()).orElse(null);
        if (project != null) {
            visibilityGuard.assertCanView(project, userId);
            return dossier;
        }
        if (!delegator(dossier, userId) && !manager(dossier, userId)) {
            throw new ForbiddenException("This mission's project no longer exists: only the person who delegated it, "
                + "or an owner or admin of the workspace, can read its evidence.");
        }
        return dossier;
    }

    private static boolean delegator(MissionDossier dossier, Long userId) {
        return dossier.getDelegatedBy() != null && Objects.equals(dossier.getDelegatedBy().getId(), userId);
    }

    private boolean manager(MissionDossier dossier, Long userId) {
        return members.findByWorkspaceIdAndUserId(dossier.getWorkspace().getId(), userId)
            .map(m -> m.getRole() == WorkspaceRole.OWNER || m.getRole() == WorkspaceRole.ADMIN)
            .orElse(false);
    }
}
