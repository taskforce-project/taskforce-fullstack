package com.taskforce.tf_api.core.service;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import com.taskforce.tf_api.core.dto.request.SubmitFeedbackRequest;
import com.taskforce.tf_api.core.model.Feedback;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.FeedbackRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("FeedbackService")
class FeedbackServiceTest {

    @Mock private FeedbackRepository feedbackRepository;
    @Mock private UserRepository userRepository;
    @Mock private EmailService emailService;

    @InjectMocks private FeedbackService service;

    private static final long USER_ID = 7L;

    @BeforeEach
    void setUp() {
        // `@Value` n'est PAS injecté par `@InjectMocks` (Mockito) → sans ça `notifyEmail` reste null
        // et le 1er argument de sendInternalNotification ne matche pas `anyString()`.
        ReflectionTestUtils.setField(service, "notifyEmail", "feedback@taskforce.dev");
    }

    @Test
    @DisplayName("submit : persiste le retour + notifie l'équipe quand le SMTP est actif")
    void should_persist_and_notify() {
        User user = User.builder().id(USER_ID).email("u@ex.dev").displayName("U").build();
        when(userRepository.findById(USER_ID)).thenReturn(Optional.of(user));
        when(emailService.isEnabled()).thenReturn(true);

        SubmitFeedbackRequest req = new SubmitFeedbackRequest();
        req.setCategory("BUG");
        req.setMessage("ça bug ici");
        req.setContext("Labs · Intelligence");

        service.submit(USER_ID, req);

        ArgumentCaptor<Feedback> captor = ArgumentCaptor.forClass(Feedback.class);
        verify(feedbackRepository).save(captor.capture());
        assertThat(captor.getValue().getCategory()).isEqualTo("BUG");
        assertThat(captor.getValue().getMessage()).isEqualTo("ça bug ici");
        assertThat(captor.getValue().getContext()).isEqualTo("Labs · Intelligence");
        assertThat(captor.getValue().getUser()).isEqualTo(user);
        verify(emailService).sendInternalNotification(anyString(), anyString(), anyString());
    }

    @Test
    @DisplayName("submit : catégorie absente -> OTHER, et aucun email si SMTP inactif")
    void should_default_category_and_skip_email_when_smtp_off() {
        User user = User.builder().id(USER_ID).email("u@ex.dev").build();
        when(userRepository.findById(USER_ID)).thenReturn(Optional.of(user));
        when(emailService.isEnabled()).thenReturn(false);

        SubmitFeedbackRequest req = new SubmitFeedbackRequest();
        req.setMessage("juste une idée");

        service.submit(USER_ID, req);

        ArgumentCaptor<Feedback> captor = ArgumentCaptor.forClass(Feedback.class);
        verify(feedbackRepository).save(captor.capture());
        assertThat(captor.getValue().getCategory()).isEqualTo("OTHER");
        verify(emailService, never()).sendInternalNotification(anyString(), anyString(), anyString());
    }

    @Test
    @DisplayName("submit : utilisateur introuvable -> ResourceNotFoundException (rien de persisté)")
    void should_throw_when_user_missing() {
        when(userRepository.findById(USER_ID)).thenReturn(Optional.empty());

        SubmitFeedbackRequest req = new SubmitFeedbackRequest();
        req.setMessage("x");

        assertThatThrownBy(() -> service.submit(USER_ID, req))
            .isInstanceOf(ResourceNotFoundException.class);
        verify(feedbackRepository, never()).save(org.mockito.ArgumentMatchers.any());
    }
}
