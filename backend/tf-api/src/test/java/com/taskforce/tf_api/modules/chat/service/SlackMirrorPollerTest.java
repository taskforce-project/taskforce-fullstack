package com.taskforce.tf_api.modules.chat.service;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.taskforce.tf_api.core.repository.SlackChannelRepository;

import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("SlackMirrorPoller")
class SlackMirrorPollerTest {

    @Mock private SlackChannelRepository slackChannelRepository;
    @Mock private SlackMirrorService     mirrorService;

    @InjectMocks private SlackMirrorPoller poller;

    @Test
    @DisplayName("poll synchronise chaque canal miroir")
    void poll_syncs_each_mirrored_channel() {
        when(slackChannelRepository.findMirroredChannelIds()).thenReturn(List.of(1L, 2L));
        when(mirrorService.syncMirrored(anyLong())).thenReturn(1);

        poller.poll();

        verify(mirrorService).syncMirrored(1L);
        verify(mirrorService).syncMirrored(2L);
    }

    @Test
    @DisplayName("poll tolère l'échec d'un canal et continue les autres")
    void poll_tolerates_channel_failure() {
        when(slackChannelRepository.findMirroredChannelIds()).thenReturn(List.of(1L, 2L));
        when(mirrorService.syncMirrored(1L)).thenThrow(new RuntimeException("boom"));
        when(mirrorService.syncMirrored(2L)).thenReturn(3);

        poller.poll(); // ne lève pas

        verify(mirrorService).syncMirrored(2L);
    }

    @Test
    @DisplayName("poll ne fait rien s'il n'y a aucun canal miroir")
    void poll_noop_when_no_mirrors() {
        when(slackChannelRepository.findMirroredChannelIds()).thenReturn(List.of());

        poller.poll();

        verifyNoInteractions(mirrorService);
    }
}
