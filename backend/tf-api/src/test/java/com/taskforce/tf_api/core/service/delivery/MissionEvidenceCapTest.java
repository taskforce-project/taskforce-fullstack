package com.taskforce.tf_api.core.service.delivery;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.taskforce.tf_api.core.enums.DeliveryRunStatus;

/** Au plafond de son dossier, la mission s'arrête par le chemin d'arrêt de toujours (R159, second tour, N2). */
@DisplayName("Au plafond du dossier, la mission s'arrête")
class MissionEvidenceCapTest {

    @Test
    @DisplayName("le constat validé, la mission se clôt en échec, d'une erreur qui ne nomme personne")
    void the_mission_stops_at_the_cap() {
        DeliveryRunner runner = mock(DeliveryRunner.class);

        new MissionEvidenceCap(runner).onCapped(new EvidenceCapped(100L));

        verify(runner).complete(100L, new DeliveryPoll(DeliveryRunStatus.FAILED, null, null, MissionEvidenceCap.STOPPED));
        assertThat(MissionEvidenceCap.STOPPED).startsWith("Evidence cap reached").doesNotContain("@");
    }
}
