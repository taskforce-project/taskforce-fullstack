package com.taskforce.tf_api.core.service;

import java.time.LocalDate;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;

import com.taskforce.tf_api.core.dto.request.CreateLeaveRequest;
import com.taskforce.tf_api.core.enums.LeaveType;
import com.taskforce.tf_api.core.enums.WorkspaceRole;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.model.WorkspaceMember;
import com.taskforce.tf_api.core.repository.MemberLeaveRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.util.AbstractIntegrationTest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Tests d'intégration — {@link MemberLeaveService} (repos réels).
 * Congés/absences d'un membre : création (self), garde-fou de dates, listing, suppression.
 */
@DisplayName("MemberLeaveService (intégration Postgres)")
@Import(MemberLeaveService.class)
class MemberLeaveServiceIntegrationTest extends AbstractIntegrationTest {

    @Autowired private MemberLeaveService memberLeaveService;
    @Autowired private MemberLeaveRepository memberLeaveRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private WorkspaceRepository workspaceRepository;
    @Autowired private WorkspaceMemberRepository workspaceMemberRepository;

    private static final String SLUG = "ws-leave-it";
    private User owner;

    @BeforeEach
    void seed() {
        owner = userRepository.save(User.builder()
            .keycloakId("kc-leave").email("leave@it.dev").displayName("Owner").isActive(true).build());
        Workspace ws = workspaceRepository.save(Workspace.builder().name("Leave WS").slug(SLUG).owner(owner).build());
        workspaceMemberRepository.save(WorkspaceMember.builder().workspace(ws).user(owner).role(WorkspaceRole.OWNER).build());
    }

    private CreateLeaveRequest req(LocalDate start, LocalDate end) {
        CreateLeaveRequest r = new CreateLeaveRequest();
        r.setType(LeaveType.VACATION);
        r.setStartDate(start);
        r.setEndDate(end);
        r.setNote("Congés");
        return r;
    }

    @Test
    @DisplayName("createLeave (self) persiste puis listLeaves le retrouve")
    void should_create_and_list() {
        memberLeaveService.createLeave(SLUG, owner.getId(), owner.getId(),
            req(LocalDate.of(2026, 8, 1), LocalDate.of(2026, 8, 10)));

        assertThat(memberLeaveService.listLeaves(SLUG, owner.getId(), owner.getId())).hasSize(1);
    }

    @Test
    @DisplayName("createLeave refuse une date de fin antérieure au début")
    void should_reject_bad_dates() {
        assertThatThrownBy(() -> memberLeaveService.createLeave(SLUG, owner.getId(), owner.getId(),
            req(LocalDate.of(2026, 8, 10), LocalDate.of(2026, 8, 1))))
            .isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("deleteLeave retire le congé")
    void should_delete() {
        memberLeaveService.createLeave(SLUG, owner.getId(), owner.getId(),
            req(LocalDate.of(2026, 8, 1), LocalDate.of(2026, 8, 10)));
        Long leaveId = memberLeaveRepository.findAll().get(0).getId();

        memberLeaveService.deleteLeave(SLUG, owner.getId(), leaveId, owner.getId());

        assertThat(memberLeaveService.listLeaves(SLUG, owner.getId(), owner.getId())).isEmpty();
    }
}
