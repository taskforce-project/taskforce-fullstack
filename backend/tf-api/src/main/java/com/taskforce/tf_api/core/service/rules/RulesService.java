package com.taskforce.tf_api.core.service.rules;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.dto.request.RuleCheckRequest;
import com.taskforce.tf_api.core.dto.request.RuleDraftRequest;
import com.taskforce.tf_api.core.dto.response.RulesResponse;
import com.taskforce.tf_api.core.enums.ProjectRole;
import com.taskforce.tf_api.core.enums.RuleScope;
import com.taskforce.tf_api.core.enums.WorkspaceRole;
import com.taskforce.tf_api.core.harness.rules.HarnessRulesService;
import com.taskforce.tf_api.core.harness.rules.HarnessRulesService.LayerKey;
import com.taskforce.tf_api.core.harness.rules.HarnessRulesService.LayerVersion;
import com.taskforce.tf_api.core.harness.rules.HarnessRulesService.Work;
import com.taskforce.tf_api.core.harness.rules.RulesBundle;
import com.taskforce.tf_api.core.harness.rules.RulesEngine;
import com.taskforce.tf_api.core.harness.rules.RulesFloor;
import com.taskforce.tf_api.core.model.HarnessRuleSet;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.model.WorkspaceMember;
import com.taskforce.tf_api.core.repository.ConnectorConnectionRepository;
import com.taskforce.tf_api.core.repository.HarnessRuleSetRepository;
import com.taskforce.tf_api.core.repository.ProjectMemberRepository;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.service.AuditService;
import com.taskforce.tf_api.core.service.AuthorizationService;
import com.taskforce.tf_api.core.service.ProjectVisibilityGuard;
import com.taskforce.tf_api.core.service.brain.BrainAccessGuard;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ForbiddenException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Les règles de l'entreprise, par couches (R157, séance n°22 ; TF-J2-4). Une règle s'écrit en mots (R94), le modèle de
 * l'espace la traduit, puis TaskForce la vérifie sans lui : le format, le socle, et ses cas, rejoués avec ceux de toutes
 * les règles de l'espace (R98). Elle n'entre que si tout tient, dans une nouvelle version de sa couche, avec son auteur,
 * sa date et son empreinte ; ce geste d'une personne est jugé par le moteur et entre au journal de l'espace.
 *
 * <p>Qui écrit : les propriétaires et administrateurs de l'espace, partout ; le responsable d'un projet, la couche de ce
 * projet. Tout membre lit les règles, sauf celles d'un projet qu'il ne voit pas.</p>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class RulesService {

    public static final String AUDIT_ACTION = "RULES_CHANGED";
    static final int REVIEW_MONTHS = 6;
    private static final Pattern PROCESS_KEY = Pattern.compile("^[a-z0-9][a-z0-9-]{0,79}$");
    private static final Set<String> ROLES = Set.of("OWNER", "ADMIN", "MEMBER");
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final TypeReference<Map<String, Object>> MAP = new TypeReference<>() {};

    private final BrainAccessGuard access;
    private final AuthorizationService authorization;
    private final ProjectVisibilityGuard visibility;
    private final HarnessRuleSetRepository repository;
    private final HarnessRulesService rulesService;
    private final WorkspaceMemberRepository workspaceMembers;
    private final ProjectRepository projects;
    private final ProjectMemberRepository projectMembers;
    private final ConnectorConnectionRepository connections;
    private final RuleDraftService drafts;
    private final AuditService audit;

    /** Ce qui empêche une règle d'entrer, ou ce qu'elle devient : la réponse de {@link #add} dit lequel. */
    public record Saved(RulesResponse.Draft draft, boolean saved) {
    }

    // ------------------------------------------------------------------------------------------------- lire

    @Transactional(readOnly = true)
    public RulesResponse.Overview overview(String slug, Long userId) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        Context context = context(ws, userId);
        List<HarnessRuleSet> rows = repository.findByWorkspaceIdOrderByVersionDesc(ws.getId());
        Map<LayerKey, HarnessRuleSet> current = new LinkedHashMap<>();
        rows.forEach(row -> current.putIfAbsent(LayerKey.of(row), row));
        Map<LayerKey, LayerVersion> state = rulesService.currentLayers(ws.getId());

        List<RulesResponse.Layer> layers = new ArrayList<>();
        for (Map.Entry<LayerKey, HarnessRuleSet> e : current.entrySet()) {
            if (!context.sees(e.getKey())) {
                continue;
            }
            HarnessRuleSet row = e.getValue();
            layers.add(new RulesResponse.Layer(e.getKey().scope().layer(), e.getKey().ref(), context.nameOf(e.getKey()),
                row.getVersion(), context.nameOf(row.getCreatedBy()), row.getCreatedAt(), row.getDigest(),
                context.canEdit(e.getKey()), statements(ws, context, e.getKey(), row.getRules(), state)));
        }
        List<RulesResponse.Version> versions = rows.stream()
            .filter(row -> context.sees(LayerKey.of(row)))
            .map(row -> new RulesResponse.Version(row.getVersion(), row.getScope().layer(), LayerKey.of(row).ref(),
                context.nameOf(LayerKey.of(row)), context.nameOf(row.getCreatedBy()), row.getCreatedAt(), row.getDigest(),
                row.getRules().size()))
            .toList();
        RulesBundle workspaceBundle = rulesService.build(ws, Work.NONE, null, state);
        return new RulesResponse.Overview(workspaceBundle.version(), workspaceBundle.digest(),
            RulesFloor.RULES.stream().map(RulesBundle.Rule::id).toList(), defaults(ws), layers, versions,
            context.people(), context.projectRefs(), context.manager());
    }

    // ------------------------------------------------------------------------------------------------- écrire

    /** Traduit une règle en mots (sans traduction donnée), puis la vérifie ; rien n'est écrit. */
    @Transactional(readOnly = true)
    public RulesResponse.Draft draft(String slug, Long userId, RuleDraftRequest request) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        Context context = context(ws, userId);
        LayerKey key = target(ws, context, request.scope(), request.ref());
        List<Map<String, Object>> candidate = request.rules();
        List<RuleCases.Case> modelCases = parseCases(request.cases());
        String approverNeeded = null;
        String unclear = null;
        if (candidate == null || candidate.isEmpty()) {
            RuleDraftService.Translation t = drafts.translate(ws.getId(), request.text().strip(), layerWords(context, key),
                context.memberList(), tools(ws));
            candidate = t.rules();
            modelCases = t.cases();
            approverNeeded = t.approverNeeded();
            unclear = t.unclear();
        }
        return verify(ws, context, key, request.text().strip(), candidate, modelCases, approverNeeded, unclear).draft();
    }

    /**
     * Vérifie de nouveau la traduction donnée, sans le modèle, et l'écrit si tout tient : une nouvelle version de la
     * couche, jugée par le moteur comme un geste de la personne, et gardée au journal.
     */
    @Transactional
    public Saved add(String slug, Long userId, RuleDraftRequest request) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        Context context = context(ws, userId);
        LayerKey key = target(ws, context, request.scope(), request.ref());
        if (request.rules() == null || request.rules().isEmpty()) {
            throw new BusinessException("Check the rule first: TaskForce saves the rule it showed you, once its cases pass.");
        }
        Verified verified = verify(ws, context, key, request.text().strip(), request.rules(), parseCases(request.cases()),
            null, null);
        if (!verified.draft().passed()) {
            return new Saved(verified.draft(), false);
        }
        judgeChange(ws, userId);
        List<Map<String, Object>> layerRules = new ArrayList<>(existing(ws, key));
        LocalDateTime now = LocalDateTime.now();
        for (Map<String, Object> rule : verified.stored()) {
            rule.put("addedBy", userId);
            rule.put("addedAt", now.toString());
            layerRules.add(rule);
        }
        HarnessRuleSet row = write(ws, context, key, layerRules, userId, now);
        audit.record(ws.getId(), userId, AUDIT_ACTION, "harness_rule_set", String.valueOf(row.getId()),
            Map.of("change", "added", "scope", key.scope().layer(), "ref", Objects.toString(key.ref(), ""),
                "version", row.getVersion(), "digest", row.getDigest(), "text", request.text().strip()));
        return new Saved(verified.draft(), true);
    }

    /** Retire une règle (toutes les règles du contrat nées de sa phrase) : une nouvelle version de sa couche, sans elle. */
    @Transactional
    public void remove(String slug, Long userId, String scope, String ref, String group) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        Context context = context(ws, userId);
        LayerKey key = target(ws, context, scope, ref);
        List<Map<String, Object>> before = existing(ws, key);
        List<Map<String, Object>> after = before.stream().filter(r -> !group.equals(groupOf(r))).toList();
        if (after.size() == before.size()) {
            throw new ResourceNotFoundException("This rule isn't in these rules any more.");
        }
        Map<LayerKey, LayerVersion> state = new LinkedHashMap<>(rulesService.currentLayers(ws.getId()));
        state.put(key, new LayerVersion(key, Integer.MAX_VALUE, null, after));
        List<RulesResponse.CaseView> broken = replay(ws, context, state, null);
        if (!broken.isEmpty()) {
            throw new BusinessException("Removing this rule would change what other rules of your workspace do. "
                + "Remove those first, or write them again.");
        }
        judgeChange(ws, userId);
        String text = before.stream().filter(r -> group.equals(groupOf(r))).map(r -> Objects.toString(r.get("text"), ""))
            .findFirst().orElse("");
        HarnessRuleSet row = write(ws, context, key, after, userId, LocalDateTime.now());
        audit.record(ws.getId(), userId, AUDIT_ACTION, "harness_rule_set", String.valueOf(row.getId()),
            Map.of("change", "removed", "scope", key.scope().layer(), "ref", Objects.toString(key.ref(), ""),
                "version", row.getVersion(), "digest", row.getDigest(), "text", text));
    }

    /** « What would happen? » : l'action lue par le modèle en faits, puis jugée par le moteur, sans le modèle. */
    @Transactional(readOnly = true)
    public RulesResponse.Check check(String slug, Long userId, RuleCheckRequest request) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        Context context = context(ws, userId);
        Long projectId = request.projectId();
        if (projectId != null) {
            Project project = projects.findByIdAndWorkspaceId(projectId, ws.getId())
                .orElseThrow(() -> new ResourceNotFoundException("Project not found"));
            visibility.assertCanView(project, userId);
        }
        RuleDraftService.Reading reading = drafts.read(ws.getId(), request.text().strip(), tools(ws));
        if (reading.facts() == null) {
            return new RulesResponse.Check(null, null, reading.unclear());
        }
        RulesBundle bundle = rulesService.bundleFor(ws, new Work(projectId, null, userId));
        RulesEngine.Decision decision = RulesEngine.decide(bundle, reading.facts());
        return new RulesResponse.Check(reading.facts(), decisionView(decision, context, bundle), reading.unclear());
    }

    // ------------------------------------------------------------------------------------------------- vérifier

    private record Verified(RulesResponse.Draft draft, List<Map<String, Object>> stored) {
    }

    /**
     * La vérification sans modèle : chaque règle passe le format et le socle ; on lui donne son identifiant, sa classe,
     * son propriétaire, sa raison et sa date de revue ; ses cas (ceux de TaskForce, ceux du modèle) se rejouent dans sa
     * couche, puis ceux de toutes les autres règles de l'espace, avec elle.
     */
    private Verified verify(Workspace ws, Context context, LayerKey key, String text, List<Map<String, Object>> candidate,
                            List<RuleCases.Case> modelCases, String approverNeeded, String unclear) {
        List<RulesResponse.Problem> problems = new ArrayList<>();
        List<Map<String, Object>> clean = new ArrayList<>();
        for (Map<String, Object> raw : candidate) {
            Map<String, Object> rule = new LinkedHashMap<>();
            rule.put("when", raw.get("when"));
            rule.put("effect", raw.get("effect"));
            if (raw.get("require") != null) {
                rule.put("require", raw.get("require"));
            }
            RuleValidator.check(rule, context.memberIds()).forEach(p -> problems.add(new RulesResponse.Problem(p.code(), p.detail())));
            clean.add(rule);
        }
        if (candidate.isEmpty()) {
            problems.add(new RulesResponse.Problem("nothing", unclear));
        }
        if (!problems.isEmpty()) {
            return new Verified(new RulesResponse.Draft(text, key.scope().layer(), key.ref(), clean, casesOut(modelCases),
                List.of(), List.of(), problems, approverNeeded, unclear, false), List.of());
        }
        String group = ruleId(key, text, 0, clean.size());
        List<Map<String, Object>> stored = new ArrayList<>();
        for (int i = 0; i < clean.size(); i++) {
            Map<String, Object> rule = clean.get(i);
            Map<String, Object> full = new LinkedHashMap<>();
            full.put("id", i == 0 && clean.size() == 1 ? group : ruleId(key, text, i + 1, clean.size()));
            full.put("group", group);
            full.put("when", rule.get("when"));
            full.put("class", classOf(rule));
            full.put("effect", rule.get("effect"));
            full.put("inverse", null);
            full.put("owner", context.email());
            full.put("reason", text);
            full.put("review", LocalDate.now().plusMonths(REVIEW_MONTHS).toString());
            full.put("text", text);
            if (rule.get("require") != null) {
                full.put("require", rule.get("require"));
            }
            stored.add(full);
        }
        for (Map<String, Object> rule : stored) {
            if (existing(ws, key).stream().anyMatch(r -> rule.get("id").equals(r.get("id")))) {
                problems.add(new RulesResponse.Problem("alreadyThere", null));
                return new Verified(new RulesResponse.Draft(text, key.scope().layer(), key.ref(), clean,
                    casesOut(modelCases), List.of(), List.of(), problems, approverNeeded, unclear, false), List.of());
            }
        }

        Map<LayerKey, LayerVersion> before = new LinkedHashMap<>(rulesService.currentLayers(ws.getId()));
        Map<LayerKey, LayerVersion> after = new LinkedHashMap<>(before);
        List<Map<String, Object>> layerRules = new ArrayList<>(existing(ws, key));
        layerRules.addAll(stored);
        after.put(key, new LayerVersion(key, Integer.MAX_VALUE, null, layerRules));
        RulesBundle without = bundleIn(ws, context, key, before);
        RulesBundle with = bundleIn(ws, context, key, after);

        List<RuleCases.Case> cases = new ArrayList<>();
        for (Map<String, Object> rule : stored) {
            List<RuleCases.Case> own = RuleCases.generated(rule, without);
            rule.put("cases", own.stream().map(RulesService::caseOut).toList());
            cases.addAll(own);
        }
        if (!modelCases.isEmpty()) {
            Map<String, Object> first = stored.get(0);
            List<Map<String, Object>> withModel = new ArrayList<>(castList(first.get("cases")));
            modelCases.forEach(c -> withModel.add(caseOut(c)));
            first.put("cases", withModel);
            cases.addAll(modelCases);
        }
        List<RulesResponse.CaseView> views = new ArrayList<>();
        boolean passed = !cases.isEmpty();
        for (RuleCases.Case c : cases) {
            RuleCases.Outcome outcome = RuleCases.run(c, with);
            passed &= outcome.passed();
            views.add(caseView(outcome, context, with));
        }
        if (cases.isEmpty()) {
            problems.add(new RulesResponse.Problem("noCase", null));
        }
        List<RulesResponse.CaseView> broken = replay(ws, context, after, Set.copyOf(stored.stream()
            .map(r -> (String) r.get("id")).toList()));
        passed &= broken.isEmpty();
        return new Verified(new RulesResponse.Draft(text, key.scope().layer(), key.ref(), clean, casesOut(modelCases),
            views, broken, problems, approverNeeded, unclear, passed && problems.isEmpty()), stored);
    }

    /**
     * Rejoue les cas de toutes les règles écrites de l'espace (sauf {@code skip}) contre cet état ; rend ceux qui ne
     * tiennent plus.
     */
    private List<RulesResponse.CaseView> replay(Workspace ws, Context context, Map<LayerKey, LayerVersion> state,
                                                Set<String> skip) {
        List<RulesResponse.CaseView> broken = new ArrayList<>();
        for (LayerVersion layer : state.values()) {
            RulesBundle bundle = bundleIn(ws, context, layer.key(), state);
            for (Map<String, Object> rule : layer.rules()) {
                if (skip != null && skip.contains(String.valueOf(rule.get("id")))) {
                    continue;
                }
                for (RuleCases.Case c : parseCases(castList(rule.get("cases")))) {
                    RuleCases.Outcome outcome = RuleCases.run(c, bundle);
                    if (!outcome.passed()) {
                        broken.add(caseView(outcome, context, bundle));
                    }
                }
            }
        }
        return broken;
    }

    /** Le paquet dans lequel les cas d'une couche se jugent : cette couche et celles qui valent pour tout l'espace. */
    private RulesBundle bundleIn(Workspace ws, Context context, LayerKey key, Map<LayerKey, LayerVersion> state) {
        return switch (key.scope()) {
            case WORKSPACE -> rulesService.build(ws, Work.NONE, null, state);
            case PROJECT -> rulesService.build(ws, new Work(Long.valueOf(key.ref()), null, null), null, state);
            case PROCESS -> rulesService.build(ws, new Work(null, key.ref(), null), null, state);
            case ROLE -> rulesService.build(ws, Work.NONE, key.ref(), state);
            case PERSON -> rulesService.build(ws, new Work(null, null, Long.valueOf(key.ref())),
                context.roleOf(Long.valueOf(key.ref())), state);
        };
    }

    // ------------------------------------------------------------------------------------------------- écrire

    /** Un changement de règles est un geste de la personne : le moteur le juge, avec le socle, avant qu'il entre. */
    private void judgeChange(Workspace ws, Long userId) {
        RulesBundle bundle = rulesService.bundleFor(ws, new Work(null, null, userId));
        RulesEngine.Decision decision = RulesEngine.decide(bundle, Map.of("action", "harness.change", "actor", "person"));
        if (!RulesEngine.ALLOW.equals(decision.effect())) {
            throw new ForbiddenException(decision.rule() == null
                ? "Your workspace's rules don't let you change them." : decision.rule().reason());
        }
    }

    private HarnessRuleSet write(Workspace ws, Context context, LayerKey key, List<Map<String, Object>> rules,
                                 Long userId, LocalDateTime now) {
        int next = repository.findFirstByWorkspaceIdOrderByVersionDesc(ws.getId()).map(HarnessRuleSet::getVersion).orElse(0) + 1;
        HarnessRuleSet.HarnessRuleSetBuilder row = HarnessRuleSet.builder()
            .workspace(ws)
            .version(next)
            .scope(key.scope())
            .rules(rules)
            .digest(HarnessRulesService.digestOf(rules))
            .createdBy(context.user(userId))
            .createdAt(now);
        switch (key.scope()) {
            case PROJECT -> row.project(projects.getReferenceById(Long.valueOf(key.ref())));
            case PROCESS -> row.processKey(key.ref());
            case ROLE -> row.role(key.ref());
            case PERSON -> row.person(context.user(Long.valueOf(key.ref())));
            default -> { }
        }
        try {
            return repository.saveAndFlush(row.build());
        } catch (DataIntegrityViolationException e) {
            throw new BusinessException("The rules changed while you were writing. Check the rule again, then add it.");
        }
    }

    /** La couche visée, si elle existe et si la personne peut l'écrire. */
    private LayerKey target(Workspace ws, Context context, String scope, String ref) {
        RuleScope s;
        try {
            s = RuleScope.valueOf(Objects.toString(scope, "").toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new BusinessException("Unknown layer of the rules.");
        }
        LayerKey key = switch (s) {
            case WORKSPACE -> LayerKey.WORKSPACE;
            case PROJECT -> {
                Long id = number(ref);
                Project project = projects.findByIdAndWorkspaceId(id, ws.getId())
                    .orElseThrow(() -> new ResourceNotFoundException("Project not found"));
                visibility.assertCanView(project, context.userId());
                yield new LayerKey(RuleScope.PROJECT, String.valueOf(project.getId()));
            }
            case PROCESS -> {
                if (ref == null || !PROCESS_KEY.matcher(ref).matches()) {
                    throw new BusinessException("A process is named by its key.");
                }
                yield new LayerKey(RuleScope.PROCESS, ref);
            }
            case ROLE -> {
                String role = Objects.toString(ref, "").toUpperCase(Locale.ROOT);
                if (!ROLES.contains(role)) {
                    throw new BusinessException("Unknown role of the workspace.");
                }
                yield new LayerKey(RuleScope.ROLE, role);
            }
            case PERSON -> {
                Long id = number(ref);
                if (!context.memberIds().contains(id)) {
                    throw new ResourceNotFoundException("This person isn't a member of the workspace.");
                }
                yield new LayerKey(RuleScope.PERSON, String.valueOf(id));
            }
        };
        if (!context.canEdit(key)) {
            throw new ForbiddenException(key.scope() == RuleScope.PROJECT
                ? "Only the project's lead, or an owner or admin of the workspace, can change its rules."
                : "Only an owner or admin of the workspace can change its rules.");
        }
        return key;
    }

    private List<Map<String, Object>> existing(Workspace ws, LayerKey key) {
        LayerVersion current = rulesService.currentLayers(ws.getId()).get(key);
        return current == null ? List.of() : current.rules();
    }

    // ------------------------------------------------------------------------------------------------- vues

    private List<RulesResponse.Statement> statements(Workspace ws, Context context, LayerKey key,
                                                     List<Map<String, Object>> rules, Map<LayerKey, LayerVersion> state) {
        RulesBundle bundle = bundleIn(ws, context, key, state);
        Map<String, List<Map<String, Object>>> groups = new LinkedHashMap<>();
        rules.forEach(r -> groups.computeIfAbsent(groupOf(r), g -> new ArrayList<>()).add(r));
        List<RulesResponse.Statement> out = new ArrayList<>();
        for (Map.Entry<String, List<Map<String, Object>>> g : groups.entrySet()) {
            List<Map<String, Object>> parts = g.getValue();
            Map<String, Object> first = parts.get(0);
            List<String> approvers = new ArrayList<>();
            int signatures = 1;
            boolean separate = false;
            List<RulesResponse.CaseView> cases = new ArrayList<>();
            for (Map<String, Object> part : parts) {
                Map<String, Object> require = RuleValidator.map(part.get("require"));
                if (require != null) {
                    if (require.get("approvers") instanceof List<?> list) {
                        list.forEach(a -> { if (!approvers.contains(a.toString())) approvers.add(a.toString()); });
                    }
                    if (require.get("signatures") instanceof Number n) {
                        signatures = Math.max(signatures, n.intValue());
                    }
                    separate |= Boolean.TRUE.equals(require.get("separate"));
                }
                for (RuleCases.Case c : parseCases(castList(part.get("cases")))) {
                    cases.add(caseView(RuleCases.run(c, bundle), context, bundle));
                }
            }
            out.add(new RulesResponse.Statement(g.getKey(), Objects.toString(first.get("text"), Objects.toString(first.get("reason"), "")),
                Objects.toString(first.get("effect"), ""),
                parts.stream().map(RulesService::part).toList(),
                approvers.stream().map(context::approver).toList(), signatures, separate,
                context.nameOf(context.user(longOf(first.get("addedBy")))), dateOf(first.get("addedAt")), cases));
        }
        return out;
    }

    private static RulesResponse.Part part(Map<String, Object> rule) {
        Map<String, Object> when = RuleValidator.map(rule.get("when"));
        Map<String, Object> raw = new LinkedHashMap<>(rule);
        raw.remove("cases");
        raw.remove("addedBy");
        raw.remove("addedAt");
        raw.remove("group");
        return new RulesResponse.Part(Objects.toString(rule.get("id"), ""), when == null ? null : (String) when.get("action"),
            when, Objects.toString(rule.get("effect"), ""), raw);
    }

    private List<RulesResponse.DefaultRule> defaults(Workspace ws) {
        List<RulesResponse.DefaultRule> out = new ArrayList<>();
        for (JsonNode rule : rulesService.ownedBy(null)) {
            Map<String, Object> when = JSON.convertValue(rule.path("when"), MAP);
            out.add(new RulesResponse.DefaultRule(rule.path("id").asText(), (String) when.get("action"), when,
                rule.path("effect").asText(), rule.path("reason").asText()));
        }
        return out;
    }

    private RulesResponse.CaseView caseView(RuleCases.Outcome outcome, Context context, RulesBundle bundle) {
        RuleCases.Case c = outcome.c();
        List<RulesResponse.Approver> expected = c.expect().approvers() == null ? null
            : c.expect().approvers().stream().map(context::approver).toList();
        return new RulesResponse.CaseView(c.text(), c.facts(), c.expect().effect(), expected,
            decisionView(outcome.decision(), context, bundle), outcome.passed(), c.source());
    }

    private RulesResponse.Decision decisionView(RulesEngine.Decision decision, Context context, RulesBundle bundle) {
        RulesBundle.Rule rule = decision.rule();
        String layer = rule == null ? null : rule.layer() != null ? rule.layer()
            : RulesFloor.RULES.contains(rule) ? "floor" : "taskforce";
        String layerName = null;
        if (rule != null && rule.layer() != null && bundle.layers() != null) {
            layerName = bundle.layers().stream().filter(l -> l.scope().equals(rule.layer())).findFirst()
                .map(l -> context.nameOf(new LayerKey(RuleScope.valueOf(l.scope().toUpperCase(Locale.ROOT)), l.ref())))
                .orElse(null);
        }
        List<List<RulesResponse.Approver>> approvers = decision.require() == null ? List.of()
            : decision.require().approvers().stream().map(set -> set.stream().map(context::approver).toList()).toList();
        return new RulesResponse.Decision(decision.effect(), rule == null ? null : rule.id(),
            rule == null ? null : rule.text() != null ? rule.text() : rule.reason(), layer, layerName, approvers,
            decision.require() == null ? 1 : decision.require().signatures(),
            decision.require() != null && decision.require().separate());
    }

    // ------------------------------------------------------------------------------------------------- outils

    /** Les clés des outils de l'entreprise branchés à l'espace, que la règle peut nommer. */
    private List<String> tools(Workspace ws) {
        return connections.findByWorkspaceId(ws.getId()).stream().map(c -> c.getConnectorKey()).distinct().sorted().toList();
    }

    private static String layerWords(Context context, LayerKey key) {
        return switch (key.scope()) {
            case WORKSPACE -> "the whole workspace";
            case PROJECT -> "the project \"" + context.nameOf(key) + "\" only (its repository and its issues)";
            case PROCESS -> "the process \"" + key.ref() + "\" only";
            case ROLE -> "the work of the workspace's " + key.ref().toLowerCase(Locale.ROOT) + "s, and of their agents";
            case PERSON -> "the work of " + context.nameOf(key) + ", and of their agents";
        };
    }

    /** La classe d'une règle de l'entreprise : celle que TaskForce donne à son action ; une commande, irréversible. */
    private static String classOf(Map<String, Object> rule) {
        Map<String, Object> when = RuleValidator.map(rule.get("when"));
        Map<String, String> facts = new HashMap<>();
        if (when != null && when.get("action") instanceof String action) {
            facts.put("action", action);
            if (when.get("repoVisibility") instanceof String v) facts.put("repoVisibility", v);
            if (when.get("branch") instanceof String b) facts.put("branch", b);
        }
        return Objects.requireNonNullElse(RulesFloor.classOf(facts), RulesFloor.IRREVERSIBLE);
    }

    /**
     * L'identifiant d'une règle : la couche, quelques mots de la phrase et un bout de son empreinte. Plusieurs règles
     * nées de la même phrase prennent un numéro.
     */
    static String ruleId(LayerKey key, String text, int index, int count) {
        String prefix = switch (key.scope()) {
            case WORKSPACE -> "ws";
            case PROJECT -> "prj" + key.ref();
            case PROCESS -> "proc";
            case ROLE -> "role-" + key.ref().toLowerCase(Locale.ROOT);
            case PERSON -> "person" + key.ref();
        };
        String words = text.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-").replaceAll("(^-+|-+$)", "");
        if (words.length() > 36) {
            words = words.substring(0, 36).replaceAll("-+$", "");
        }
        String id = prefix + "-" + (words.isEmpty() ? "rule" : words) + "-" + shortHash(key + "|" + text);
        return index > 0 && count > 1 ? id + "-" + index : id;
    }

    private static String shortHash(String text) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash).substring(0, 6);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    static String groupOf(Map<String, Object> rule) {
        return Objects.toString(rule.get("group"), Objects.toString(rule.get("id"), ""));
    }

    static Map<String, Object> caseOut(RuleCases.Case c) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (c.text() != null) out.put("text", c.text());
        out.put("facts", c.facts());
        Map<String, Object> expect = new LinkedHashMap<>();
        expect.put("effect", c.expect().effect());
        if (c.expect().approvers() != null) expect.put("approvers", c.expect().approvers());
        out.put("expect", expect);
        out.put("source", c.source());
        return out;
    }

    private static List<Map<String, Object>> casesOut(List<RuleCases.Case> cases) {
        return cases.stream().map(RulesService::caseOut).toList();
    }

    /** Les cas tels qu'ils sont gardés, ou envoyés par l'écran ; un cas mal formé tombe. */
    static List<RuleCases.Case> parseCases(List<Map<String, Object>> raw) {
        List<RuleCases.Case> out = new ArrayList<>();
        if (raw == null) {
            return out;
        }
        for (Map<String, Object> c : raw) {
            Map<String, String> facts = RuleDraftService.facts(JSON.valueToTree(c.get("facts")));
            Map<String, Object> expect = RuleValidator.map(c.get("expect"));
            Object effect = expect == null ? c.get("expect") : expect.get("effect");
            if (facts == null || !(effect instanceof String e) || !Set.of("allow", "ask", "deny").contains(e)) {
                continue;
            }
            List<String> approvers = expect != null && expect.get("approvers") instanceof List<?> list && !list.isEmpty()
                ? list.stream().map(String::valueOf).toList() : null;
            String source = RuleCases.BY_TASKFORCE.equals(c.get("source")) ? RuleCases.BY_TASKFORCE : RuleCases.BY_MODEL;
            out.add(new RuleCases.Case(c.get("text") instanceof String t ? t : null, facts,
                new RuleCases.Expect(e, approvers), source));
        }
        return out;
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> castList(Object value) {
        if (!(value instanceof List<?> list)) {
            return List.of();
        }
        return list.stream().filter(Map.class::isInstance).map(item -> (Map<String, Object>) item).toList();
    }

    private static Long number(String ref) {
        try {
            return Long.valueOf(Objects.toString(ref, ""));
        } catch (NumberFormatException e) {
            throw new ResourceNotFoundException("Not found");
        }
    }

    private static Long longOf(Object value) {
        if (value instanceof Number n) return n.longValue();
        try {
            return value == null ? null : Long.valueOf(value.toString());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static LocalDateTime dateOf(Object value) {
        try {
            return value == null ? null : LocalDateTime.parse(value.toString());
        } catch (RuntimeException e) {
            return null;
        }
    }

    // ------------------------------------------------------------------------------------------------- contexte

    private Context context(Workspace ws, Long userId) {
        List<WorkspaceMember> list = workspaceMembers.findByWorkspaceId(ws.getId());
        Map<Long, WorkspaceMember> byId = new LinkedHashMap<>();
        list.forEach(m -> byId.put(m.getUser().getId(), m));
        WorkspaceMember me = byId.get(userId);
        if (me == null) {
            throw new ForbiddenException("Access denied: you're not a member of this workspace");
        }
        List<Long> visible = visibility.viewableProjectIds(ws.getId(), userId);
        Map<Long, Project> projectsById = projects.findByWorkspaceIdOrderByCreatedAtDesc(ws.getId()).stream()
            .filter(p -> visible.contains(p.getId()))
            .collect(Collectors.toMap(Project::getId, p -> p, (a, b) -> a, LinkedHashMap::new));
        boolean manager = me.getRole() == WorkspaceRole.OWNER || me.getRole() == WorkspaceRole.ADMIN;
        Set<Long> leads = projectsById.keySet().stream()
            .filter(id -> projectMembers.findByProjectIdAndUserId(id, userId)
                .map(pm -> pm.getRole() == ProjectRole.LEAD).orElse(false))
            .collect(Collectors.toSet());
        return new Context(userId, me.getUser(), byId, projectsById, manager, leads);
    }

    /** Ce que la personne voit de l'espace, et ce qu'elle peut y écrire. */
    private record Context(Long userId, User me, Map<Long, WorkspaceMember> members, Map<Long, Project> projects,
                           boolean manager, Set<Long> leads) {

        String email() {
            return me.getEmail();
        }

        Set<Long> memberIds() {
            return members.keySet();
        }

        String roleOf(Long id) {
            WorkspaceMember m = members.get(id);
            return m == null ? null : m.getRole().name();
        }

        User user(Long id) {
            WorkspaceMember m = id == null ? null : members.get(id);
            return m == null ? null : m.getUser();
        }

        boolean sees(LayerKey key) {
            return key.scope() != RuleScope.PROJECT || projects.containsKey(Long.valueOf(key.ref()));
        }

        boolean canEdit(LayerKey key) {
            return manager || (key.scope() == RuleScope.PROJECT && leads.contains(Long.valueOf(key.ref())));
        }

        String nameOf(User user) {
            if (user == null) return null;
            return user.getDisplayName() == null || user.getDisplayName().isBlank() ? user.getEmail() : user.getDisplayName();
        }

        String nameOf(LayerKey key) {
            return switch (key.scope()) {
                case PROJECT -> {
                    Project p = projects.get(Long.valueOf(key.ref()));
                    yield p == null ? null : p.getName();
                }
                case PERSON -> nameOf(user(Long.valueOf(key.ref())));
                // Un rôle ou un processus se nomme par sa référence, que l'écran dit en mots.
                case ROLE, PROCESS -> key.ref();
                case WORKSPACE -> null;
            };
        }

        RulesResponse.Approver approver(String ref) {
            if (ref.startsWith("person:")) {
                User u = user(longOf(ref.substring(7)));
                return new RulesResponse.Approver(ref, u == null ? null : nameOf(u), u == null ? null : u.getJobTitle());
            }
            return new RulesResponse.Approver(ref, null, null);
        }

        List<RulesResponse.Person> people() {
            return members.values().stream().map(m -> new RulesResponse.Person(m.getUser().getId(), nameOf(m.getUser()),
                m.getUser().getJobTitle(), m.getRole().name())).toList();
        }

        List<RuleDraftService.Member> memberList() {
            return members.values().stream().map(m -> new RuleDraftService.Member(m.getUser().getId(), nameOf(m.getUser()),
                m.getUser().getJobTitle(), m.getRole().name())).toList();
        }

        List<RulesResponse.ProjectRef> projectRefs() {
            return projects.values().stream().map(p -> new RulesResponse.ProjectRef(p.getId(), p.getName(),
                canEdit(new LayerKey(RuleScope.PROJECT, String.valueOf(p.getId()))))).toList();
        }
    }
}
