package com.taskforce.tf_api.modules.transfer.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;

/** Qui prend la place d'une personne d'un fichier de projet, sur le serveur et dans l'app desktop. */
@ExtendWith(MockitoExtension.class)
@DisplayName("ImportedPeople : personnes d'un fichier de projet")
class ImportedPeopleTest {

    private static final long IMPORTER = 1L;
    private static final long WORKSPACE = 10L;

    @Mock private UserRepository userRepository;
    @Mock private WorkspaceMemberRepository workspaceMemberRepository;

    @Nested
    @DisplayName("sur le serveur")
    class Server {

        private ServerImportedPeople people;

        @BeforeEach
        void setUp() {
            people = new ServerImportedPeople(userRepository, workspaceMemberRepository);
            lenient().when(userRepository.findByEmail("mate@acme.dev")).thenReturn(Optional.of(User.builder().id(2L).build()));
        }

        @ParameterizedTest(name = "{0}, membre de l'espace : {1} → {2}")
        @CsvSource({
            "mate@acme.dev, true, 2",
            "mate@acme.dev, false, 1",
            "stranger@acme.dev, false, 1",
        })
        @DisplayName("le membre de l'espace qui a la même adresse, sinon la personne qui importe")
        void resolves(String email, boolean member, long expected) {
            lenient().when(workspaceMemberRepository.existsByWorkspaceIdAndUserId(WORKSPACE, 2L)).thenReturn(member);

            assertThat(people.resolve(email, "Mate", IMPORTER, WORKSPACE)).isEqualTo(expected);
            verify(userRepository, never()).save(any());
        }

        @ParameterizedTest(name = "adresse « {0} »")
        @NullAndEmptySource
        @ValueSource(strings = " ")
        @DisplayName("sans adresse : la personne qui importe")
        void without_an_address(String email) {
            assertThat(people.resolve(email, "Mate", IMPORTER, WORKSPACE)).isEqualTo(IMPORTER);
        }
    }

    @Nested
    @DisplayName("dans l'app desktop")
    class Desktop {

        private DesktopImportedPeople people;

        @BeforeEach
        void setUp() {
            people = new DesktopImportedPeople(userRepository);
        }

        @Test
        @DisplayName("l'utilisateur local qui a la même adresse")
        void a_known_person() {
            when(userRepository.findByEmail("mate@acme.dev")).thenReturn(Optional.of(User.builder().id(2L).build()));

            assertThat(people.resolve(" mate@acme.dev ", "Mate", IMPORTER, WORKSPACE)).isEqualTo(2L);
            verify(userRepository, never()).save(any());
        }

        @ParameterizedTest(name = "nom « {0} » → « {1} »")
        @CsvSource(value = {"Mate Smith, Mate Smith", "'', mate@acme.dev", "NULL, mate@acme.dev"}, nullValues = "NULL")
        @DisplayName("une autre personne est gardée à son nom, sans pouvoir ouvrir l'app")
        void a_new_person_is_kept_by_name(String name, String shown) {
            when(userRepository.findByEmail("mate@acme.dev")).thenReturn(Optional.empty());
            when(userRepository.save(any(User.class))).thenAnswer(invocation -> {
                User user = invocation.getArgument(0);
                user.setId(3L);
                return user;
            });

            assertThat(people.resolve("mate@acme.dev", name, IMPORTER, WORKSPACE)).isEqualTo(3L);

            ArgumentCaptor<User> saved = ArgumentCaptor.forClass(User.class);
            verify(userRepository).save(saved.capture());
            assertThat(saved.getValue().getKeycloakId()).startsWith(DesktopImportedPeople.PLACEHOLDER_PREFIX);
            assertThat(saved.getValue().getIsActive()).isFalse();
            assertThat(saved.getValue().getDisplayName()).isEqualTo(shown);
        }

        @Test
        @DisplayName("sans adresse : la personne qui importe")
        void without_an_address() {
            assertThat(people.resolve(null, "Mate", IMPORTER, WORKSPACE)).isEqualTo(IMPORTER);
        }
    }
}
