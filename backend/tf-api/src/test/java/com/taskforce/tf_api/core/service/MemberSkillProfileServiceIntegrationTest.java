package com.taskforce.tf_api.core.service;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.dto.request.UpsertMemberSkillsRequest;
import com.taskforce.tf_api.core.enums.WorkspaceRole;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.model.WorkspaceMember;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.shared.exception.ForbiddenException;
import com.taskforce.tf_api.util.AbstractIntegrationTest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Tests d'intégration — {@link MemberSkillProfileService} (JdbcTemplate réel + member_skill_profiles).
 * upsert (self autorisé), lecture (getProfile/listProfiles), garde-fou d'autorisation.
 */
@DisplayName("MemberSkillProfileService (intégration Postgres)")
@Import({MemberSkillProfileService.class, MemberSkillProfileServiceIntegrationTest.Cfg.class})
class MemberSkillProfileServiceIntegrationTest extends AbstractIntegrationTest {

    @TestConfiguration
    static class Cfg {
        @Bean
        ObjectMapper objectMapper() { return new ObjectMapper(); }
    }

    @Autowired private MemberSkillProfileService service;
    @Autowired private UserRepository userRepository;
    @Autowired private WorkspaceRepository workspaceRepository;
    @Autowired private WorkspaceMemberRepository workspaceMemberRepository;

    private static final String SLUG = "ws-skill-it";
    private User owner;
    private Workspace workspace;

    @BeforeEach
    void seed() {
        owner = userRepository.save(User.builder()
            .keycloakId("kc-skill").email("skill@it.dev").displayName("Owner").isActive(true).build());
        workspace = workspaceRepository.save(Workspace.builder().name("Skill WS").slug(SLUG).owner(owner).build());
        workspaceMemberRepository.save(WorkspaceMember.builder().workspace(workspace).user(owner).role(WorkspaceRole.OWNER).build());
    }

    private UpsertMemberSkillsRequest req(List<String> skills) {
        UpsertMemberSkillsRequest r = new UpsertMemberSkillsRequest();
        r.setSkills(skills);
        r.setProfileText("Backend dev");
        r.setSeniority("SENIOR");
        r.setCapacityHoursPerWeek(35);
        return r;
    }

    @Test
    @DisplayName("upsert (self) écrit le profil ; getProfile/listProfiles le relisent")
    void should_upsert_and_read() {
        service.upsert(SLUG, owner.getId(), req(List.of("java", "react")), owner.getId());

        var profile = service.getProfile(SLUG, owner.getId(), owner.getId());
        assertThat(profile.getUserId()).isEqualTo(owner.getId());

        assertThat(service.listProfiles(SLUG, owner.getId())).isNotEmpty();
    }

    @Test
    @DisplayName("upsert refuse un non-manager modifiant le profil d'autrui (ForbiddenException)")
    void should_reject_non_manager_editing_other() {
        User bob = userRepository.save(User.builder()
            .keycloakId("kc-bob").email("bob@it.dev").displayName("Bob").isActive(true).build());
        workspaceMemberRepository.save(WorkspaceMember.builder().workspace(workspace).user(bob).role(WorkspaceRole.MEMBER).build());

        // bob (MEMBER) tente de modifier le profil de owner → refus
        assertThatThrownBy(() -> service.upsert(SLUG, owner.getId(), req(List.of("go")), bob.getId()))
            .isInstanceOf(ForbiddenException.class);
    }
}
