package com.taskforce.tf_api.core.service.delivery;

import java.util.Objects;

import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import com.taskforce.tf_api.core.repository.DeliveryRunRepository;
import com.taskforce.tf_api.core.service.IssueService;

import lombok.RequiredArgsConstructor;

/**
 * Ce que l'agent d'une mission coche dans la liste de son issue entre au dossier de la mission, comme une déclaration de
 * l'agent (R212, point 8 de la séance n°30 : « vérifié par » n'est pas « déclaré par l'agent »). Dans la transaction de
 * la coche : la liste et le dossier changent ensemble.
 */
@Component
@RequiredArgsConstructor
public class MissionChecklist {

    private final DeliveryRunRepository runs;
    private final MissionEvidenceService evidence;

    @EventListener
    public void onDeclared(IssueService.ChecklistDeclared declared) {
        runs.findById(declared.runId())
            .filter(run -> run.getIssue() != null && Objects.equals(run.getIssue().getId(), declared.item().getIssueId()))
            .ifPresent(run -> evidence.checked(run, declared.item()));
    }
}
