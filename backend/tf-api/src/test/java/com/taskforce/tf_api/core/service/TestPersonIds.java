package com.taskforce.tf_api.core.service;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;

import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.transaction.PlatformTransactionManager;

import com.taskforce.tf_api.core.model.MissionPerson;
import com.taskforce.tf_api.core.repository.MissionPersonRepository;
import com.taskforce.tf_api.core.repository.UserRepository;

/**
 * Les identifiants opaques des personnes pour un essai sans base : le vrai {@link PersonIds}, ses identifiants tirés et
 * gardés en mémoire. Sans dépôt des comptes, un courriel ne retrouve personne.
 */
public final class TestPersonIds {

    private TestPersonIds() {
    }

    public static PersonIds inMemory() {
        return inMemory(mock(UserRepository.class), mock(MissionPersonRepository.class));
    }

    public static PersonIds inMemory(UserRepository users) {
        return inMemory(users, mock(MissionPersonRepository.class));
    }

    /** Sur ce dépôt simulé des identifiants, que l'essai partage avec le service du dossier. */
    public static PersonIds inMemory(UserRepository users, MissionPersonRepository people) {
        Map<String, MissionPerson> byKey = new ConcurrentHashMap<>();
        lenient().when(people.findByWorkspaceIdAndUserId(anyLong(), anyLong()))
            .thenAnswer(inv -> Optional.ofNullable(byKey.get(inv.getArgument(0) + ":" + inv.getArgument(1))));
        lenient().when(people.findByWorkspaceIdAndPerson(anyLong(), anyString()))
            .thenAnswer(inv -> byKey.values().stream().filter(p -> Objects.equals(p.getWorkspaceId(), inv.getArgument(0))
                && p.getPerson().equals(inv.getArgument(1))).findFirst());
        lenient().when(people.saveAndFlush(any())).thenAnswer(inv -> {
            MissionPerson person = inv.getArgument(0);
            byKey.put(person.getWorkspaceId() + ":" + person.getUserId(), person);
            return person;
        });
        // Comme INSERT ... ON CONFLICT DO NOTHING : un identifiant déjà tiré reste (R159 de #551, quatrième tour, d-b).
        lenient().when(people.drawIfAbsent(anyLong(), anyLong(), anyString(), any())).thenAnswer(inv -> {
            MissionPerson drawn = MissionPerson.builder().workspaceId(inv.getArgument(0)).userId(inv.getArgument(1))
                .person(inv.getArgument(2)).createdAt(inv.getArgument(3)).build();
            return byKey.putIfAbsent(drawn.getWorkspaceId() + ":" + drawn.getUserId(), drawn) == null ? 1 : 0;
        });
        return new PersonIds(people, users, mock(PlatformTransactionManager.class));
    }
}
