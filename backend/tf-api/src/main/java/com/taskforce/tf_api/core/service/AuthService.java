package com.taskforce.tf_api.core.service;

import org.keycloak.representations.idm.UserRepresentation;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.stripe.exception.StripeException;
import com.stripe.model.Customer;
import com.taskforce.tf_api.core.dto.request.LoginRequest;
import com.taskforce.tf_api.core.dto.request.RegisterRequest;
import com.taskforce.tf_api.core.dto.request.SelectPlanRequest;
import com.taskforce.tf_api.core.dto.request.VerifyOtpRequest;
import com.taskforce.tf_api.core.dto.response.AuthResponse;
import com.taskforce.tf_api.core.dto.response.RegisterResponse;
import com.taskforce.tf_api.core.dto.response.SelectPlanResponse;
import com.taskforce.tf_api.core.dto.response.VerifyOtpResponse;
import com.taskforce.tf_api.core.enums.OtpType;
import com.taskforce.tf_api.core.enums.PlanStatus;
import com.taskforce.tf_api.core.enums.PlanType;
import com.taskforce.tf_api.core.model.OtpVerification;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;

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
    private final JwtService jwtService;

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

        // Créer l'utilisateur dans notre DB
        PlanType planTypeEnum = PlanType.valueOf(planType.toUpperCase());
        User user = User.builder()
            .keycloakId(keycloakId)
            .email(request.getEmail())
            .planType(planTypeEnum)
            .isActive(true)
            // Plan status: NULL pour FREE, TRIALING pour plans payants en attente de configuration Stripe
            .planStatus(planTypeEnum == PlanType.FREE ? null : com.taskforce.tf_api.core.enums.PlanStatus.TRIALING)
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
                    "http://localhost:3000/payment/success", // À configurer
                    "http://localhost:3000/payment/cancel",  // À configurer
                    null
                );
                checkoutUrl = session.getUrl();

            } catch (StripeException e) {
                log.error("Erreur lors de la création du client Stripe", e);
                throw new RuntimeException("Erreur lors de la configuration du paiement");
            }
        }

        user = userRepository.save(user);
        log.info("Utilisateur créé dans la DB avec ID : {}", user.getId());

        // Envoyer l'email de bienvenue
        emailService.sendWelcomeEmail(request.getEmail(), keycloakUser.getFirstName());

        // Générer les tokens JWT
        AuthResponse authData = jwtService.generateTokens(user, keycloakUser);

        return VerifyOtpResponse.builder()
            .verified(true)
            .message("Email vérifié avec succès")
            .authData(authData)
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

        // Authentifier l'utilisateur via Keycloak (vérifie email + password)
        try {
            keycloakAuthService.authenticate(
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
                    .build();
                
                return userRepository.save(newUser);
            });

        if (!user.getIsActive()) {
            throw new RuntimeException("Ce compte est désactivé");
        }

        // Générer les tokens JWT
        AuthResponse authResponse = jwtService.generateTokens(user, keycloakUser);

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

        // Récupérer le plan depuis l'OTP existant
        OtpVerification existingOtp = otpService.getLatestPendingOtp(email);
        PlanType planType = existingOtp != null && existingOtp.getPlanType() != null 
            ? PlanType.valueOf(existingOtp.getPlanType()) 
            : null;

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
}
