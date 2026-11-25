package com.taskforce.tf_api.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.SimpleTransactionStatus;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.taskforce.tf_api.core.model.MissionPerson;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.MissionPersonRepository;
import com.taskforce.tf_api.core.repository.UserRepository;

@ExtendWith(MockitoExtension.class)
@DisplayName("L'identifiant opaque d'une personne dans un espace, que le dossier et les règles partagent")
class PersonIdsTest {

    @Mock private MissionPersonRepository people;
    @Mock private UserRepository users;
    @Mock private PlatformTransactionManager transactions;

    private PersonIds ids;

    @BeforeEach
    void setUp() {
        ids = new PersonIds(people, users, transactions);
    }

    @AfterEach
    void tearDown() {
        TransactionSynchronizationManager.setCurrentTransactionReadOnly(false);
    }

    @Test
    @DisplayName("un identifiant déjà tiré revient tel quel, sans rien écrire")
    void aKnownIdComesBack() {
        when(people.findByWorkspaceIdAndUserId(3L, 7L)).thenReturn(Optional.of(person(3L, 7L, "who:" + "1".repeat(32))));

        assertThat(ids.of(3L, 7L)).isEqualTo("who:" + "1".repeat(32));
        verify(people, never()).saveAndFlush(any());
    }

    @Test
    @DisplayName("la première fois, l'identifiant se tire dans la transaction en cours : 128 bits, jamais le courriel")
    void theFirstTimeItIsDrawn() {
        ArgumentCaptor<String> drawn = ArgumentCaptor.forClass(String.class);
        when(people.drawIfAbsent(eq(3L), eq(7L), drawn.capture(), any())).thenReturn(1);
        when(people.findByWorkspaceIdAndUserId(3L, 7L)).thenReturn(Optional.empty())
            .thenAnswer(inv -> Optional.of(person(3L, 7L, drawn.getValue())));

        String id = ids.of(3L, 7L);

        assertThat(id).matches("who:[0-9a-f]{32}").isEqualTo(drawn.getValue());
        verify(transactions, never()).getTransaction(any());
        verify(people, never()).saveAndFlush(any());
    }

    @Test
    @DisplayName("R159 de #551, quatrième tour, d-b : une autre transaction en écriture l'a tiré en même temps ; rien n'échoue, celui qui est resté revient")
    void aRaceBetweenTwoWritersKeepsTheFirstId() {
        when(people.drawIfAbsent(eq(3L), eq(7L), any(), any())).thenReturn(0);
        when(people.findByWorkspaceIdAndUserId(3L, 7L)).thenReturn(Optional.empty(),
            Optional.of(person(3L, 7L, "who:" + "5".repeat(32))));

        assertThat(ids.of(3L, 7L)).isEqualTo("who:" + "5".repeat(32));
        verify(people, never()).saveAndFlush(any());
    }

    @Test
    @DisplayName("dans une transaction de lecture (l'écran des règles), il se tire dans la sienne")
    void insideAReadOnlyTransactionItIsDrawnInItsOwn() {
        TransactionSynchronizationManager.setCurrentTransactionReadOnly(true);
        when(transactions.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
        when(people.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));

        assertThat(ids.of(3L, 7L)).matches("who:[0-9a-f]{32}");
        verify(transactions).getTransaction(argThat(definition ->
            definition.getPropagationBehavior() == TransactionDefinition.PROPAGATION_REQUIRES_NEW && !definition.isReadOnly()));
        verify(transactions).commit(any());
    }

    @Test
    @DisplayName("deux tirages à la fois : le second relit celui qui est resté")
    void aRaceKeepsTheFirstId() {
        TransactionSynchronizationManager.setCurrentTransactionReadOnly(true);
        when(transactions.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
        when(people.findByWorkspaceIdAndUserId(3L, 7L)).thenReturn(Optional.empty(),
            Optional.of(person(3L, 7L, "who:" + "2".repeat(32))));
        when(people.saveAndFlush(any())).thenThrow(new DataIntegrityViolationException("uq_mission_people"));

        assertThat(ids.of(3L, 7L)).isEqualTo("who:" + "2".repeat(32));
    }

    @Test
    @DisplayName("sans personne ou sans espace, aucun identifiant")
    void nothingWithoutAPerson() {
        assertThat(ids.of(null, 7L)).isNull();
        assertThat(ids.of(3L, null)).isNull();
    }

    @Test
    @DisplayName("un courriel d'avant la 1.18 donne l'identifiant de son compte ; sans compte, personne")
    void anEmailGivesTheIdOfItsAccount() {
        lenient().when(users.findByEmail("ada@example.com"))
            .thenReturn(Optional.of(User.builder().id(7L).email("ada@example.com").build()));
        when(people.findByWorkspaceIdAndUserId(3L, 7L)).thenReturn(Optional.of(person(3L, 7L, "who:" + "3".repeat(32))));

        assertThat(ids.ofEmail(3L, " ada@example.com ")).isEqualTo("who:" + "3".repeat(32));
        assertThat(ids.ofEmail(3L, "gone@example.com")).isEqualTo(PersonIds.UNKNOWN);
        assertThat(ids.ofEmail(3L, " ")).isEqualTo(PersonIds.UNKNOWN);
    }

    @Test
    @DisplayName("un identifiant ne retrouve sa personne que dans son espace, et tant que son compte n'est pas purgé")
    void anIdFindsItsPersonInItsWorkspace() {
        lenient().when(people.findByWorkspaceIdAndPerson(3L, "who:" + "4".repeat(32)))
            .thenReturn(Optional.of(person(3L, 7L, "who:" + "4".repeat(32))));

        assertThat(ids.userOf(3L, "who:" + "4".repeat(32))).contains(7L);
        assertThat(ids.userOf(4L, "who:" + "4".repeat(32))).isEmpty();
        assertThat(ids.userOf(3L, "person:7")).isEmpty();
    }

    private static MissionPerson person(Long workspaceId, Long userId, String id) {
        return MissionPerson.builder().workspaceId(workspaceId).userId(userId).person(id).build();
    }
}
