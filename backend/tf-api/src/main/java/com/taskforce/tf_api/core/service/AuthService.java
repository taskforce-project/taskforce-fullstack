package com.taskforce.tf_api.core.service;

import org.keycloak.representations.idm.UserRepresentation;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import java.util.Map;

import org.springframework.transaction.annotation.Transactional;

import com.stripe.exception.StripeException;
import com.stripe.model.Customer;
import com.taskforce.tf_api.core.dto.request.LoginRequest;
import com.taskforce.tf_api.core.dto.request.RegisterRequest;
import com.taskforce.tf_api.core.dto.request.SelectPlanRequest;
import com.taskforce.tf_api.core.dto.request.VerifyOtpRequest;
import com.taskforce.tf_api.core.dto.request.ForgotPasswordRequest;
import com.taskforce.tf_api.core.dto.request.ResetPasswordRequest;
import com.taskforce.tf_api.core.dto.response.AuthResponse;
import com.taskforce.tf_api.core.dto.response.RegisterResponse;
import com.taskforce.tf_api.core.dto.response.SelectPlanResponse;
import com.taskforce.tf_api.core.dto.response.UserResponse;
import com.taskforce.tf_api.core.dto.response.VerifyOtpResponse;
import com.taskforce.tf_api.core.enums.OtpType;
import com.taskforce.tf_api.core.enums.PlanStatus;
import com.taskforce.tf_api.core.enums.PlanType;
import com.taskforce.tf_api.core.model.OtpVerification;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.WorkspaceService;
import com.taskforce.tf_api.shared.security.HumanChallengeService;

import com.nimbusds.jwt.JWTParser;

import java.text.ParseException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Service d'authentification principal
 * Orchestre Keycloak, OTP, et la création d'utilisateur
 */
@Service
@RequiredArgsConstructor
@Slf4j
@Transactional
public class AuthService {

    private final KeycloakService keycloakService;
    private final KeycloakAuthService keycloakAuthService;
    private final OtpService otpService;
    private final StripeService stripeService;
    private final EmailService emailService;
    private final UserRepository userRepository;
    private final WorkspaceService workspaceService;
    private final AuditService auditService;
    private final WorkspaceInvitationService workspaceInvitationService;
    private final HumanChallengeService humanChallengeService;

    @Value("${stripe.success-url}")
    private String stripeSuccessUrl;

    @Value("${stripe.cancel-url}")
    private String stripeCancelUrl;

    /**
     * Inscription d'un nouvel utilisateur
     * 1. Crée le compte dans Keycloak (ou renvoie OTP si déjà créé mais non vérifié)
     * 2. Génère et envoie le code OTP
     * 3. Retourne une réponse indiquant que l'OTP a été envoyé
     * 
     * Nouveau workflow : reçoit toutes les informations en une seule fois (incluant planType)
     * Méthode idempotente : si l'utilisateur existe déjà dans Keycloak mais n'est pas vérifié,
     * renvoie simplement un OTP au lieu de lever une erreur.
     */
    public RegisterResponse register(RegisterRequest request) {
        log.info("Tentative d'inscription pour : {} avec plan : {}",
            request.getEmail(), request.getPlanType());

        // Vérification humaine AVANT tout travail : le but est d'éviter qu'un automate ne déclenche
        // en volume la création Keycloak et l'envoi de courriels. La contrôler après aurait laissé
        // passer précisément ce qu'elle protège.
        String refus = humanChallengeService.verify(request.getChallengeToken());
        if (refus != null) {
            throw new RuntimeException(refus);
        }

        // Vérifier si l'email existe déjà dans notre DB (utilisateur complètement enregistré)
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new RuntimeException("Cet email est déjà utilisé. Veuillez vous connecter.");
        }

        String keycloakId;
        String firstName = request.getFirstName();
        boolean userAlreadyExists = false;

        // Vérifier si l'email existe déjà dans Keycloak
        if (keycloakService.emailExists(request.getEmail())) {
            // Récupérer l'utilisateur Keycloak existant
            UserRepresentation keycloakUser = keycloakService.getUserByEmail(request.getEmail());
            
            // Si l'email est déjà vérifié, l'utilisateur doit se connecter
            if (Boolean.TRUE.equals(keycloakUser.isEmailVerified())) {
                throw new RuntimeException("Cet email est déjà vérifié. Veuillez vous connecter.");
            }
            
            // L'utilisateur existe mais n'est pas encore vérifié → renvoyer OTP (idempotent)
            keycloakId = keycloakUser.getId();
            firstName = keycloakUser.getFirstName(); // Utiliser le prénom de Keycloak
            userAlreadyExists = true;
            log.info("Utilisateur déjà créé dans Keycloak mais non vérifié : {}. Renvoi d'OTP.", request.getEmail());
        } else {
            // Créer l'utilisateur dans Keycloak avec gestion de race condition
            try {
                keycloakId = keycloakService.createUser(
                    request.getEmail(),
                    request.getPassword(),
                    request.getFirstName(),
                    request.getLastName()
                );
                log.info("Nouvel utilisateur créé dans Keycloak : {}", request.getEmail());
            } catch (RuntimeException e) {
                // Si l'utilisateur a été créé entre-temps (race condition), le récupérer
                if (e.getMessage() != null && e.getMessage().contains("User exists")) {
                    log.warn("Race condition détectée : utilisateur créé entre-temps pour {}", request.getEmail());
                    UserRepresentation keycloakUser = keycloakService.getUserByEmail(request.getEmail());
                    
                    // Vérifier si l'email est vérifié
                    if (Boolean.TRUE.equals(keycloakUser.isEmailVerified())) {
                        throw new RuntimeException("Cet email est déjà vérifié. Veuillez vous connecter.");
                    }
                    
                    keycloakId = keycloakUser.getId();
                    firstName = keycloakUser.getFirstName();
                    userAlreadyExists = true;
                } else {
                    // Erreur différente, la relever
                    throw e;
                }
            }
        }

        // Générer et envoyer le code OTP avec le plan sélectionné
        otpService.generateAndSendOtp(
            request.getEmail(),
            firstName, // Utiliser le prénom récupéré (peut venir de Keycloak ou de la requête)
            OtpType.EMAIL_VERIFICATION,
            null, // userId pas encore créé dans notre DB
            keycloakId,
            request.getPlanType() // Stocker le plan directement dans l'OTP
        );

        log.info("Inscription {} pour : {} avec plan {}. OTP envoyé.", 
            userAlreadyExists ? "réessayée" : "réussie",
            request.getEmail(), 
            request.getPlanType());

        return RegisterResponse.builder()
            .message("Un code de vérification a été envoyé à votre adresse email")
            .email(request.getEmail())
            .otpSent(true)
            .otpExpiresInMinutes(15)
            .build();
    }

    /**
     * Sélection du plan (Étape 2 de l'inscription)
     * 1. Vérifie que l'utilisateur existe dans Keycloak
     * 2. Stocke le plan sélectionné dans la table OTP
     * 3. Renvoie un nouveau code OTP si nécessaire
     */
    public SelectPlanResponse selectPlan(SelectPlanRequest request) {
        log.info("Sélection du plan {} pour : {}", request.getPlanType(), request.getEmail());

        // Vérifier que l'utilisateur existe dans Keycloak
        UserRepresentation keycloakUser = keycloakService.getUserByEmail(request.getEmail());
        if (keycloakUser == null) {
            throw new RuntimeException("Utilisateur non trouvé. Veuillez d'abord vous inscrire.");
        }

        String keycloakId = keycloakUser.getId();

        // Vérifier si l'email est déjà vérifié
        if (Boolean.TRUE.equals(keycloakUser.isEmailVerified())) {
            throw new RuntimeException("Cet email est déjà vérifié. Veuillez vous connecter.");
        }

        // Stocker le plan dans la table OTP (mise à jour de l'OTP existant)
        boolean planStored = otpService.updatePlanType(request.getEmail(), keycloakId, request.getPlanType());

        if (!planStored) {
            throw new RuntimeException("Erreur lors de l'enregistrement du plan. Code OTP introuvable.");
        }

        log.info("Plan {} enregistré pour {} dans OTP", request.getPlanType(), request.getEmail());

        return SelectPlanResponse.builder()
            .message("Plan sélectionné avec succès. Vérifiez votre email pour le code de confirmation.")
            .email(request.getEmail())
            .planType(request.getPlanType())
            .otpSent(true)
            .otpExpiresInMinutes(15)
            .build();
    }

    /**
     * Vérification du code OTP et finalisation de l'inscription
     * 1. Vérifie le code OTP et récupère le plan sélectionné
     * 2. Marque l'email comme vérifié dans Keycloak
     * 3. Crée l'utilisateur dans notre DB avec le plan
     * 4. Si plan payant : crée client Stripe et retourne URL checkout
     * 5. Génère les tokens JWT
     */
    public VerifyOtpResponse verifyOtpAndCompleteRegistration(VerifyOtpRequest request) {
        log.info("Vérification OTP pour : {}", request.getEmail());

        // Vérifier le code OTP et récupérer le plan sélectionné
        // (les tentatives sont incrémentées automatiquement en cas d'échec)
        OtpVerification otpVerification = otpService.verifyOtpAndGetDetails(request.getEmail(), request.getOtpCode());

        if (otpVerification == null) {
            throw new RuntimeException("Code de vérification invalide ou expiré");
        }

        // Récupérer le plan depuis l'OTP
        String planType = otpVerification.getPlanType();
        if (planType == null || planType.isEmpty()) {
            throw new RuntimeException("Plan non sélectionné. Veuillez d'abord choisir un plan.");
        }

        // Récupérer l'utilisateur depuis Keycloak
        UserRepresentation keycloakUser = keycloakService.getUserByEmail(request.getEmail());
        String keycloakId = keycloakUser.getId();

        // Marquer l'email comme vérifié dans Keycloak
        keycloakService.verifyEmail(keycloakId);

        // Créer l'utilisateur dans notre DB — TOUJOURS en FREE : un forfait payant n'est accordé qu'après
        // paiement confirmé (webhook checkout.session.completed / subscription.updated). Empêche qu'un
        // utilisateur s'attribue un plan payant sans payer.
        PlanType.valueOf(planType.toUpperCase()); // valide le plan choisi (lève si invalide)
        String firstName = keycloakUser.getFirstName();
        String lastName = keycloakUser.getLastName();
        String displayName = buildDisplayName(firstName, lastName);
        User user = User.builder()
            .keycloakId(keycloakId)
            .email(request.getEmail())
            .planType(PlanType.FREE)
            .isActive(true)
            .displayName(displayName)
            .planStatus(null)
            .build();

        // Si plan payant, créer le client Stripe
        String checkoutUrl = null;
        if (!planType.equalsIgnoreCase("FREE")) {
            try {
                Customer stripeCustomer = stripeService.createCustomer(
                    request.getEmail(),
                    keycloakUser.getFirstName() + " " + keycloakUser.getLastName()
                );
                user.setStripeCustomerId(stripeCustomer.getId());

                // Créer la session de paiement Stripe
                String priceId = stripeService.getPriceIdForPlan(planType);
                var session = stripeService.createCheckoutSession(
                    stripeCustomer.getId(),
                    priceId,
                    stripeSuccessUrl,
                    stripeCancelUrl,
                    java.util.Map.of("planType", planType.toUpperCase()) // le webhook applique le forfait au paiement
                );
                checkoutUrl = session.getUrl();

            } catch (StripeException e) {
                log.error("Erreur lors de la création du client Stripe", e);
                throw new RuntimeException("Erreur lors de la configuration du paiement");
            }
        }

        user = userRepository.save(user);
        log.info("Utilisateur créé dans la DB avec ID : {}", user.getId());

        // Créer automatiquement un workspace pour le nouvel utilisateur
        workspaceService.createWorkspace(user, keycloakUser.getFirstName());

        // Appliquer les invitations en attente pour cet email (PROD-3.5, best-effort)
        workspaceInvitationService.acceptPendingInvitations(user);

        // Envoyer l'email de bienvenue
        emailService.sendWelcomeEmail(request.getEmail(), keycloakUser.getFirstName());

        // Depuis la migration OIDC : plus d'auto-login (Keycloak ne peut émettre un token sans
        // mot de passe, absent à ce stade). Le compte est prêt ; le front redirige vers /login.
        return VerifyOtpResponse.builder()
            .verified(true)
            .message("Email vérifié avec succès. Vous pouvez maintenant vous connecter.")
            .authData(null)
            .checkoutSessionUrl(checkoutUrl)
            .build();
    }

    /**
     * Connexion d'un utilisateur
     * 1. Authentifie via Keycloak (vérification email/password)
     * 2. Récupère l'utilisateur de notre DB
     * 3. Génère les tokens JWT
     */
    public AuthResponse login(LoginRequest request) {
        log.info("Tentative de connexion pour : {}", request.getEmail());

        // Authentifier l'utilisateur via Keycloak (vérifie email + password) et récupérer les
        // tokens OIDC RS256 émis par Keycloak (plus de token custom HS512).
        KeycloakTokenResponse kcToken;
        try {
            kcToken = keycloakAuthService.authenticate(
                request.getEmail(),
                request.getPassword()
            );

            log.info("Authentification Keycloak réussie pour : {}", request.getEmail());
        } catch (RuntimeException e) {
            log.error("Échec d'authentification Keycloak pour {} : {}", request.getEmail(), e.getMessage());
            throw new RuntimeException("Email ou mot de passe incorrect");
        }

        // Récupérer l'utilisateur depuis Keycloak
        UserRepresentation keycloakUser = keycloakService.getUserByEmail(request.getEmail());

        if (!keycloakUser.isEmailVerified()) {
            throw new RuntimeException("Veuillez vérifier votre email avant de vous connecter");
        }

        // Récupérer ou créer l'utilisateur dans notre DB
        // Just-in-time provisioning : si l'utilisateur existe dans Keycloak mais pas dans notre DB,
        // on le crée automatiquement (cas des utilisateurs créés directement dans Keycloak)
        User user = userRepository.findByKeycloakId(keycloakUser.getId())
            .orElseGet(() -> {
                log.info("Utilisateur {} trouvé dans Keycloak mais pas dans la DB. Création automatique...", 
                    keycloakUser.getEmail());
                
                User newUser = User.builder()
                    .keycloakId(keycloakUser.getId())
                    .email(keycloakUser.getEmail())
                    .planType(PlanType.FREE)  // Plan gratuit par défaut
                    .planStatus(PlanStatus.ACTIVE)
                    .isActive(true)
                    .displayName(buildDisplayName(keycloakUser.getFirstName(), keycloakUser.getLastName()))
                    .build();
                
                return userRepository.save(newUser);
            });

        if (!user.getIsActive()) {
            throw new RuntimeException("Ce compte est désactivé");
        }

        // Appliquer d'éventuelles invitations workspace en attente (PROD-3.5, best-effort)
        workspaceInvitationService.acceptPendingInvitations(user);

        // Réponse = tokens Keycloak + profil DB
        AuthResponse authResponse = buildAuthResponse(
            user, kcToken, keycloakUser.getFirstName(), keycloakUser.getLastName());

        auditService.record(null, user.getId(), AuditService.USER_LOGIN);

        log.info("Connexion réussie pour : {}", request.getEmail());
        return authResponse;
    }

    /**
     * Renvoie un code OTP
     */
    public RegisterResponse resendOtp(String email) {
        log.info("Renvoi du code OTP pour : {}", email);

        // Récupérer l'utilisateur depuis Keycloak
        UserRepresentation keycloakUser = keycloakService.getUserByEmail(email);

        if (keycloakUser.isEmailVerified()) {
            throw new RuntimeException("Cet email est déjà vérifié");
        }

        // Récupérer le plan depuis le dernier OTP (même expiré)
        OtpVerification existingOtp = otpService.getLatestOtp(email);
        PlanType planType = existingOtp != null && existingOtp.getPlanType() != null 
            ? PlanType.valueOf(existingOtp.getPlanType()) 
            : null;
        
        log.info("Plan récupéré depuis le dernier OTP : {} pour {}", planType, email);

        // Générer et envoyer un nouveau code OTP
        otpService.generateAndSendOtp(
            email,
            keycloakUser.getFirstName(),
            OtpType.EMAIL_VERIFICATION,
            null,
            keycloakUser.getId(),
            planType
        );

        return RegisterResponse.builder()
            .message("Un nouveau code de vérification a été envoyé")
            .email(email)
            .otpSent(true)
            .otpExpiresInMinutes(15)
            .build();
    }

    /**
     * Demande de réinitialisation de mot de passe
     * 1. Vérifie que l'utilisateur existe
     * 2. Génère un code OTP
     * 3. Envoie l'email avec le code
     */
    public void forgotPassword(String email) {
        log.info("Demande de réinitialisation de mot de passe pour : {}", email);

        // Vérifier que l'utilisateur existe dans Keycloak
        if (!keycloakService.emailExists(email)) {
            throw new RuntimeException("Aucun compte associé à cet email");
        }

        UserRepresentation keycloakUser = keycloakService.getUserByEmail(email);

        // Générer et envoyer le code OTP pour reset password
        // L'email sera envoyé automatiquement avec le template reset-password
        otpService.generateAndSendOtp(
            email,
            keycloakUser.getFirstName(),
            OtpType.PASSWORD_RESET,
            null,
            keycloakUser.getId(),
            null
        );

        log.info("Email de réinitialisation envoyé à : {}", email);
    }

    /**
     * Réinitialisation du mot de passe avec code OTP
     * 1. Vérifie le code OTP
     * 2. Change le mot de passe dans Keycloak
     * 3. Invalide tous les OTP en attente
     */
    public void resetPassword(String email, String otpCode, String newPassword) {
        log.info("Tentative de réinitialisation de mot de passe pour : {}", email);

        // Vérifier le code OTP avec le type PASSWORD_RESET
        boolean isValid = otpService.verifyOtpWithType(email, otpCode, OtpType.PASSWORD_RESET);

        if (!isValid) {
            throw new RuntimeException("Code de vérification invalide ou expiré");
        }

        // Récupérer l'utilisateur Keycloak
        UserRepresentation keycloakUser = keycloakService.getUserByEmail(email);

        // Changer le mot de passe dans Keycloak
        keycloakService.updatePassword(keycloakUser.getId(), newPassword);

        // Invalider tous les OTP en attente pour cet email
        otpService.invalidateAllPendingOtps(email);

        log.info("Mot de passe réinitialisé avec succès pour : {}", email);
    }

    /**
     * Finalise l'inscription après validation du paiement Stripe
     * 1. Récupère la session Stripe et vérifie le paiement
     * 2. Récupère les données d'inscription depuis otp_verification
     * 3. Crée l'utilisateur en base avec plan PRO/ENTERPRISE + ACTIVE
     * 4. Marque l'email comme vérifié dans Keycloak
     * 5. Retourne les tokens JWT et les détails du paiement
     * 
     * @param sessionId ID de la session Stripe Checkout
     * @return Détails de la vérification et création de l'utilisateur
     */
    public com.taskforce.tf_api.core.dto.response.VerifySessionResponse completeRegistrationAfterPayment(String sessionId) throws StripeException {
        log.info("Finalisation de l'inscription après paiement - Session: {}", sessionId);

        // 1. Récupérer la session Stripe
        com.stripe.model.checkout.Session session = stripeService.getCheckoutSession(sessionId);
        
        // 2. Vérifier que le paiement est complété
        if (!"paid".equals(session.getPaymentStatus())) {
            throw new RuntimeException("Le paiement n'est pas encore validé. Statut: " + session.getPaymentStatus());
        }

        String customerId = session.getCustomer();
        String subscriptionId = session.getSubscription();
        
        // 3. Récupérer l'email depuis le Customer Stripe (pas depuis la session)
        com.stripe.model.Customer customer = stripeService.retrieveCustomer(customerId);
        String customerEmail = customer.getEmail();

        log.info("Paiement validé pour {} - Customer: {}, Subscription: {}", 
            customerEmail, customerId, subscriptionId);

        // 3. Récupérer les données d'inscription depuis OTP (dernier OTP même si déjà vérifié)
        OtpVerification otpVerification = otpService.getLatestOtp(customerEmail);
        
        if (otpVerification == null) {
            throw new RuntimeException("Aucune inscription en attente trouvée pour cet email");
        }

        String keycloakId = otpVerification.getKeycloakId();
        String planType = otpVerification.getPlanType();

        if (keycloakId == null || planType == null) {
            throw new RuntimeException("Données d'inscription incomplètes");
        }

        // 4. Vérifier si l'utilisateur existe déjà en base (cas normal pour plans payants)
        if (userRepository.existsByEmail(customerEmail)) {
            User existingUser = userRepository.findByEmail(customerEmail)
                .orElseThrow(() -> new RuntimeException("Utilisateur non trouvé"));
            
            log.info("Utilisateur {} déjà créé en base. Mise à jour avec les infos de paiement.", customerEmail);
            
            // Mettre à jour avec les informations de paiement (paiement déjà validé ci-dessus).
            existingUser.setStripeCustomerId(customerId);
            existingUser.setStripeSubscriptionId(subscriptionId);
            existingUser.setPlanType(PlanType.valueOf(planType.toUpperCase())); // applique le forfait payé
            existingUser.setPlanStatus(PlanStatus.ACTIVE);
            userRepository.save(existingUser);
            
            log.info("Utilisateur {} mis à jour : plan {} ACTIVE, subscription {}", 
                customerEmail, existingUser.getPlanType(), subscriptionId);
            
            return com.taskforce.tf_api.core.dto.response.VerifySessionResponse.builder()
                .email(customerEmail)
                .planType(existingUser.getPlanType().toString())
                .paymentStatus(session.getPaymentStatus())
                .subscriptionId(subscriptionId)
                .customerId(customerId)
                .userCreated(false)
                .message("Paiement validé avec succès. Votre abonnement est maintenant actif.")
                .build();
        }

        // 5. Récupérer l'utilisateur Keycloak
        UserRepresentation keycloakUser = keycloakService.getUserByEmail(customerEmail);
        
        // 6. Marquer l'email comme vérifié dans Keycloak
        if (!Boolean.TRUE.equals(keycloakUser.isEmailVerified())) {
            keycloakService.verifyEmail(keycloakId);
            log.info("Email marqué comme vérifié dans Keycloak pour {}", customerEmail);
        }

        // 7. Créer l'utilisateur en base avec plan payant ACTIVE
        PlanType planTypeEnum = PlanType.valueOf(planType.toUpperCase());
        User user = User.builder()
            .keycloakId(keycloakId)
            .email(customerEmail)
            .planType(planTypeEnum)
            .planStatus(PlanStatus.ACTIVE)  // Plan activé immédiatement après paiement
            .stripeCustomerId(customerId)
            .stripeSubscriptionId(subscriptionId)
            .isActive(true)
            .displayName(buildDisplayName(keycloakUser.getFirstName(), keycloakUser.getLastName()))
            .build();

        user = userRepository.save(user);
        log.info("Utilisateur {} créé en base avec plan {} ACTIVE (ID: {})",
            customerEmail, planType, user.getId());

        // 8. Envoyer l'email de bienvenue
        emailService.sendWelcomeEmail(customerEmail, keycloakUser.getFirstName());

        return com.taskforce.tf_api.core.dto.response.VerifySessionResponse.builder()
            .email(customerEmail)
            .planType(planType)
            .paymentStatus(session.getPaymentStatus())
            .subscriptionId(subscriptionId)
            .customerId(customerId)
            .userCreated(true)
            .message("Inscription finalisée avec succès. Votre abonnement est actif.")
            .build();
    }

    /**
     * Rafraîchit l'access token via le <b>refresh token Keycloak</b> (rotation gérée par l'IdP).
     * L'utilisateur est identifié à partir du claim {@code email} du nouvel access token.
     */
    public AuthResponse refreshToken(String refreshTokenValue) {
        log.info("Tentative de rafraîchissement du token via Keycloak");

        KeycloakTokenResponse kcToken = keycloakAuthService.refreshToken(refreshTokenValue);

        String email = extractClaim(kcToken.getAccessToken(), "email");
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new RuntimeException("Utilisateur non trouvé"));

        if (!user.getIsActive()) {
            throw new RuntimeException("Ce compte est désactivé");
        }

        log.info("Token rafraîchi pour : {}", user.getEmail());
        return buildAuthResponse(user, kcToken,
            extractClaim(kcToken.getAccessToken(), "given_name"),
            extractClaim(kcToken.getAccessToken(), "family_name"));
    }

    /**
     * Déconnexion : invalide toutes les sessions Keycloak de l'utilisateur (révocation côté IdP
     * des access + refresh tokens). L'utilisateur est identifié via le claim {@code email} de
     * l'access token (best-effort : un échec ne bloque pas la déconnexion côté client).
     */
    public void logout(String accessToken) {
        log.info("Déconnexion en cours");
        try {
            String email = extractClaim(accessToken, "email");
            User user = userRepository.findByEmail(email).orElse(null);
            if (user != null && user.getKeycloakId() != null) {
                keycloakService.logoutUser(user.getKeycloakId());
                log.info("Sessions Keycloak révoquées pour userId : {}", user.getId());
            }
        } catch (Exception e) {
            log.warn("Déconnexion : révocation Keycloak impossible ({})", e.getMessage());
        }
    }

    /** Construit la réponse d'authentification à partir des tokens Keycloak + du profil DB. */
    /**
     * Finalise une connexion via un fournisseur externe (GitHub, Google).
     *
     * <p>Appelée après que {@code OAuthLoginService} a échangé le code contre des jetons et lu le
     * profil. Keycloak a déjà authentifié la personne ; il reste à faire exister son compte
     * <b>chez nous</b>.</p>
     *
     * <h3>Création au premier passage, workspace compris</h3>
     * Contrairement au repli de {@link #login}, on crée aussi le <b>workspace initial</b>, comme le
     * fait l'inscription classique. Sans lui, quelqu'un arrivant par GitHub atterrirait dans une
     * application sans espace de travail : rien à ouvrir, rien à faire. Une identité vérifiée ailleurs
     * ne dispense pas de lui donner un point de départ.
     *
     * <h3>Résolution par adresse, et pourquoi</h3>
     * On cherche l'utilisateur par son <b>adresse</b>, pas par son identifiant Keycloak : quelqu'un
     * qui s'est inscrit par mot de passe puis revient par GitHub doit retrouver son compte, pas en
     * créer un second. Keycloak fusionne les identités sur l'adresse, on suit la même règle.
     */
    @Transactional
    public AuthResponse completeOAuthLogin(Map<String, Object> profil, Map<String, Object> jetons) {
        String email     = str(profil.get("email"));
        String firstName = str(profil.get("given_name"));
        String lastName  = str(profil.get("family_name"));
        String keycloakId = str(profil.get("sub"));

        if (email == null || email.isBlank()) {
            // Un compte GitHub peut n'exposer aucune adresse publique. Sans adresse nous ne pouvons
            // ni rattacher un compte existant, ni en créer un cohérent : mieux vaut le dire.
            throw new RuntimeException(
                "Votre compte externe ne fournit pas d'adresse e-mail. "
                + "Rendez-la visible chez le fournisseur, ou utilisez l'inscription classique.");
        }

        boolean creation = userRepository.findByEmail(email).isEmpty();

        User user = userRepository.findByEmail(email).orElseGet(() -> {
            log.info("Première connexion externe pour {} : création du compte local", email);
            return userRepository.save(User.builder()
                .keycloakId(keycloakId)
                .email(email)
                .planType(PlanType.FREE)
                .planStatus(PlanStatus.ACTIVE)
                .isActive(true)
                .displayName(buildDisplayName(firstName, lastName))
                .build());
        });

        if (!user.getIsActive()) {
            throw new RuntimeException("Ce compte est désactivé");
        }

        if (creation) {
            workspaceService.createWorkspace(user, firstName);
        }
        workspaceInvitationService.acceptPendingInvitations(user);

        KeycloakTokenResponse kcToken = KeycloakTokenResponse.builder()
            .accessToken(str(jetons.get("access_token")))
            .refreshToken(str(jetons.get("refresh_token")))
            .tokenType("Bearer")
            .expiresIn(intOf(jetons.get("expires_in")))
            .refreshExpiresIn(intOf(jetons.get("refresh_expires_in")))
            .build();

        auditService.record(null, user.getId(), AuditService.USER_LOGIN);
        log.info("Connexion externe réussie pour : {}", email);

        return buildAuthResponse(user, kcToken, firstName, lastName);
    }

    private static String str(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private static Integer intOf(Object value) {
        if (value instanceof Number n) {
            return n.intValue();
        }
        return null;
    }

    private AuthResponse buildAuthResponse(User user, KeycloakTokenResponse kcToken,
                                           String firstName, String lastName) {
        UserResponse userResponse = UserResponse.builder()
            .id(user.getId())
            .keycloakId(user.getKeycloakId())
            .email(user.getEmail())
            .firstName(firstName)
            .lastName(lastName)
            .displayName(user.getDisplayName())
            .avatarUrl(user.getAvatarUrl())
            .jobTitle(user.getJobTitle())
            .onboardingCompleted(user.getOnboardingCompleted())
            .planType(user.getPlanType())
            .planStatus(user.getPlanStatus())
            .subscriptionStartDate(user.getSubscriptionStartDate())
            .subscriptionEndDate(user.getSubscriptionEndDate())
            .trialEndDate(user.getTrialEndDate())
            .isActive(user.getIsActive())
            .createdAt(user.getCreatedAt())
            .build();

        return AuthResponse.builder()
            .accessToken(kcToken.getAccessToken())
            .refreshToken(kcToken.getRefreshToken())
            .tokenType(kcToken.getTokenType() != null ? kcToken.getTokenType() : "Bearer")
            .expiresIn((long) kcToken.getExpiresIn())
            .user(userResponse)
            .build();
    }

    /** Lit un claim (string) d'un JWT <b>sans vérifier la signature</b> (le token vient de Keycloak). */
    private String extractClaim(String jwt, String claim) {
        try {
            return JWTParser.parse(jwt).getJWTClaimsSet().getStringClaim(claim);
        } catch (ParseException e) {
            throw new RuntimeException("Token invalide");
        }
    }

    private String buildDisplayName(String firstName, String lastName) {
        String fn = (firstName != null && !firstName.isBlank()) ? firstName.trim() : "";
        String ln = (lastName != null && !lastName.isBlank()) ? lastName.trim() : "";
        if (!fn.isEmpty() && !ln.isEmpty()) return fn + " " + ln;
        if (!fn.isEmpty()) return fn;
        if (!ln.isEmpty()) return ln;
        return null;
    }
}
