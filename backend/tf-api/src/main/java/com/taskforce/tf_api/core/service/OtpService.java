package com.taskforce.tf_api.core.service;

import com.taskforce.tf_api.core.enums.OtpStatus;
import com.taskforce.tf_api.core.enums.OtpType;
import com.taskforce.tf_api.core.model.OtpVerification;
import com.taskforce.tf_api.core.repository.OtpVerificationRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Optional;

/**
 * Service de gestion des codes OTP
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class OtpService {

    private final OtpVerificationRepository otpRepository;
    private final EmailService emailService;

    private static final int OTP_LENGTH = 6;
    private static final int OTP_EXPIRY_MINUTES = 15;
    private static final int MAX_OTP_ATTEMPTS_PER_HOUR = 5;

    /**
     * Génère et envoie un code OTP
     */
    @Transactional
    public OtpVerification generateAndSendOtp(
        String email,
        String firstName,
        OtpType otpType,
        Long userId,
        String keycloakId
    ) {
        log.info("Génération d'un OTP pour : {}", email);

        // Vérifier le nombre de tentatives récentes (protection spam)
        long recentAttempts = otpRepository.countRecentOtpAttempts(
            email,
            LocalDateTime.now().minusHours(1)
        );

        if (recentAttempts >= MAX_OTP_ATTEMPTS_PER_HOUR) {
            throw new RuntimeException("Trop de tentatives. Veuillez réessayer dans une heure.");
        }

        // Expirer tous les OTP en attente pour cet email
        otpRepository.expireAllPendingOtpsByEmail(email);

        // Générer un nouveau code OTP
        String otpCode = generateOtpCode();

        // Créer l'enregistrement OTP
        OtpVerification otp = OtpVerification.builder()
            .userId(userId)
            .keycloakId(keycloakId)
            .otpCode(otpCode)
            .otpType(otpType)
            .otpStatus(OtpStatus.PENDING)
            .email(email)
            .attempts(0)
            .maxAttempts(5)
            .expiresAt(LocalDateTime.now().plusMinutes(OTP_EXPIRY_MINUTES))
            .build();

        otp = otpRepository.save(otp);
        log.info("OTP créé avec succès pour : {}", email);

        // Envoyer l'email
        emailService.sendOtpEmail(email, otpCode, firstName);

        return otp;
    }

    /**
     * Vérifie un code OTP
     */
    @Transactional
    public boolean verifyOtp(String email, String otpCode) {
        log.info("Vérification du code OTP pour : {}", email);

        Optional<OtpVerification> otpOpt = otpRepository.findValidOtpByEmailAndCode(
            email,
            otpCode,
            LocalDateTime.now()
        );

        if (otpOpt.isEmpty()) {
            log.warn("Code OTP invalide ou expiré pour : {}", email);
            return false;
        }

        OtpVerification otp = otpOpt.get();

        // Vérifier si le code peut être validé
        if (!otp.canBeValidated()) {
            log.warn("Le code OTP ne peut pas être validé (expiré ou max tentatives atteint) : {}", email);
            otpRepository.save(otp);
            return false;
        }

        // Marquer comme vérifié
        otp.markAsVerified();
        otpRepository.save(otp);

        log.info("Code OTP vérifié avec succès pour : {}", email);
        return true;
    }

    /**
     * Incrémente les tentatives d'un OTP
     */
    @Transactional
    public void incrementAttempts(String email, String otpCode) {
        Optional<OtpVerification> otpOpt = otpRepository.findValidOtpByEmailAndCode(
            email,
            otpCode,
            LocalDateTime.now()
        );

        otpOpt.ifPresent(otp -> {
            otp.incrementAttempts();
            otpRepository.save(otp);
        });
    }

    /**
     * Génère un code OTP aléatoire à 6 chiffres
     */
    private String generateOtpCode() {
        SecureRandom random = new SecureRandom();
        int otp = 100000 + random.nextInt(900000); // Génère un nombre entre 100000 et 999999
        return String.valueOf(otp);
    }

    /**
     * Nettoie les OTP expirés (à appeler périodiquement via un scheduler)
     */
    @Transactional
    public int cleanupExpiredOtps() {
        log.info("Nettoyage des OTP expirés...");
        LocalDateTime cutoffDate = LocalDateTime.now().minusDays(7);
        int deleted = otpRepository.deleteExpiredOtps(cutoffDate);
        log.info("{} OTP expirés supprimés", deleted);
        return deleted;
    }
}
