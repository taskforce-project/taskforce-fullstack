package com.taskforce.tf_api.core.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.keycloak.representations.idm.UserRepresentation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import com.taskforce.tf_api.core.dto.request.UpdateUserRequest;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;
import com.taskforce.tf_api.util.AbstractIntegrationTest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

/**
 * Tests d'intégration — {@link UserService}. Repos réels ; Keycloak/Minio/Email mockés.
 * Couvre getByEmail (+ génération avatar/sync), updateUserByEmail, searchUsers, processDataRequest (RGPD).
 */
@DisplayName("UserService (intégration Postgres)")
@Import(UserService.class)
class UserServiceIntegrationTest extends AbstractIntegrationTest {

    @Autowired private UserService userService;
    @Autowired private UserRepository userRepository;

    @MockitoBean private KeycloakService keycloakService;
    @MockitoBean private com.taskforce.tf_api.modules.ged.service.MinioService minioService;
    @MockitoBean private EmailService emailService;

    private User user;

    @BeforeEach
    void seed() {
        user = userRepository.save(User.builder()
            .keycloakId("kc-user").email("owner@it.dev").displayName("Owner").isActive(true).build());
    }

    private UserRepresentation kcRep() {
        UserRepresentation r = new UserRepresentation();
        r.setFirstName("John");
        r.setLastName("Doe");
        return r;
    }

    @Test
    @DisplayName("getByEmail renvoie le profil et génère un avatar si absent")
    void should_get_by_email() {
        when(keycloakService.getUserById(anyString())).thenReturn(kcRep());

        var res = userService.getByEmail("owner@it.dev");

        assertThat(res.getEmail()).isEqualTo("owner@it.dev");
        assertThat(userRepository.findById(user.getId()).orElseThrow().getAvatarUrl()).contains("dicebear");
    }

    @Test
    @DisplayName("getByEmail lève ResourceNotFoundException pour un email inconnu")
    void should_throw_when_unknown() {
        assertThatThrownBy(() -> userService.getByEmail("nobody@it.dev"))
            .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    @DisplayName("updateUserByEmail met à jour le displayName")
    void should_update_display_name() {
        when(keycloakService.getUserById(anyString())).thenReturn(kcRep());
        UpdateUserRequest req = new UpdateUserRequest();
        req.setDisplayName("Updated");

        userService.updateUserByEmail("owner@it.dev", req);

        assertThat(userRepository.findById(user.getId()).orElseThrow().getDisplayName()).isEqualTo("Updated");
    }

    @Test
    @DisplayName("searchUsers retrouve un utilisateur par terme")
    void should_search_users() {
        userRepository.save(User.builder()
            .keycloakId("kc-findme").email("findme@it.dev").displayName("findme").isActive(true).build());

        assertThat(userService.searchUsers("findme")).isNotEmpty();
        assertThat(userService.searchUsers("  ")).isEmpty(); // requête vide
    }

    @Test
    @DisplayName("processDataRequest DELETION désactive le compte et notifie")
    void should_process_deletion_request() {
        when(keycloakService.getUserById(anyString())).thenReturn(kcRep());

        userService.processDataRequest("owner@it.dev", "DELETION");

        assertThat(userRepository.findById(user.getId()).orElseThrow().getIsActive()).isFalse();
        org.mockito.Mockito.verify(emailService)
            .sendDataRequestEmail(anyString(), anyString(), org.mockito.ArgumentMatchers.eq("DELETION"));
    }
}
