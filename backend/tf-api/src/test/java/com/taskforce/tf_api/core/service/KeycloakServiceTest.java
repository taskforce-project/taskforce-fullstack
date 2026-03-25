package com.taskforce.tf_api.core.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.keycloak.admin.client.Keycloak;
import org.keycloak.admin.client.resource.RealmResource;
import org.keycloak.admin.client.resource.UserResource;
import org.keycloak.admin.client.resource.UsersResource;
import org.keycloak.representations.idm.CredentialRepresentation;
import org.keycloak.representations.idm.UserRepresentation;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import jakarta.ws.rs.core.Response;
import java.util.Collections;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("KeycloakService Tests")
class KeycloakServiceTest {

    @Mock
    private Keycloak keycloak;

    @Mock
    private RealmResource realmResource;

    @Mock
    private UsersResource usersResource;

    @Mock
    private UserResource userResource;

    @Mock
    private Response response;

    @InjectMocks
    private KeycloakService keycloakService;

    @BeforeEach
    void setup() {
        // Configuration des propriétés
        ReflectionTestUtils.setField(keycloakService, "serverUrl", "http://localhost:8180");
        ReflectionTestUtils.setField(keycloakService, "realm", "taskforce");
        ReflectionTestUtils.setField(keycloakService, "adminUsername", "admin");
        ReflectionTestUtils.setField(keycloakService, "adminPassword", "admin");
        ReflectionTestUtils.setField(keycloakService, "adminClientId", "admin-cli");
        
        // Injection manuelle du realmResource mocké
        ReflectionTestUtils.setField(keycloakService, "realmResource", realmResource);
    }

    @Nested
    @DisplayName("Create User Tests")
    class CreateUserTests {

        @Test
        @DisplayName("devrait créer utilisateur avec succès")
        void createUser_withValidData_shouldCreateUser() {
            // Given
            String email = "test@example.com";
            String password = "Password123!";
            String firstName = "John";
            String lastName = "Doe";

            when(realmResource.users()).thenReturn(usersResource);
            when(usersResource.create(any(UserRepresentation.class))).thenReturn(response);
            when(response.getStatus()).thenReturn(201);
            when(response.getHeaderString("Location")).thenReturn("http://keycloak/users/user-123");

            // When
            String keycloakId = keycloakService.createUser(email, password, firstName, lastName);

            // Then
            assertThat(keycloakId).isEqualTo("user-123");
            verify(usersResource).create(any(UserRepresentation.class));
            verify(response).close();
        }

        @Test
        @DisplayName("devrait configurer les bonnes propriétés utilisateur")
        void createUser_shouldSetCorrectUserProperties() {
            // Given
            when(realmResource.users()).thenReturn(usersResource);
            when(usersResource.create(any(UserRepresentation.class))).thenReturn(response);
            when(response.getStatus()).thenReturn(201);
            when(response.getHeaderString("Location")).thenReturn("http://keycloak/users/user-123");

            // When
            keycloakService.createUser("test@example.com", "pass", "Jane", "Smith");

            // Then
            verify(usersResource).create(argThat(user ->
                    user.getEmail().equals("test@example.com") &&
                            user.getUsername().equals("test@example.com") &&
                            user.getFirstName().equals("Jane") &&
                            user.getLastName().equals("Smith") &&
                            user.isEnabled() &&
                            !user.isEmailVerified() &&
                            user.getCredentials().size() == 1
            ));
        }

        @Test
        @DisplayName("devrait lancer exception si création échoue")
        void createUser_withError_shouldThrowException() {
            // Given
            when(realmResource.users()).thenReturn(usersResource);
            when(usersResource.create(any(UserRepresentation.class))).thenReturn(response);
            when(response.getStatus()).thenReturn(409); // Conflict
            when(response.readEntity(String.class)).thenReturn("User already exists");

            // When/Then
            assertThatThrownBy(() ->
                    keycloakService.createUser("test@example.com", "pass", "John", "Doe")
            )
                    .isInstanceOf(RuntimeException.class)
                    .hasMessageContaining("Erreur lors de la création de l'utilisateur");

            verify(response).close();
        }
    }

    @Nested
    @DisplayName("Verify Email Tests")
    class VerifyEmailTests {

        @Test
        @DisplayName("devrait vérifier email avec succès")
        void verifyEmail_withValidId_shouldVerifyEmail() {
            // Given
            String keycloakId = "user-123";
            UserRepresentation user = new UserRepresentation();
            user.setEmailVerified(false);

            when(realmResource.users()).thenReturn(usersResource);
            when(usersResource.get(keycloakId)).thenReturn(userResource);
            when(userResource.toRepresentation()).thenReturn(user);
            doNothing().when(userResource).update(any(UserRepresentation.class));

            // When
            keycloakService.verifyEmail(keycloakId);

            // Then
            verify(userResource).update(argThat(u -> u.isEmailVerified()));
        }
    }

    @Nested
    @DisplayName("Get User Tests")
    class GetUserTests {

        @Test
        @DisplayName("devrait récupérer utilisateur par ID")
        void getUserById_withValidId_shouldReturnUser() {
            // Given
            String keycloakId = "user-123";
            UserRepresentation expectedUser = new UserRepresentation();
            expectedUser.setId(keycloakId);
            expectedUser.setEmail("test@example.com");

            when(realmResource.users()).thenReturn(usersResource);
            when(usersResource.get(keycloakId)).thenReturn(userResource);
            when(userResource.toRepresentation()).thenReturn(expectedUser);

            // When
            UserRepresentation result = keycloakService.getUserById(keycloakId);

            // Then
            assertThat(result).isNotNull();
            assertThat(result.getId()).isEqualTo(keycloakId);
            assertThat(result.getEmail()).isEqualTo("test@example.com");
        }

        @Test
        @DisplayName("devrait récupérer utilisateur par email")
        void getUserByEmail_withValidEmail_shouldReturnUser() {
            // Given
            String email = "test@example.com";
            UserRepresentation expectedUser = new UserRepresentation();
            expectedUser.setEmail(email);

            when(realmResource.users()).thenReturn(usersResource);
            when(usersResource.search(email, true)).thenReturn(List.of(expectedUser));

            // When
            UserRepresentation result = keycloakService.getUserByEmail(email);

            // Then
            assertThat(result).isNotNull();
            assertThat(result.getEmail()).isEqualTo(email);
        }

        @Test
        @DisplayName("devrait lancer exception si email non trouvé")
        void getUserByEmail_withNonExistentEmail_shouldThrowException() {
            // Given
            String email = "nonexistent@example.com";
            when(realmResource.users()).thenReturn(usersResource);
            when(usersResource.search(email, true)).thenReturn(Collections.emptyList());

            // When/Then
            assertThatThrownBy(() -> keycloakService.getUserByEmail(email))
                    .isInstanceOf(RuntimeException.class)
                    .hasMessageContaining("Utilisateur non trouvé");
        }
    }

    @Nested
    @DisplayName("Email Exists Tests")
    class EmailExistsTests {

        @Test
        @DisplayName("devrait retourner true si email existe")
        void emailExists_withExistingEmail_shouldReturnTrue() {
            // Given
            String email = "existing@example.com";
            UserRepresentation user = new UserRepresentation();
            user.setEmail(email);

            when(realmResource.users()).thenReturn(usersResource);
            when(usersResource.search(email, true)).thenReturn(List.of(user));

            // When
            boolean exists = keycloakService.emailExists(email);

            // Then
            assertThat(exists).isTrue();
        }

        @Test
        @DisplayName("devrait retourner false si email n'existe pas")
        void emailExists_withNonExistentEmail_shouldReturnFalse() {
            // Given
            String email = "nonexistent@example.com";
            when(realmResource.users()).thenReturn(usersResource);
            when(usersResource.search(email, true)).thenReturn(Collections.emptyList());

            // When
            boolean exists = keycloakService.emailExists(email);

            // Then
            assertThat(exists).isFalse();
        }
    }

    @Nested
    @DisplayName("Update Password Tests")
    class UpdatePasswordTests {

        @Test
        @DisplayName("devrait mettre à jour le mot de passe")
        void updatePassword_withValidData_shouldUpdatePassword() {
            // Given
            String keycloakId = "user-123";
            String newPassword = "NewPassword123!";

            when(realmResource.users()).thenReturn(usersResource);
            when(usersResource.get(keycloakId)).thenReturn(userResource);
            doNothing().when(userResource).resetPassword(any(CredentialRepresentation.class));

            // When
            keycloakService.updatePassword(keycloakId, newPassword);

            // Then
            verify(userResource).resetPassword(argThat(cred ->
                    cred.getType().equals(CredentialRepresentation.PASSWORD) &&
                            cred.getValue().equals(newPassword) &&
                            !cred.isTemporary()
            ));
        }
    }

    @Nested
    @DisplayName("Set User Enabled Tests")
    class SetUserEnabledTests {

        @Test
        @DisplayName("devrait activer un utilisateur")
        void setUserEnabled_withTrueFlag_shouldEnableUser() {
            // Given
            String keycloakId = "user-123";
            UserRepresentation user = new UserRepresentation();
            user.setEnabled(false);

            when(realmResource.users()).thenReturn(usersResource);
            when(usersResource.get(keycloakId)).thenReturn(userResource);
            when(userResource.toRepresentation()).thenReturn(user);
            doNothing().when(userResource).update(any(UserRepresentation.class));

            // When
            keycloakService.setUserEnabled(keycloakId, true);

            // Then
            verify(userResource).update(argThat(u -> u.isEnabled()));
        }

        @Test
        @DisplayName("devrait désactiver un utilisateur")
        void setUserEnabled_withFalseFlag_shouldDisableUser() {
            // Given
            String keycloakId = "user-123";
            UserRepresentation user = new UserRepresentation();
            user.setEnabled(true);

            when(realmResource.users()).thenReturn(usersResource);
            when(usersResource.get(keycloakId)).thenReturn(userResource);
            when(userResource.toRepresentation()).thenReturn(user);
            doNothing().when(userResource).update(any(UserRepresentation.class));

            // When
            keycloakService.setUserEnabled(keycloakId, false);

            // Then
            verify(userResource).update(argThat(u -> !u.isEnabled()));
        }
    }

    @Nested
    @DisplayName("Delete User Tests")
    class DeleteUserTests {

        @Test
        @DisplayName("devrait supprimer un utilisateur")
        void deleteUser_withValidId_shouldDeleteUser() {
            // Given
            String keycloakId = "user-123";

            when(realmResource.users()).thenReturn(usersResource);
            when(usersResource.get(keycloakId)).thenReturn(userResource);
            doNothing().when(userResource).remove();

            // When
            keycloakService.deleteUser(keycloakId);

            // Then
            verify(userResource).remove();
        }
    }
}
