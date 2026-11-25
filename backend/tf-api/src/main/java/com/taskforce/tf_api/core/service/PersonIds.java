package com.taskforce.tf_api.core.service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

import com.taskforce.tf_api.core.model.MissionPerson;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.MissionPersonRepository;
import com.taskforce.tf_api.core.repository.UserRepository;

import lombok.RequiredArgsConstructor;

/**
 * L'identifiant opaque d'une personne dans un espace (R159, M6 ; second tour, L-a) : {@code who:} et 32 chiffres
 * hexadécimaux, tiré la première fois, jamais son courriel. Le dossier d'une mission nomme ainsi les personnes, et le
 * paquet de règles ainsi celle qui répond de chaque règle (son {@code owner}) : le dossier garde le paquet tel que le
 * runner l'a reçu, sans courriel. La ligne part quand le compte est purgé ({@code MissionEvidenceService.forgetPerson}) :
 * l'identifiant reste, relié à personne.
 */
@Component
@RequiredArgsConstructor
public class PersonIds {

    /** Une personne qu'une règle nomme et que TaskForce ne retrouve pas : le paquet ne la nomme pas. */
    public static final String UNKNOWN = MissionPerson.PREFIX + "unknown";

    private final MissionPersonRepository people;
    private final UserRepository users;
    private final PlatformTransactionManager transactions;

    /** L'identifiant de cette personne dans cet espace, tiré la première fois ; null sans personne ou sans espace. */
    public String of(Long workspaceId, Long userId) {
        if (workspaceId == null || userId == null) {
            return null;
        }
        Optional<String> known = known(workspaceId, userId);
        if (known.isPresent()) {
            return known.get();
        }
        if (!TransactionSynchronizationManager.isCurrentTransactionReadOnly()) {
            // Deux transactions en écriture qui le tirent en même temps (deux prises de mission, une prise et une demande
            // d'accord) : la seconde attend la première, n'écrit rien, puis relit celui qui est resté (R159 de #551,
            // quatrième tour, d-b). Avant, elle échouait sur l'index unique.
            MissionPerson drawn = MissionPerson.draw(workspaceId, userId);
            people.drawIfAbsent(workspaceId, userId, drawn.getPerson(), drawn.getCreatedAt());
            return known(workspaceId, userId)
                .orElseThrow(() -> new IllegalStateException("The id of a person could not be drawn in workspace " + workspaceId));
        }
        // Un paquet se construit aussi dans une transaction de lecture (l'écran des règles, l'essai d'une règle, un outil de
        // Cortex) : l'identifiant se tire alors dans la sienne. Deux tirages à la fois : le second relit celui qui est resté.
        TransactionTemplate own = new TransactionTemplate(transactions);
        own.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        try {
            return own.execute(status -> people.saveAndFlush(MissionPerson.draw(workspaceId, userId)).getPerson());
        } catch (DataIntegrityViolationException raced) {
            return known(workspaceId, userId).orElseThrow(() -> raced);
        }
    }

    /**
     * Le propriétaire qu'une règle écrite avant la 1.18 nomme par son courriel, par son identifiant dans cet espace :
     * {@link #UNKNOWN} quand {@link #authorOf} ne retrouve pas son compte.
     */
    public String ofAuthor(Long workspaceId, Object addedBy, String email, LocalDateTime versionAt) {
        return authorOf(addedBy, email, versionAt).map(user -> of(workspaceId, user.getId())).orElse(UNKNOWN);
    }

    /**
     * Le compte qui a écrit une règle d'une version (R159 de #551, quatrième tour, d-c) : d'abord par son compte
     * ({@code addedBy}, que chaque règle garde depuis le 11 novembre 2026), et un compte purgé ne nomme plus personne. Le
     * courriel d'une règle plus ancienne ne sert qu'à défaut : sans tenir compte de la casse, et seulement pour un compte
     * créé avant la version ({@code versionAt}). Un compte qui reprend le courriel d'un compte purgé n'hérite ainsi d'aucune
     * règle ; sans la date de la version, le courriel ne nomme personne.
     */
    public Optional<User> authorOf(Object addedBy, String email, LocalDateTime versionAt) {
        return authorOf(users, addedBy, email, versionAt);
    }

    /** Comme {@link #authorOf(Object, String, LocalDateTime)}, sur ce dépôt des comptes : la copie du dossier lit ainsi les siens. */
    public static Optional<User> authorOf(UserRepository users, Object addedBy, String email, LocalDateTime versionAt) {
        Long account = accountOf(addedBy);
        if (account != null) {
            return users.findById(account);
        }
        if (email == null || email.isBlank() || versionAt == null) {
            return Optional.empty();
        }
        List<User> before = users.findAllByEmailIgnoreCase(email.strip()).stream()
            .filter(user -> user.getCreatedAt() != null && !user.getCreatedAt().isAfter(versionAt))
            .toList();
        return before.size() == 1 ? Optional.of(before.getFirst()) : Optional.empty();
    }

    /** Le compte que {@code addedBy} désigne : un nombre, ou son texte ; null sinon. */
    private static Long accountOf(Object addedBy) {
        if (addedBy instanceof Number number) {
            return number.longValue();
        }
        if (addedBy instanceof String text && !text.isBlank()) {
            try {
                return Long.valueOf(text.strip());
            } catch (NumberFormatException e) {
                return null;
            }
        }
        return null;
    }

    /** La personne qu'un identifiant de cet espace nomme, tant que son compte n'est pas purgé. */
    public Optional<Long> userOf(Long workspaceId, String id) {
        if (workspaceId == null || id == null || !id.startsWith(MissionPerson.PREFIX)) {
            return Optional.empty();
        }
        return people.findByWorkspaceIdAndPerson(workspaceId, id).map(MissionPerson::getUserId);
    }

    private Optional<String> known(Long workspaceId, Long userId) {
        return people.findByWorkspaceIdAndUserId(workspaceId, userId).map(MissionPerson::getPerson);
    }
}
