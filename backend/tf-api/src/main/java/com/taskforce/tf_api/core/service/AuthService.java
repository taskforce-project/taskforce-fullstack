package com.taskforce.tf_api.core.service;

import com.stripe.exception.StripeException;
import com.stripe.model.Customer;
import com.taskforce.tf_api.core.dto.request.LoginRequest;
import com.taskforce.tf_api.core.dto.request.RegisterRequest;
import com.taskforce.tf_api.core.dto.request.VerifyOtpRequest;
import com.taskforce.tf_api.core.dto.response.AuthResponse;
import com.taskforce.tf_api.core.dto.response.RegisterResponse;
import com.taskforce.tf_api.core.dto.response.UserResponse;
import com.taskforce.tf_api.core.dto.response.VerifyOtpResponse;
import com.taskforce.tf_api.core.enums.OtpType;
import com.taskforce.tf_api.core.enums.PlanType;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.keycloak.representations.idm.UserRepresentation;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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
    private final OtpService otpService;
    private final StripeService stripeService;
    private final EmailService emailService;
    private final UserRepository userRepository;
    private final JwtService jwtService;

    /**
     * Inscription d'un nouvel utilisateur
     * 1. Crée le compte dans Keycloak
     * 2. Génère et envoie le code OTP
     * 3. Retourne une réponse indiquant que l'OTP a été envoyé
     */
    public RegisterResponse register(RegisterRequest request) {
        log.info("Tentative d'inscription pour : {}", request.getEmail());

        // Vérifier si l'email existe déjà dans notre DB
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new RuntimeException("Cet email est déjà utilisé");
        }

        // Vérifier si l'email existe déjà dans Keycloak
        if (keycloakService.emailExists(request.getEmail())) {
            throw new RuntimeException("Cet email est déjà utilisé");
        }

        // Créer l'utilisateur dans Keycloak
        String keycloakId = keycloakService.createUser(
            request.getEmail(),
            request.getPassword(),
            request.getFirstName(),
            request.getLastName()
        );

        // Générer et envoyer le code OTP
        otpService.generateAndSendOtp(
            request.getEmail(),
            request.getFirstName(),
            OtpType.EMAIL_VERIFICATION,
            null, // userId pas encore créé dans notre DB
            keycloakId
        );

        log.info("Inscription réussie pour : {}. OTP envoyé.", request.getEmail());

        return RegisterResponse.builder()
            .message("Un code de vérification a été envoyé à votre adresse email")
            .email(request.getEmail())
            .otpSent(true)
            .otpExpiresInMinutes(15)
            .build();
    }

    /**
     * Vérification du code OTP et finalisation de l'inscription
     * 1. Vérifie le code OTP
     * 2. Marque l'email comme vérifié dans Keycloak
     * 3. Crée l'utilisateur dans notre DB
     * 4. Si plan payant : crée client Stripe et retourne URL checkout
     * 5. Génère les tokens JWT
     */
    public VerifyOtpResponse verifyOtpAndCompleteRegistration(VerifyOtpRequest request, String planType) {
        log.info("Vérification OTP pour : {}", request.getEmail());

        // Vérifier le code OTP
        boolean otpValid = otpService.verifyOtp(request.getEmail(), request.getOtpCode());

        if (!otpValid) {
            throw new RuntimeException("Code de vérification invalide ou expiré");
        }

        // Récupérer l'utilisateur depuis Keycloak
        UserRepresentation keycloakUser = keycloakService.getUserByEmail(request.getEmail());
        String keycloakId = keycloakUser.getId();

        // Marquer l'email comme vérifié dans Keycloak
        keycloakService.verifyEmail(keycloakId);

        // Créer l'utilisateur dans notre DB
        User user = User.builder()
            .keycloakId(keycloakId)
            .email(request.getEmail())
            .planType(PlanType.valueOf(planType.toUpperCase()))
            .isActive(true)
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

        // TODO: Authentifier via Keycloak (nécessite configuration OAuth2/OpenID Connect)
        // Pour l'instant, on va juste vérifier que l'utilisateur existe

        // Récupérer l'utilisateur depuis Keycloak
        UserRepresentation keycloakUser = keycloakService.getUserByEmail(request.getEmail());

        if (!keycloakUser.isEmailVerified()) {
            throw new RuntimeException("Veuillez vérifier votre email avant de vous connecter");
        }

        // Récupérer l'utilisateur depuis notre DB
        User user = userRepository.findByKeycloakId(keycloakUser.getId())
            .orElseThrow(() -> new RuntimeException("Utilisateur non trouvé"));

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

        // Générer et envoyer un nouveau code OTP
        otpService.generateAndSendOtp(
            email,
            keycloakUser.getFirstName(),
            OtpType.EMAIL_VERIFICATION,
            null,
            keycloakUser.getId()
        );

        return RegisterResponse.builder()
            .message("Un nouveau code de vérification a été envoyé")
            .email(email)
            .otpSent(true)
            .otpExpiresInMinutes(15)
            .build();
    }
}
