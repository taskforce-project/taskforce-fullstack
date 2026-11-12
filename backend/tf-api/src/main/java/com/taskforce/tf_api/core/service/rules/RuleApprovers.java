package com.taskforce.tf_api.core.service.rules;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.enums.ProjectRole;
import com.taskforce.tf_api.core.enums.WorkspaceRole;
import com.taskforce.tf_api.core.harness.rules.RulesEngine;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.WorkspaceMember;
import com.taskforce.tf_api.core.repository.ProjectMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;

import lombok.RequiredArgsConstructor;

/**
 * Qui peut accorder ce qu'une règle de l'entreprise demande (R98), et quand un accord est complet. Code déterministe :
 * une personne signe si elle est dans au moins une liste de personnes désignées (sans liste : la personne qui a préparé
 * l'action, ou, quand plusieurs signatures ou la séparation des rôles sont demandées, aussi les responsables du projet et
 * les administrateurs de l'espace) ; avec la séparation, celle qui a préparé l'action ne signe pas. L'accord est complet
 * quand chaque liste a au moins une signature et que les personnes distinctes qui ont signé sont assez nombreuses.
 */
@Component
@RequiredArgsConstructor
public class RuleApprovers {

    private final WorkspaceMemberRepository workspaceMembers;
    private final ProjectMemberRepository projectMembers;

    /** Les obligations n'ajoutent rien à l'accord ordinaire : la personne qui a préparé l'action décide seule. */
    public static boolean ordinary(RulesEngine.Obligations require) {
        return require == null || require.addsNothing();
    }

    /** Une référence de la règle couvre-t-elle cette personne, dans ce projet ? */
    @Transactional(readOnly = true)
    public boolean covers(String ref, Long workspaceId, Long projectId, Long userId) {
        if (userId == null) {
            return false;
        }
        if (ref.startsWith("person:")) {
            return ref.substring(7).equals(String.valueOf(userId));
        }
        Optional<WorkspaceMember> member = workspaceMembers.findByWorkspaceIdAndUserId(workspaceId, userId);
        if (member.isEmpty()) {
            return false;
        }
        WorkspaceRole role = member.get().getRole();
        return switch (ref) {
            case "role:owner" -> role == WorkspaceRole.OWNER;
            case "role:admin" -> role == WorkspaceRole.OWNER || role == WorkspaceRole.ADMIN;
            case "project-lead" -> projectId != null && projectMembers.findByProjectIdAndUserId(projectId, userId)
                .map(pm -> pm.getRole() == ProjectRole.LEAD).orElse(false);
            default -> false;
        };
    }

    /**
     * Cette personne peut-elle signer cet accord ? {@code preparer} est la personne qui a préparé l'action (qui a délégué
     * la mission, qui a demandé à Cortex).
     */
    @Transactional(readOnly = true)
    public boolean maySign(RulesEngine.Obligations require, Long workspaceId, Long projectId, Long preparer, Long userId) {
        if (userId == null) {
            return false;
        }
        if (ordinary(require)) {
            return Objects.equals(preparer, userId);
        }
        if (require.separate() && Objects.equals(preparer, userId)) {
            return false;
        }
        if (require.approvers().isEmpty()) {
            return Objects.equals(preparer, userId) || covers("role:admin", workspaceId, projectId, userId)
                || covers("project-lead", workspaceId, projectId, userId);
        }
        for (List<String> set : require.approvers()) {
            for (String ref : set) {
                if (covers(ref, workspaceId, projectId, userId)) {
                    return true;
                }
            }
        }
        return false;
    }

    /** L'accord est-il complet avec ces signataires (qui ont tous accordé) ? */
    @Transactional(readOnly = true)
    public boolean complete(RulesEngine.Obligations require, Long workspaceId, Long projectId, Collection<Long> signers) {
        Set<Long> distinct = new LinkedHashSet<>(signers);
        distinct.remove(null);
        if (ordinary(require)) {
            return !distinct.isEmpty();
        }
        if (distinct.size() < require.signatures()) {
            return false;
        }
        for (List<String> set : require.approvers()) {
            boolean covered = distinct.stream().anyMatch(u -> set.stream().anyMatch(ref -> covers(ref, workspaceId, projectId, u)));
            if (!covered) {
                return false;
            }
        }
        return true;
    }

    /** Une seule personne, celle qui a préparé l'action, peut-elle compléter l'accord seule ? */
    @Transactional(readOnly = true)
    public boolean aloneSuffices(RulesEngine.Obligations require, Long workspaceId, Long projectId, Long preparer) {
        return maySign(require, workspaceId, projectId, preparer, preparer)
            && complete(require, workspaceId, projectId, List.of(preparer));
    }

    /** Les personnes que les listes désignent, par leur nom, pour le dire à la personne qui attend (« Marie Martin »). */
    @Transactional(readOnly = true)
    public List<String> names(RulesEngine.Obligations require, Long workspaceId) {
        List<String> out = new ArrayList<>();
        if (require == null) {
            return out;
        }
        for (List<String> set : require.approvers()) {
            List<String> names = new ArrayList<>();
            for (String ref : set) {
                names.add(switch (ref) {
                    case "role:owner" -> "the workspace's owner";
                    case "role:admin" -> "an admin of the workspace";
                    case "project-lead" -> "the project's lead";
                    default -> personName(ref, workspaceId);
                });
            }
            out.add(String.join(" or ", names));
        }
        return out;
    }

    /**
     * Les listes de personnes désignées, pour l'écran : le nom d'une personne, ou la référence d'un rôle
     * ({@code role:owner}, {@code role:admin}, {@code project-lead}) que l'écran dit en mots.
     */
    @Transactional(readOnly = true)
    public List<List<String>> labels(RulesEngine.Obligations require, Long workspaceId) {
        List<List<String>> out = new ArrayList<>();
        if (require == null) {
            return out;
        }
        for (List<String> set : require.approvers()) {
            out.add(set.stream().map(ref -> ref.startsWith("person:") ? personName(ref, workspaceId) : ref).toList());
        }
        return out;
    }

    private String personName(String ref, Long workspaceId) {
        try {
            Long id = Long.valueOf(ref.substring(7));
            return workspaceMembers.findByWorkspaceIdAndUserId(workspaceId, id).map(WorkspaceMember::getUser)
                .map(RuleApprovers::nameOf).orElse("a person who left the workspace");
        } catch (NumberFormatException e) {
            return "a person who left the workspace";
        }
    }

    static String nameOf(User user) {
        return user.getDisplayName() == null || user.getDisplayName().isBlank() ? user.getEmail() : user.getDisplayName();
    }
}
