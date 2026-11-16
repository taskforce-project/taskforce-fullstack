package com.taskforce.tf_api.core.service.process;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.dto.response.ProcessResponse;
import com.taskforce.tf_api.core.enums.ProjectRole;
import com.taskforce.tf_api.core.harness.rules.HarnessRulesService;
import com.taskforce.tf_api.core.harness.rules.HarnessRulesService.Work;
import com.taskforce.tf_api.core.harness.rules.RulesBundle;
import com.taskforce.tf_api.core.harness.rules.RulesEngine;
import com.taskforce.tf_api.core.harness.rules.RulesFloor;
import com.taskforce.tf_api.core.model.ProcessDefinition;
import com.taskforce.tf_api.core.model.ProcessVersion;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.process.BpmnExport;
import com.taskforce.tf_api.core.process.BpmnImport;
import com.taskforce.tf_api.core.process.ProcessFingerprint;
import com.taskforce.tf_api.core.process.ProcessJson;
import com.taskforce.tf_api.core.process.ProcessModel;
import com.taskforce.tf_api.core.process.ProcessValidator;
import com.taskforce.tf_api.core.repository.ProcessDefinitionRepository;
import com.taskforce.tf_api.core.repository.ProcessVersionRepository;
import com.taskforce.tf_api.core.repository.ProjectMemberRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.AuditService;
import com.taskforce.tf_api.core.service.ProjectVisibilityGuard;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ForbiddenException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Les processus d'un projet (ADR-027, TF-J2-2) : les lire, les vérifier, lire un fichier BPMN, exporter une version, et
 * publier une version nouvelle. Le modèle est la forme de référence ; le vérificateur ({@link ProcessValidator}) juge
 * tout ce qui entre ; une publication écrit une version immuable, avec son auteur et son empreinte, comme une règle.
 *
 * <p>L'accès se vérifie ici (règle 3) : l'espace, puis le projet (une personne qui ne voit pas un projet privé n'en
 * reçoit rien, pas même son existence), puis le rôle. Tout ce qui voit le projet lit ses processus ; seuls le
 * responsable du projet et les propriétaires et administrateurs de l'espace publient, comme pour la couche des règles
 * du projet. Publier est un changement du harnais : le moteur des règles le juge comme celui des règles (une personne,
 * jamais un agent), et il entre au journal de l'espace.</p>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ProcessService {

    public static final String AUDIT_ACTION = "PROCESS_PUBLISHED";

    private final WorkspaceRepository workspaces;
    private final WorkspaceMemberRepository workspaceMembers;
    private final ProjectRepository projects;
    private final ProjectMemberRepository projectMembers;
    private final ProjectVisibilityGuard visibility;
    private final ProcessDefinitionRepository definitions;
    private final ProcessVersionRepository versions;
    private final UserRepository users;
    private final ProcessDefaults defaults;
    private final HarnessRulesService rules;
    private final AuditService audit;

    /** Un fichier à télécharger : son nom et son texte. */
    public record BpmnFile(String fileName, String xml) {
    }

    // ------------------------------------------------------------------------------------------------- lire

    @Transactional(readOnly = true)
    public ProcessResponse.Overview overview(String slug, Long projectId, Long userId) {
        Access access = access(slug, projectId, userId);
        List<ProcessDefinition> defs = definitions.findByProjectIdOrderByCreatedAtAscIdAsc(access.project().getId());
        Map<Long, List<ProcessVersionRepository.Row>> rows = versions.listRows(access.project().getId()).stream()
            .collect(Collectors.groupingBy(ProcessVersionRepository.Row::getDefinitionId, LinkedHashMap::new,
                Collectors.toList()));
        Map<Long, String> authors = authors(rows.values().stream().flatMap(List::stream)
            .map(ProcessVersionRepository.Row::getAuthorId).filter(Objects::nonNull).collect(Collectors.toSet()));
        List<ProcessResponse.Summary> out = new ArrayList<>();
        for (ProcessDefinition def : defs) {
            List<ProcessVersionRepository.Row> own = rows.getOrDefault(def.getId(), List.of());
            if (own.isEmpty()) {
                continue;
            }
            ProcessVersionRepository.Row current = own.get(0);
            out.add(new ProcessResponse.Summary(def.getProcessKey(), current.getName(), current.getVersion(),
                current.getDigest(), authors.get(current.getAuthorId()), current.getCreatedAt(), own.size()));
        }
        return new ProcessResponse.Overview(out, access.canPublish());
    }

    @Transactional(readOnly = true)
    public ProcessResponse.Detail detail(String slug, Long projectId, String key, Long userId) {
        Access access = access(slug, projectId, userId);
        ProcessDefinition def = definition(access, key);
        ProcessVersion current = versions.findFirstByDefinitionIdOrderByVersionDesc(def.getId())
            .orElseThrow(() -> new ResourceNotFoundException("Process not found"));
        List<ProcessVersionRepository.Row> rows = versions.listRows(access.project().getId()).stream()
            .filter(r -> def.getId().equals(r.getDefinitionId())).toList();
        Map<Long, String> authors = authors(rows.stream().map(ProcessVersionRepository.Row::getAuthorId)
            .filter(Objects::nonNull).collect(Collectors.toSet()));
        List<ProcessResponse.VersionSummary> all = rows.stream()
            .map(r -> new ProcessResponse.VersionSummary(r.getVersion(), r.getName(), r.getDigest(),
                authors.get(r.getAuthorId()), r.getCreatedAt()))
            .toList();
        return new ProcessResponse.Detail(def.getProcessKey(), view(def.getProcessKey(), current), all,
            access.canPublish());
    }

    @Transactional(readOnly = true)
    public ProcessResponse.Version version(String slug, Long projectId, String key, int version, Long userId) {
        Access access = access(slug, projectId, userId);
        ProcessDefinition def = definition(access, key);
        return view(def.getProcessKey(), versions.findByDefinitionIdAndVersion(def.getId(), version)
            .orElseThrow(() -> new ResourceNotFoundException("This version of the process doesn't exist.")));
    }

    /** L'export BPMN 2.0 d'une version ; le dessin se calcule, le modèle reste celui de la version. */
    @Transactional(readOnly = true)
    public BpmnFile export(String slug, Long projectId, String key, int version, Long userId) {
        ProcessResponse.Version v = version(slug, projectId, key, version, userId);
        return new BpmnFile(BpmnExport.fileName(v.key(), v.version()), BpmnExport.toXml(v.model()));
    }

    // ------------------------------------------------------------------------------------------------- vérifier

    /** Le vérificateur sur un processus, contre la version en vigueur de sa clé ; rien n'est écrit. */
    @Transactional(readOnly = true)
    public ProcessResponse.Check check(String slug, Long projectId, ProcessModel model, Long userId) {
        Access access = access(slug, projectId, userId);
        ProcessModel candidate = withFormat(model);
        List<ProcessValidator.Problem> problems = ProcessValidator.check(candidate,
            context(access, candidate.key(), current(access, candidate.key()).map(this::modelOf).orElse(null)));
        return check(candidate, problems);
    }

    /** Lit un fichier BPMN 2.0 dans le modèle, et le vérifie ; rien n'est publié. */
    @Transactional(readOnly = true)
    public ProcessResponse.Import importBpmn(String slug, Long projectId, String xml, Long userId) {
        Access access = access(slug, projectId, userId);
        BpmnImport.Result read;
        try {
            read = BpmnImport.read(xml);
        } catch (BpmnImport.Unreadable e) {
            return new ProcessResponse.Import(false, null, null,
                List.of(new ProcessResponse.Problem("unreadable", null, null, e.getMessage())), List.of());
        }
        ProcessModel model = read.model();
        List<ProcessValidator.Problem> problems = ProcessValidator.check(model,
            context(access, model.key(), current(access, model.key()).map(this::modelOf).orElse(null)), read.foreign());
        ProcessResponse.Check check = check(model, problems);
        return new ProcessResponse.Import(check.passed(), check.digest(), model, check.problems(), read.notes());
    }

    // ------------------------------------------------------------------------------------------------- publier

    /**
     * Publie une version nouvelle d'un processus du projet, la première si sa clé est nouvelle : le vérificateur passe
     * (les étapes verrouillées de la version en vigueur et du workflow par défaut d'où il dérive restent), quelque chose
     * a changé depuis la version en vigueur, et le moteur des règles laisse la personne changer le harnais.
     */
    @Transactional
    public ProcessResponse.Publication publish(String slug, Long projectId, ProcessModel model, Long userId) {
        Access access = access(slug, projectId, userId);
        if (!access.canPublish()) {
            throw new ForbiddenException("Only the project's lead, or an owner or admin of the workspace, can publish "
                + "its processes.");
        }
        ProcessModel candidate = withFormat(model);
        Optional<ProcessVersion> current = current(access, candidate.key());
        List<ProcessValidator.Problem> problems = new ArrayList<>(ProcessValidator.check(candidate,
            context(access, candidate.key(), current.map(this::modelOf).orElse(null))));
        // L'empreinte d'un processus refusé ne se calcule pas ici : il peut être trop profond pour être parcouru.
        String digest = problems.isEmpty() ? ProcessFingerprint.of(candidate) : null;
        if (digest != null && current.isPresent() && digest.equals(current.get().getDigest())) {
            problems.add(new ProcessValidator.Problem("unchanged", null, null, "Nothing changed since version "
                + current.get().getVersion() + ": there is nothing to publish."));
        }
        if (!problems.isEmpty()) {
            return new ProcessResponse.Publication(null, check(candidate, problems));
        }
        judge(access.workspace(), userId);
        LocalDateTime now = LocalDateTime.now();
        User author = users.getReferenceById(userId);
        try {
            ProcessDefinition def = definitions.findByProjectIdAndProcessKey(access.project().getId(), candidate.key())
                .orElseGet(() -> definitions.saveAndFlush(ProcessDefinition.builder()
                    .workspace(access.workspace())
                    .project(access.project())
                    .processKey(candidate.key())
                    .createdBy(author)
                    .createdAt(now)
                    .build()));
            ProcessVersion row = versions.saveAndFlush(ProcessVersion.builder()
                .definition(def)
                .version(current.map(v -> v.getVersion() + 1).orElse(1))
                .name(candidate.name())
                .model(ProcessJson.toMap(candidate))
                .digest(digest)
                .createdBy(author)
                .createdAt(now)
                .build());
            Map<String, Object> details = new LinkedHashMap<>();
            details.put("project", access.project().getId());
            details.put("key", candidate.key());
            details.put("version", row.getVersion());
            details.put("digest", digest);
            if (candidate.derivedFrom() != null) {
                details.put("derivedFrom", candidate.derivedFrom());
            }
            audit.recordAfterCommit(access.workspace().getId(), userId, AUDIT_ACTION, "process_version",
                String.valueOf(row.getId()), details);
            return new ProcessResponse.Publication(view(candidate.key(), row), null);
        } catch (DataIntegrityViolationException e) {
            throw new BusinessException("The process changed while you were publishing it. Read it again, then "
                + "publish.");
        }
    }

    // ------------------------------------------------------------------------------------------------- par défaut

    public List<ProcessResponse.Default> defaults(String slug, Long userId) {
        workspace(slug, userId);
        return defaults.all().stream().map(ProcessService::defaultView).toList();
    }

    public BpmnFile exportDefault(String slug, String key, Long userId) {
        workspace(slug, userId);
        ProcessModel model = defaults.get(key)
            .orElseThrow(() -> new ResourceNotFoundException("This default workflow doesn't exist."));
        return new BpmnFile(BpmnExport.fileName(model.key(), null), BpmnExport.toXml(model));
    }

    private static ProcessResponse.Default defaultView(ProcessModel model) {
        return new ProcessResponse.Default(model.key(), model.name(), model.description(),
            ProcessFingerprint.of(model), model);
    }

    // ------------------------------------------------------------------------------------------------- accès

    /** L'espace, puis le projet, puis le rôle : ce que la personne voit et ce qu'elle peut publier. */
    private record Access(Workspace workspace, Project project, boolean canPublish) {
    }

    private Workspace workspace(String slug, Long userId) {
        Workspace ws = workspaces.findBySlug(slug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace not found"));
        if (!workspaceMembers.existsByWorkspaceIdAndUserId(ws.getId(), userId)) {
            throw new ForbiddenException("Access denied: you're not a member of this workspace");
        }
        return ws;
    }

    private Access access(String slug, Long projectId, Long userId) {
        Workspace ws = workspace(slug, userId);
        Project project = projects.findByIdAndWorkspaceId(projectId, ws.getId())
            .orElseThrow(() -> new ResourceNotFoundException("Project not found"));
        // L'appartenance au projet d'abord : un projet privé qu'on ne voit pas reste introuvable.
        visibility.assertCanView(project, userId);
        boolean canPublish = visibility.isWorkspaceAdmin(ws.getId(), userId)
            || projectMembers.findByProjectIdAndUserId(project.getId(), userId)
                .map(m -> m.getRole() == ProjectRole.LEAD).orElse(false);
        return new Access(ws, project, canPublish);
    }

    private ProcessDefinition definition(Access access, String key) {
        return definitions.findByProjectIdAndProcessKey(access.project().getId(), key)
            .orElseThrow(() -> new ResourceNotFoundException("Process not found"));
    }

    private Optional<ProcessVersion> current(Access access, String key) {
        if (key == null) {
            return Optional.empty();
        }
        return definitions.findByProjectIdAndProcessKey(access.project().getId(), key)
            .flatMap(d -> versions.findFirstByDefinitionIdOrderByVersionDesc(d.getId()));
    }

    /** Publier est un changement du harnais : le moteur le juge comme celui des règles, avec le socle. */
    private void judge(Workspace ws, Long userId) {
        RulesBundle bundle = rules.bundleFor(ws, new Work(null, null, userId));
        RulesEngine.Decision decision = RulesEngine.decide(bundle, Map.of("action", RulesEngine.HARNESS_CHANGE,
            "actor", "person"));
        if (!RulesEngine.ALLOW.equals(decision.effect())) {
            throw new ForbiddenException(decision.rule() == null
                ? "Your workspace's rules don't let you publish a process." : decision.rule().reason());
        }
    }

    /**
     * Ce que le vérificateur sait de l'endroit où le processus entre : la version en vigueur de sa clé, les workflows
     * par défaut, les règles qui s'appliquent au travail du projet sous ce processus (le paquet de ce travail, et le
     * socle ; jamais les couches d'un autre projet ou d'un autre processus), celles d'entre elles qui laissent un agent
     * changer le code, et les personnes de l'espace.
     */
    private ProcessValidator.Context context(Access access, String key, ProcessModel current) {
        Set<String> known = new HashSet<>();
        Set<String> code = new HashSet<>();
        RulesBundle bundle = rules.bundleFor(access.workspace(), new Work(access.project().getId(), key, null));
        bundle.rules().forEach(r -> {
            known.add(r.id());
            // Une règle qui permet ou demande d'écrire, de confier, de pousser du code ou d'ouvrir une demande de fusion.
            if (r.when() != null && ProcessValidator.CODE_ACTIONS.contains(r.when().action())
                && (RulesEngine.ALLOW.equals(r.effect()) || RulesEngine.ASK.equals(r.effect()))) {
                code.add(r.id());
            }
        });
        RulesFloor.RULES.forEach(r -> known.add(r.id()));
        Set<Long> members = workspaceMembers.findByWorkspaceId(access.workspace().getId()).stream()
            .map(m -> m.getUser().getId()).collect(Collectors.toSet());
        return new ProcessValidator.Context(current == null ? List.of() : List.of(current), defaults.byKey(), known,
            members, code);
    }

    // ------------------------------------------------------------------------------------------------- vues

    private ProcessModel modelOf(ProcessVersion version) {
        return ProcessJson.fromMap(version.getModel());
    }

    private ProcessResponse.Version view(String key, ProcessVersion row) {
        ProcessModel model = modelOf(row);
        return new ProcessResponse.Version(key, row.getVersion(), row.getName(), row.getDigest(),
            nameOf(row.getCreatedBy()), row.getCreatedAt(), model.derivedFrom(), model);
    }

    /** Le résultat d'une vérification ; l'empreinte, sauf pour un modèle sans clé ou trop profond pour être parcouru. */
    private static ProcessResponse.Check check(ProcessModel model, List<ProcessValidator.Problem> problems) {
        String digest = model.key() == null || ProcessValidator.depth(model) > ProcessValidator.MAX_DEPTH ? null
            : ProcessFingerprint.of(model);
        return new ProcessResponse.Check(problems.isEmpty(), digest, problems.stream()
            .map(p -> new ProcessResponse.Problem(p.code(), p.stepId(), p.step(), p.message())).toList());
    }

    private static ProcessModel withFormat(ProcessModel model) {
        if (model.format() != null) {
            return model;
        }
        return new ProcessModel(ProcessModel.FORMAT, model.key(), model.name(), model.description(),
            model.derivedFrom(), model.steps(), model.flows());
    }

    private Map<Long, String> authors(Set<Long> ids) {
        Map<Long, String> out = new LinkedHashMap<>();
        if (!ids.isEmpty()) {
            users.findAllById(ids).forEach(u -> out.put(u.getId(), nameOf(u)));
        }
        return out;
    }

    private static String nameOf(User user) {
        if (user == null) {
            return null;
        }
        return user.getDisplayName() == null || user.getDisplayName().isBlank() ? user.getEmail() : user.getDisplayName();
    }
}
