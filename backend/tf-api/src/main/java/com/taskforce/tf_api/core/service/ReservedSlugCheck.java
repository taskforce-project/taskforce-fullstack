package com.taskforce.tf_api.core.service;

import java.util.ArrayList;
import java.util.List;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import com.taskforce.tf_api.core.repository.WorkspaceRepository;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Au démarrage, un espace dont l'adresse est réservée à une page de l'app (R159 de #551, troisième tour, c-e). La réserve
 * ne vaut que pour une adresse qu'on pose désormais : un espace créé avant elle, nommé {@code verify} par exemple, garde
 * la sienne, et la page {@code /verify/<id>} du lien du témoin la masque. Rien ne la change d'office : le journal le dit
 * à l'exploitant, avec l'id de l'espace, jamais son nom.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ReservedSlugCheck {

    private final WorkspaceRepository workspaces;

    @EventListener(ApplicationReadyEvent.class)
    public void checkAtStart() {
        check();
    }

    /** Les ids des espaces dont l'adresse est réservée ; chacun a sa ligne au journal. */
    public List<Long> check() {
        List<Long> found = new ArrayList<>();
        for (String slug : WorkspaceService.RESERVED_SLUGS.stream().sorted().toList()) {
            workspaces.findBySlug(slug).ifPresent(workspace -> {
                log.warn("L'espace {} a l'adresse /{}, réservée à une page de l'app qui la masque : donnez-lui une autre "
                    + "adresse en base.", workspace.getId(), slug);
                found.add(workspace.getId());
            });
        }
        return found;
    }
}
