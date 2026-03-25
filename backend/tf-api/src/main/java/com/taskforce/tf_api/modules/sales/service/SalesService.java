package com.taskforce.tf_api.modules.sales.service;

import com.taskforce.tf_api.modules.sales.domain.EnterpriseInquiry;
import com.taskforce.tf_api.modules.sales.dto.request.EnterpriseInquiryRequest;
import com.taskforce.tf_api.modules.sales.dto.response.EnterpriseInquiryResponse;
import com.taskforce.tf_api.modules.sales.repository.EnterpriseInquiryRepository;
import com.taskforce.tf_api.shared.exception.BusinessException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
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

        // TODO: Envoyer email de confirmation + notification à l'équipe sales

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
