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

    // =========================================================================
    // uploadAvatar (21 lignes manquées) — succès + branches d'erreur de validation
    // =========================================================================

    @Test
    @DisplayName("uploadAvatar délègue à Minio et enregistre l'URL proxy interne")
    void should_upload_avatar_and_store_proxy_url() {
        when(keycloakService.getUserById(anyString())).thenReturn(kcRep());
        var file = new org.springframework.mock.web.MockMultipartFile(
            "file", "photo.PNG", "image/png", new byte[] {1, 2, 3, 4});

        var res = userService.uploadAvatar("owner@it.dev", file);

        String expectedUrl = "/api/files/avatars/" + user.getId();
        assertThat(res.getAvatarUrl()).isEqualTo(expectedUrl);
        assertThat(userRepository.findById(user.getId()).orElseThrow().getAvatarUrl()).isEqualTo(expectedUrl);
        org.mockito.Mockito.verify(minioService).upload(
            org.mockito.ArgumentMatchers.eq("avatars/" + user.getId() + "/avatar"),
            org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.eq((long) 4),
            org.mockito.ArgumentMatchers.eq("image/png"));
    }

    @Test
    @DisplayName("uploadAvatar refuse un fichier vide → IllegalArgumentException")
    void should_reject_empty_avatar() {
        var empty = new org.springframework.mock.web.MockMultipartFile(
            "file", "empty.png", "image/png", new byte[0]);

        assertThatThrownBy(() -> userService.uploadAvatar("owner@it.dev", empty))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("vide");
    }

    @Test
    @DisplayName("uploadAvatar refuse un fichier de plus de 3 Mo → IllegalArgumentException")
    void should_reject_oversized_avatar() {
        var big = new org.springframework.mock.web.MockMultipartFile(
            "file", "big.jpg", "image/jpeg", new byte[3 * 1024 * 1024 + 1]);

        assertThatThrownBy(() -> userService.uploadAvatar("owner@it.dev", big))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("volumineux");
    }

    @Test
    @DisplayName("uploadAvatar lève ResourceNotFoundException pour un email inconnu")
    void should_reject_upload_for_unknown_email() {
        var file = new org.springframework.mock.web.MockMultipartFile(
            "file", "photo.png", "image/png", new byte[] {1, 2, 3});

        assertThatThrownBy(() -> userService.uploadAvatar("nobody@it.dev", file))
            .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    @DisplayName("uploadAvatar propage un échec Minio en RuntimeException")
    void should_wrap_minio_failure() {
        org.mockito.Mockito.doThrow(new RuntimeException("minio down"))
            .when(minioService).upload(anyString(), org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.anyLong(), anyString());
        var file = new org.springframework.mock.web.MockMultipartFile(
            "file", "photo.png", "image/png", new byte[] {9, 9, 9});

        assertThatThrownBy(() -> userService.uploadAvatar("owner@it.dev", file))
            .isInstanceOf(RuntimeException.class)
            .hasMessageContaining("Échec de l'upload avatar");
    }

    // =========================================================================
    // updateUserByEmail — branches supplémentaires (not-found + propagation Keycloak)
    // =========================================================================

    @Test
    @DisplayName("updateUserByEmail lève ResourceNotFoundException pour un email inconnu")
    void should_reject_update_for_unknown_email() {
        UpdateUserRequest req = new UpdateUserRequest();
        req.setDisplayName("X");

        assertThatThrownBy(() -> userService.updateUserByEmail("nobody@it.dev", req))
            .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    @DisplayName("updateUserByEmail propage les noms vers Keycloak et met à jour l'avatar")
    void should_update_avatar_and_propagate_names() {
        when(keycloakService.getUserById(anyString())).thenReturn(kcRep());
        UpdateUserRequest req = new UpdateUserRequest();
        req.setFirstName("Jane");
        req.setLastName("Roe");
        req.setAvatarUrl("https://cdn/av.png");

        userService.updateUserByEmail("owner@it.dev", req);

        assertThat(userRepository.findById(user.getId()).orElseThrow().getAvatarUrl())
            .isEqualTo("https://cdn/av.png");
        org.mockito.Mockito.verify(keycloakService).updateUserNames("kc-user", "Jane", "Roe");
    }

    // =========================================================================
    // buildRawDisplayName (via getByEmail, sync depuis Keycloak) — 3 branches non-null
    // =========================================================================

    private User persistUserNoDisplayName(String kc, String email, String first, String last) {
        User u = userRepository.save(User.builder()
            .keycloakId(kc).email(email).displayName(null).isActive(true).build());
        UserRepresentation rep = new UserRepresentation();
        rep.setFirstName(first);
        rep.setLastName(last);
        // getByEmail appelle getUserById(keycloakId) : on stubbe par id précis
        when(keycloakService.getUserById(kc)).thenReturn(rep);
        return u;
    }

    @Test
    @DisplayName("getByEmail sans displayName : prénom + nom → 'Prénom Nom'")
    void should_sync_display_name_first_and_last() {
        User u = persistUserNoDisplayName("kc-fl", "fl@it.dev", "Ada", "Lovelace");

        userService.getByEmail("fl@it.dev");

        assertThat(userRepository.findById(u.getId()).orElseThrow().getDisplayName())
            .isEqualTo("Ada Lovelace");
    }

    @Test
    @DisplayName("getByEmail sans displayName : prénom seul → prénom")
    void should_sync_display_name_first_only() {
        User u = persistUserNoDisplayName("kc-f", "f@it.dev", "Grace", "  ");

        userService.getByEmail("f@it.dev");

        assertThat(userRepository.findById(u.getId()).orElseThrow().getDisplayName())
            .isEqualTo("Grace");
    }

    @Test
    @DisplayName("getByEmail sans displayName : nom seul → nom")
    void should_sync_display_name_last_only() {
        User u = persistUserNoDisplayName("kc-l", "l@it.dev", null, "Hopper");

        userService.getByEmail("l@it.dev");

        assertThat(userRepository.findById(u.getId()).orElseThrow().getDisplayName())
            .isEqualTo("Hopper");
    }
}
