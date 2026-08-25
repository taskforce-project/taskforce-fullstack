package com.taskforce.tf_api.core.service;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.taskforce.tf_api.core.dto.request.UpdateNotificationPreferencesRequest;
import com.taskforce.tf_api.core.dto.response.NotificationPreferenceResponse;
import com.taskforce.tf_api.core.model.NotificationEvent;
import com.taskforce.tf_api.core.model.NotificationPreference;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.NotificationPreferenceRepository;
import com.taskforce.tf_api.core.repository.UserRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Tests unitaires — {@link NotificationPreferenceService}.
 * Couvre : matrice « absence = défaut », fusion des réglages enregistrés, upsert, event_key inconnu
 * ignoré, et résolution des canaux (utilisée par le gating de NotificationService).
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("NotificationPreferenceService")
class NotificationPreferenceServiceTest {

    @Mock private NotificationPreferenceRepository preferenceRepository;
    @Mock private UserRepository userRepository;

    @InjectMocks private NotificationPreferenceService service;

    private static final long USER_ID = 7L;

    @Test
    @DisplayName("getPreferences : matrice complète aux défauts (in-app ON, email OFF) quand rien n'est enregistré")
    void should_return_defaults_for_all_events() {
        when(preferenceRepository.findByUserId(USER_ID)).thenReturn(List.of());

        List<NotificationPreferenceResponse> prefs = service.getPreferences(USER_ID);

        assertThat(prefs).hasSize(NotificationEvent.values().length);
        assertThat(prefs).allSatisfy(p -> {
            assertThat(p.isInApp()).isTrue();
            assertThat(p.isEmail()).isFalse();
        });
        assertThat(prefs).extracting(NotificationPreferenceResponse::getEventKey)
            .contains("assigned", "mention", "commented", "statusChanged", "dueDate", "overload");
    }

    @Test
    @DisplayName("getPreferences : fusionne les réglages enregistrés par-dessus les défauts")
    void should_merge_stored_over_defaults() {
        NotificationPreference stored = NotificationPreference.builder()
            .eventKey("assigned").inApp(false).email(true).build();
        when(preferenceRepository.findByUserId(USER_ID)).thenReturn(List.of(stored));

        List<NotificationPreferenceResponse> prefs = service.getPreferences(USER_ID);

        NotificationPreferenceResponse assigned = prefs.stream()
            .filter(p -> p.getEventKey().equals("assigned")).findFirst().orElseThrow();
        assertThat(assigned.isInApp()).isFalse();
        assertThat(assigned.isEmail()).isTrue();

        NotificationPreferenceResponse mention = prefs.stream()
            .filter(p -> p.getEventKey().equals("mention")).findFirst().orElseThrow();
        assertThat(mention.isInApp()).isTrue();
        assertThat(mention.isEmail()).isFalse();
    }

    @Test
    @DisplayName("updatePreferences : crée la ligne absente et met à jour l'existante")
    void should_upsert() {
        User user = User.builder().id(USER_ID).email("u@ex.dev").build();
        when(userRepository.findById(USER_ID)).thenReturn(Optional.of(user));

        NotificationPreference existing = NotificationPreference.builder()
            .eventKey("assigned").inApp(true).email(false).build();
        when(preferenceRepository.findByUserIdAndEventKey(USER_ID, "assigned")).thenReturn(Optional.of(existing));
        when(preferenceRepository.findByUserIdAndEventKey(USER_ID, "mention")).thenReturn(Optional.empty());
        when(preferenceRepository.findByUserId(USER_ID)).thenReturn(List.of());
        when(preferenceRepository.save(any())).thenAnswer(i -> i.getArgument(0));

        UpdateNotificationPreferencesRequest req = new UpdateNotificationPreferencesRequest();
        req.setPreferences(List.of(
            item("assigned", false, true),
            item("mention", true, true)
        ));

        service.updatePreferences(USER_ID, req);

        ArgumentCaptor<NotificationPreference> captor = ArgumentCaptor.forClass(NotificationPreference.class);
        verify(preferenceRepository, times(2)).save(captor.capture());

        assertThat(existing.isInApp()).isFalse();   // existante mise à jour
        assertThat(existing.isEmail()).isTrue();

        NotificationPreference created = captor.getAllValues().stream()
            .filter(p -> p.getEventKey().equals("mention")).findFirst().orElseThrow();
        assertThat(created.getUser()).isEqualTo(user);
        assertThat(created.isInApp()).isTrue();
        assertThat(created.isEmail()).isTrue();
    }

    @Test
    @DisplayName("updatePreferences : ignore silencieusement un event_key inconnu")
    void should_ignore_unknown_event_key() {
        User user = User.builder().id(USER_ID).email("u@ex.dev").build();
        when(userRepository.findById(USER_ID)).thenReturn(Optional.of(user));
        when(preferenceRepository.findByUserId(USER_ID)).thenReturn(List.of());

        UpdateNotificationPreferencesRequest req = new UpdateNotificationPreferencesRequest();
        req.setPreferences(List.of(item("bogus", true, true)));

        service.updatePreferences(USER_ID, req);

        verify(preferenceRepository, never()).save(any());
    }

    @Test
    @DisplayName("resolve : défaut si absente, valeur stockée sinon, défaut si événement inconnu")
    void should_resolve_channels() {
        when(preferenceRepository.findByUserIdAndEventKey(USER_ID, "assigned")).thenReturn(Optional.empty());
        NotificationPreferenceService.Channels def =
            service.resolve(USER_ID, Optional.of(NotificationEvent.ASSIGNED));
        assertThat(def.inApp()).isTrue();
        assertThat(def.email()).isFalse();

        when(preferenceRepository.findByUserIdAndEventKey(USER_ID, "mention")).thenReturn(Optional.of(
            NotificationPreference.builder().eventKey("mention").inApp(false).email(true).build()));
        NotificationPreferenceService.Channels stored =
            service.resolve(USER_ID, Optional.of(NotificationEvent.MENTION));
        assertThat(stored.inApp()).isFalse();
        assertThat(stored.email()).isTrue();

        NotificationPreferenceService.Channels empty = service.resolve(USER_ID, Optional.empty());
        assertThat(empty.inApp()).isTrue();
        assertThat(empty.email()).isFalse();
    }

    private static UpdateNotificationPreferencesRequest.Item item(String key, boolean inApp, boolean email) {
        UpdateNotificationPreferencesRequest.Item i = new UpdateNotificationPreferencesRequest.Item();
        i.setEventKey(key);
        i.setInApp(inApp);
        i.setEmail(email);
        return i;
    }
}
