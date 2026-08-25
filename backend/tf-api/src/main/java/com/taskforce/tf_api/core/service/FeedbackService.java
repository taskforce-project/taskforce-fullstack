package com.taskforce.tf_api.core.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.dto.request.SubmitFeedbackRequest;
import com.taskforce.tf_api.core.model.Feedback;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.FeedbackRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Retours utilisateur (« Give feedback ») : persistés en base, + notif email best-effort à l'équipe.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class FeedbackService {

    private final FeedbackRepository feedbackRepository;
    private final UserRepository userRepository;
    private final EmailService emailService;

    /** Adresse de l'équipe qui reçoit les retours (best-effort ; désactivé si SMTP inactif). */
    @Value("${feedback.notify-email:feedback@taskforce.dev}")
    private String notifyEmail;

    @Transactional
    public void submit(Long userId, SubmitFeedbackRequest request) {
        User user = userRepository.findById(userId)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));

        String category = (request.getCategory() != null && !request.getCategory().isBlank())
            ? request.getCategory() : "OTHER";

        Feedback feedback = Feedback.builder()
            .user(user)
            .category(category)
            .message(request.getMessage())
            .context(request.getContext())
            .build();
        feedbackRepository.save(feedback);
        log.info("Feedback [{}] reçu de {} (contexte : {})", category, user.getEmail(), request.getContext());

        notifyTeam(user, category, request);
    }

    /** Email best-effort à l'équipe (ne casse jamais la requête ; no-op si SMTP inactif). */
    private void notifyTeam(User user, String category, SubmitFeedbackRequest request) {
        if (!emailService.isEnabled()) return;
        String who = (user.getDisplayName() != null && !user.getDisplayName().isBlank())
            ? user.getDisplayName() : user.getEmail();
        String context = request.getContext() != null ? request.getContext() : "TaskForce";
        String subject = String.format("[Feedback %s] %s", category, context);
        String html = "<p><b>" + escape(who) + "</b> (" + escape(user.getEmail()) + ") — "
            + escape(category) + "</p>"
            + "<p><i>Context:</i> " + escape(context) + "</p>"
            + "<hr><p>" + escape(request.getMessage()).replace("\n", "<br>") + "</p>";
        emailService.sendInternalNotification(notifyEmail, subject, html);
    }

    /** Échappement HTML minimal (le message vient de l'utilisateur → jamais injecté brut dans l'email). */
    private static String escape(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
