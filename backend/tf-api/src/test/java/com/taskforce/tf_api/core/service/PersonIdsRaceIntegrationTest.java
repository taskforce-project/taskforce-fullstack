package com.taskforce.tf_api.core.service;

import static java.util.concurrent.TimeUnit.SECONDS;
import static org.assertj.core.api.Assertions.assertThat;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.MissionPersonRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.util.AbstractIntegrationTest;

/**
 * Deux transactions en écriture tirent ensemble l'identifiant d'une personne qui n'en a pas encore (R159 de #551,
 * quatrième tour, d-b) : deux prises de mission, ou une prise et une demande d'accord, dans un espace dont le propriétaire
 * n'a pas encore son {@code who:}, comme tous au déploiement. Contre un vrai Postgres, chacune dans sa transaction, validée
 * ({@code NOT_SUPPORTED}) : la seconde attend la première sur l'index unique, puis reçoit le même identifiant. Avant, elle
 * échouait sur « uq_mission_people ».
 */
@DisplayName("Deux tirages du même identifiant à la fois, en écriture, contre Postgres (R159 de #551, d-b)")
@Import(PersonIds.class)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class PersonIdsRaceIntegrationTest extends AbstractIntegrationTest {

    @Autowired private PersonIds ids;
    @Autowired private UserRepository users;
    @Autowired private WorkspaceRepository workspaces;
    @Autowired private MissionPersonRepository people;
    @Autowired private PlatformTransactionManager transactionManager;

    private Long userId;
    private Long workspaceId;

    @BeforeEach
    void seed() {
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            User ada = users.save(User.builder().keycloakId("kc-ada-race").email("ada@race.dev").displayName("Ada Lovelace")
                .isActive(true).build());
            Workspace workspace = workspaces.save(Workspace.builder().name("Race").slug("ws-race-it").owner(ada).build());
            userId = ada.getId();
            workspaceId = workspace.getId();
        });
    }

    @AfterEach
    void clean() {
        // L'identifiant part avec l'espace (ON DELETE CASCADE), puis le compte.
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            workspaces.deleteById(workspaceId);
            users.deleteById(userId);
        });
    }

    @Test
    @DisplayName("la seconde attend la première sur l'index unique, n'échoue pas, et reçoit le même identifiant")
    void two_writers_drawing_at_once_get_the_same_id() throws Exception {
        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        CountDownLatch firstDrew = new CountDownLatch(1);
        CountDownLatch secondGoes = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<String> first = pool.submit(() -> tx.execute(status -> {
                String id = ids.of(workspaceId, userId);
                firstDrew.countDown();
                // La première tient sa transaction ouverte : la seconde tire pendant ce temps, et attend sur l'index unique.
                awaitQuietly(secondGoes);
                sleepQuietly(1000);
                return id;
            }));
            Future<String> second = pool.submit(() -> {
                awaitQuietly(firstDrew);
                secondGoes.countDown();
                return tx.execute(status -> ids.of(workspaceId, userId));
            });

            String kept = first.get(30, SECONDS);
            assertThat(kept).matches("who:[0-9a-f]{32}");
            assertThat(second.get(30, SECONDS)).isEqualTo(kept);
            assertThat(people.findByUserId(userId)).hasSize(1);
        } finally {
            pool.shutdownNow();
        }
    }

    private static void awaitQuietly(CountDownLatch latch) {
        try {
            if (!latch.await(30, SECONDS)) throw new IllegalStateException("the other transaction never came");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(e);
        }
    }

    private static void sleepQuietly(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(e);
        }
    }
}
