package com.taskforce.tf_api.modules.sales.service;

import com.taskforce.tf_api.modules.sales.domain.EnterpriseInquiry;
import com.taskforce.tf_api.modules.sales.dto.request.EnterpriseInquiryRequest;
import com.taskforce.tf_api.modules.sales.dto.response.EnterpriseInquiryResponse;
import com.taskforce.tf_api.modules.sales.repository.EnterpriseInquiryRepository;
import com.taskforce.tf_api.core.service.EmailService;
import com.taskforce.tf_api.shared.exception.BusinessException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Service métier pour gérer les demandes ENTERPRISE.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class SalesService {

    private final EnterpriseInquiryRepository inquiryRepository;
    private final EmailService emailService;

    @Value("${app.sales-email:sales@taskforce.dev}")
    private String salesEmail;

    /**
     * Crée une nouvelle demande de contact ENTERPRISE.
     */
    @Transactional
    public EnterpriseInquiryResponse createInquiry(EnterpriseInquiryRequest request) {
        log.info("📧 Nouvelle demande ENTERPRISE: {} ({})", request.getFullName(), request.getEmail());

        // Vérifier si une demande récente existe déjà
        boolean hasActivePendingInquiry = inquiryRepository.existsByEmailAndStatusIn(
                request.getEmail(),
                List.of(EnterpriseInquiry.InquiryStatus.NEW, EnterpriseInquiry.InquiryStatus.CONTACTED)
        );

        if (hasActivePendingInquiry) {
            log.warn("⚠️ Demande en cours déjà existante pour: {}", request.getEmail());
            throw new BusinessException("Vous avez déjà une demande en cours de traitement. Notre équipe vous contactera sous 48h.");
        }

        // Créer l'inquiry
        EnterpriseInquiry inquiry = EnterpriseInquiry.builder()
                .fullName(request.getFullName())
                .email(request.getEmail())
                .teamSize(request.getTeamSize())
                .message(request.getMessage())
                .status(EnterpriseInquiry.InquiryStatus.NEW)
                .createdAccount(false)
                .build();

        inquiry = inquiryRepository.save(inquiry);
        log.info("✅ Demande ENTERPRISE créée avec ID: {}", inquiry.getId());

        // Notifier l'équipe sales (best-effort — n'échoue jamais la création de la demande)
        String html = """
            <h2>Nouvelle demande Enterprise</h2>
            <p><b>Nom :</b> %s</p>
            <p><b>Email :</b> %s</p>
            <p><b>Taille d'équipe :</b> %s</p>
            <p><b>Message :</b><br/>%s</p>
            """.formatted(esc(inquiry.getFullName()), esc(inquiry.getEmail()),
                          esc(inquiry.getTeamSize()), esc(inquiry.getMessage()));
        emailService.sendInternalNotification(
            salesEmail,
            "[TaskForce] Nouvelle demande Enterprise — " + inquiry.getFullName(),
            html
        );

        return EnterpriseInquiryResponse.builder()
                .inquiryId(inquiry.getId())
                .fullName(inquiry.getFullName())
                .email(inquiry.getEmail())
                .teamSize(inquiry.getTeamSize())
                .status(inquiry.getStatus().name())
                .createdAt(inquiry.getCreatedAt())
                .message("Votre demande a été envoyée avec succès. Notre équipe vous contactera sous 48h.")
                .build();
    }

    /** Échappement HTML minimal pour le contenu utilisateur dans l'email de notification. */
    private static String esc(String value) {
        if (value == null) return "";
        return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }

    /**
     * Lie un inquiry à un compte utilisateur créé.
     */
    @Transactional
    public void linkInquiryToUser(String email, Long userId) {
        log.info("🔗 Lier demande ENTERPRISE à l'utilisateur {} pour email: {}", userId, email);

        List<EnterpriseInquiry> inquiries = inquiryRepository.findByEmailOrderByCreatedAtDesc(email);

        if (!inquiries.isEmpty()) {
            // Prendre la plus récente
            EnterpriseInquiry latestInquiry = inquiries.get(0);
            latestInquiry.setUserId(userId);
            latestInquiry.setCreatedAccount(true);
            inquiryRepository.save(latestInquiry);
            log.info("✅ Demande {} liée à l'utilisateur {}", latestInquiry.getId(), userId);
        } else {
            log.warn("⚠️ Aucune demande ENTERPRISE trouvée pour: {}", email);
        }
    }
}
