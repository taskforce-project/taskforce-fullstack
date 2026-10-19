package com.taskforce.tf_api.core.service;

import org.keycloak.representations.idm.UserRepresentation;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import java.util.Map;

import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.dto.request.LoginRequest;
import com.taskforce.tf_api.core.dto.request.RegisterRequest;
import com.taskforce.tf_api.core.dto.request.VerifyOtpRequest;
import com.taskforce.tf_api.core.dto.request.ForgotPasswordRequest;
import com.taskforce.tf_api.core.dto.request.ResetPasswordRequest;
import com.taskforce.tf_api.core.dto.response.AuthResponse;
import com.taskforce.tf_api.core.dto.response.RegisterResponse;
import com.taskforce.tf_api.core.dto.response.UserResponse;
import com.taskforce.tf_api.core.dto.response.VerifyOtpResponse;
import com.taskforce.tf_api.core.enums.OtpType;
import com.taskforce.tf_api.core.model.OtpVerification;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.WorkspaceService;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.security.HumanChallengeService;
import com.taskforce.tf_api.shared.security.OAuthTwoFactorChallenge;

import com.nimbusds.jwt.JWTParser;

import java.text.ParseException;
import java.time.LocalDateTime;

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
    private final EmailService emailService;
    private final UserRepository userRepository;
    private final WorkspaceService workspaceService;
    private final AuditService auditService;
    private final HumanChallengeService humanChallengeService;
    private final TwoFactorService twoFactorService;
    private final OAuthTwoFactorChallenge oauthTwoFactorChallenge;

    // Miroir du délai de grâce (GdprService) : expose la date de PURGE dans la réponse d'auth.
    @Value("${taskforce.account.deletion-grace-days:30}")
    private int graceDays;

    // Vérification de l'adresse à l'inscription, par un code envoyé par e-mail. Une instance sans SMTP
    // (auto-hébergement) la coupe : le compte est prêt tout de suite, sans preuve que l'adresse appartient à la
    // personne. Vrai par défaut, la prod et le dev gardent la vérification.
    @Value("${taskforce.signup.email-verification:true}")
    private boolean signupEmailVerification = true;

    @jakarta.annotation.PostConstruct
    void warnWhenSignupIsNotVerified() {
        if (!signupEmailVerification) {
            log.warn("Inscription sans vérification d'e-mail (SIGNUP_EMAIL_VERIFICATION=false) : quiconque joint "
                + "l'instance peut créer un compte avec n'importe quelle adresse, y compris une adresse invitée. "
                + "À réserver à un réseau privé, ou configurer un SMTP.");
        }
    }

    /**
     * Inscription d'un nouvel utilisateur
     * 1. Crée le compte dans Keycloak (ou renvoie OTP si déjà créé mais non vérifié)
     * 2. Génère et envoie le code OTP
     * 3. Retourne une réponse indiquant que l'OTP a été envoyé
     * 
     * Reçoit toutes les informations en une seule fois. Aucun choix de forfait : TaskForce est libre (ADR-016).
     * Méthode idempotente : si l'utilisateur existe déjà dans Keycloak mais n'est pas vérifié,
     * renvoie simplement un OTP au lieu de lever une erreur.
     */
    public RegisterResponse register(RegisterRequest request) {
        log.info("Tentative d'inscription pour : {}", request.getEmail());

        // Vérification humaine AVANT tout travail : le but est d'éviter qu'un automate ne déclenche
        // en volume la création Keycloak et l'envoi de courriels. La contrôler après aurait laissé
        // passer précisément ce qu'elle protège.
        String refus = humanChallengeService.verify(request.getChallengeToken());
        if (refus != null) {
            throw new RuntimeException(refus);
        }

        // Vérifier si l'email existe déjà dans notre DB (utilisateur complètement enregistré)
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new RuntimeException("This email is already in use. Please sign in.");
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
                throw new RuntimeException("This email is already verified. Please sign in.");
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
                        throw new RuntimeException("This email is already verified. Please sign in.");
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

        // Instance sans vérification d'e-mail (pas de SMTP) : aucun code à envoyer, le compte est prêt.
        if (!signupEmailVerification) {
            if (userAlreadyExists) {
                // Compte resté non vérifié d'une tentative précédente : il prend ce qui vient d'être saisi.
                keycloakService.updatePassword(keycloakId, request.getPassword());
                keycloakService.updateUserNames(keycloakId, request.getFirstName(), request.getLastName());
            }
            completeRegistration(request.getEmail());
            log.info("Inscription sans vérification d'e-mail pour : {}", request.getEmail());
            return RegisterResponse.builder()
                .message("Account created. You can now sign in.")
                .email(request.getEmail())
                .otpSent(false)
                .build();
        }

        // Générer et envoyer le code OTP
        otpService.generateAndSendOtp(
            request.getEmail(),
            firstName, // Utiliser le prénom récupéré (peut venir de Keycloak ou de la requête)
            OtpType.EMAIL_VERIFICATION,
            null, // userId pas encore créé dans notre DB
            keycloakId
        );

        log.info("Inscription {} pour : {}. OTP envoyé.",
            userAlreadyExists ? "réessayée" : "réussie",
            request.getEmail());

        return RegisterResponse.builder()
            .message("A verification code has been sent to your email address")
            .email(request.getEmail())
            .otpSent(true)
            .otpExpiresInMinutes(15)
            .build();
    }

    /**
     * Vérification du code OTP et finalisation de l'inscription
     * 1. Vérifie le code OTP
     * 2. Marque l'email comme vérifié dans Keycloak
     * 3. Crée l'utilisateur dans notre DB et son workspace initial ; la personne se connecte ensuite
     */
    public VerifyOtpResponse verifyOtpAndCompleteRegistration(VerifyOtpRequest request) {
        log.info("Vérification OTP pour : {}", request.getEmail());

        // Vérifier le code OTP (les tentatives sont incrémentées automatiquement en cas d'échec)
        OtpVerification otpVerification = otpService.verifyOtpAndGetDetails(request.getEmail(), request.getOtpCode());

        if (otpVerification == null) {
            throw new RuntimeException("Invalid or expired verification code");
        }

        completeRegistration(request.getEmail());

        // Depuis la migration OIDC : plus d'auto-login (Keycloak ne peut émettre un token sans
        // mot de passe, absent à ce stade). Le compte est prêt ; le front redirige vers /login.
        return VerifyOtpResponse.builder()
            .verified(true)
            .message("Email verified. You can now sign in.")
            .authData(null)
            .build();
    }

    /** Vrai si le compte de cette adresse a une application d'authentification ; faux pour une adresse inconnue. */
    private boolean hasKeycloakOneTimeCode(String email) {
        try {
            UserRepresentation account = keycloakService.getUserByEmail(email);
            return account != null && keycloakService.hasOneTimeCode(account.getId());
        } catch (RuntimeException e) {
            // Compte inconnu : le mot de passe échouera de toute façon, avec le message habituel.
            return false;
        }
    }

    /**
     * Connexion d'un utilisateur
     * 1. Authentifie via Keycloak (vérification email/password, et code de l'application d'authentification si le
     *    compte en a enregistré une sur le compte en ligne)
     * 2. Récupère l'utilisateur de notre DB
     * 3. Génère les tokens JWT
     */
    public AuthResponse login(LoginRequest request) {
        log.info("Tentative de connexion pour : {}", request.getEmail());

        // 2FA du compte en ligne : un compte qui a une application d'authentification dans Keycloak donne son code à
        // Keycloak lui-même, avec le mot de passe. On le demande donc avant tout appel, comme pour le 2FA de l'app.
        boolean keycloakOneTimeCode = hasKeycloakOneTimeCode(request.getEmail());
        if (keycloakOneTimeCode && (request.getTotp() == null || request.getTotp().isBlank())) {
            log.info("Code de l'application d'authentification requis pour : {}", request.getEmail());
            return AuthResponse.builder().twoFactorRequired(true).build();
        }

        // Authentifier l'utilisateur via Keycloak (vérifie email + password) et récupérer les
        // tokens OIDC RS256 émis par Keycloak (plus de token custom HS512).
        KeycloakTokenResponse kcToken;
        try {
            kcToken = keycloakOneTimeCode
                ? keycloakAuthService.authenticate(request.getEmail(), request.getPassword(), request.getTotp())
                : keycloakAuthService.authenticate(request.getEmail(), request.getPassword());

            log.info("Authentification Keycloak réussie pour : {}", request.getEmail());
        } catch (RuntimeException e) {
            log.error("Échec d'authentification Keycloak pour {} : {}", request.getEmail(), e.getMessage());
            throw new RuntimeException("Invalid email or password");
        }

        // Récupérer l'utilisateur depuis Keycloak
        UserRepresentation keycloakUser = keycloakService.getUserByEmail(request.getEmail());

        if (!keycloakUser.isEmailVerified()) {
            throw new RuntimeException("Please verify your email before signing in");
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
                    .isActive(true)
                    .displayName(buildDisplayName(keycloakUser.getFirstName(), keycloakUser.getLastName()))
                    .build();
                
                return userRepository.save(newUser);
            });

        if (!user.getIsActive()) {
            throw new RuntimeException("This account is disabled");
        }

        // 2FA géré par l'app (avant le 2FA du compte en ligne) : le mot de passe est bon. Si le 2FA est actif, on exige
        // un code TOTP AVANT d'émettre le moindre token. Inutile quand Keycloak vient de vérifier un code.
        if (!keycloakOneTimeCode && twoFactorService.isEnabled(user.getId())) {
            String totp = request.getTotp();
            if (totp == null || totp.isBlank()) {
                log.info("2FA requis pour : {}", request.getEmail());
                return AuthResponse.builder().twoFactorRequired(true).build();
            }
            twoFactorService.verifyOrThrow(user.getId(), totp);
        }

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
            throw new RuntimeException("This email is already verified");
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
            .message("A new verification code has been sent")
            .email(email)
            .otpSent(true)
            .otpExpiresInMinutes(15)
            .build();
    }

    /**
     * Compte prêt : adresse marquée vérifiée dans Keycloak, utilisateur et premier workspace créés, e-mail de
     * bienvenue si un SMTP est configuré. La personne se connecte ensuite.
     */
    private void completeRegistration(String email) {
        UserRepresentation keycloakUser = keycloakService.getUserByEmail(email);
        String keycloakId = keycloakUser.getId();
        keycloakService.verifyEmail(keycloakId);

        User user = User.builder()
            .keycloakId(keycloakId)
            .email(email)
            .isActive(true)
            .displayName(buildDisplayName(keycloakUser.getFirstName(), keycloakUser.getLastName()))
            .build();
        user = userRepository.save(user);
        log.info("Utilisateur créé dans la DB avec ID : {}", user.getId());

        workspaceService.createWorkspace(user, keycloakUser.getFirstName());
        if (emailService.isEnabled()) {
            emailService.sendWelcomeEmail(email, keycloakUser.getFirstName());
        }
    }

    /**
     * Demande de réinitialisation de mot de passe
     * 1. Vérifie que l'utilisateur existe
     * 2. Génère un code OTP
     * 3. Envoie l'email avec le code
     */
    public void forgotPassword(String email) {
        log.info("Demande de réinitialisation de mot de passe pour : {}", email);

        // Sans SMTP, le code ne peut pas partir : le dire, plutôt qu'une erreur d'envoi.
        if (!emailService.isEnabled()) {
            throw new BusinessException(
                "Password reset by email is not available on this instance: ask an administrator to reset your password");
        }

        // Vérifier que l'utilisateur existe dans Keycloak
        if (!keycloakService.emailExists(email)) {
            throw new RuntimeException("No account uses this email");
        }

        UserRepresentation keycloakUser = keycloakService.getUserByEmail(email);

        // Générer et envoyer le code OTP pour reset password
        // L'email sera envoyé automatiquement avec le template reset-password
        otpService.generateAndSendOtp(
            email,
            keycloakUser.getFirstName(),
            OtpType.PASSWORD_RESET,
            null,
            keycloakUser.getId()
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
            throw new RuntimeException("Invalid or expired verification code");
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
     * Rafraîchit l'access token via le <b>refresh token Keycloak</b> (rotation gérée par l'IdP).
     * L'utilisateur est identifié à partir du claim {@code email} du nouvel access token.
     */
    public AuthResponse refreshToken(String refreshTokenValue) {
        log.info("Tentative de rafraîchissement du token via Keycloak");

        KeycloakTokenResponse kcToken = keycloakAuthService.refreshToken(refreshTokenValue);

        String email = extractClaim(kcToken.getAccessToken(), "email");
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new RuntimeException("User not found"));

        if (!user.getIsActive()) {
            throw new RuntimeException("This account is disabled");
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
        // Photo de profil du fournisseur. Keycloak ne l'expose dans le `userinfo` que si un mapper
        // d'attribut recopie l'avatar en claim `picture` (config IdP, cf. ops/kc-setup.sh). Absente,
        // l'avatar généré côté front (identicon déterministe) prend le relais : personne sans photo.
        String picture = str(profil.get("picture"));

        if (email == null || email.isBlank()) {
            // Un compte GitHub peut n'exposer aucune adresse publique. Sans adresse nous ne pouvons
            // ni rattacher un compte existant, ni en créer un cohérent : mieux vaut le dire.
            throw new RuntimeException(
                "Your external account doesn't share an email address. "
                + "Make it visible at the provider, or sign up with email and password.");
        }

        // Fix M7 (TF-SEC-OAUTH-VERIFY) : refuser une connexion externe dont le fournisseur déclare l'e-mail
        // NON vérifié — sinon un compte IdP portant l'e-mail d'une victime pourrait se greffer sur son compte
        // local (prise de contrôle par identité e-mail). Google et GitHub ne renvoient que des e-mails
        // vérifiés, donc les connexions légitimes ne sont pas touchées ; ce garde-fou couvre un IdP mal
        // configuré. (Le contrôle complet — exiger `email_verified` + maîtriser le linking — se pose aussi
        // côté realm Keycloak.)
        Object verifiedClaim = profil.get("email_verified");
        boolean explicitlyUnverified =
            Boolean.FALSE.equals(verifiedClaim) || "false".equalsIgnoreCase(str(verifiedClaim));
        if (explicitlyUnverified) {
            throw new RuntimeException(
                "The email address of your external account isn't verified. "
                + "Verify it at the provider, then try again.");
        }

        boolean creation = userRepository.findByEmail(email).isEmpty();

        User user = userRepository.findByEmail(email).orElseGet(() -> {
            log.info("Première connexion externe pour {} : création du compte local", email);
            return userRepository.save(User.builder()
                .keycloakId(keycloakId)
                .email(email)
                .isActive(true)
                .displayName(buildDisplayName(firstName, lastName))
                .avatarUrl(picture)
                .build());
        });

        if (!user.getIsActive()) {
            throw new RuntimeException("This account is disabled");
        }

        // Rattrapage : un compte créé par mot de passe (donc sans photo) qui se connecte ensuite par
        // GitHub/Google récupère sa photo de profil. On n'écrase jamais un avatar déjà défini — une
        // photo importée par la personne l'emporte sur celle du fournisseur.
        if ((user.getAvatarUrl() == null || user.getAvatarUrl().isBlank())
                && picture != null && !picture.isBlank()) {
            user.setAvatarUrl(picture);
            userRepository.save(user);
        }

        if (creation) {
            workspaceService.createWorkspace(user, firstName);
        }

        KeycloakTokenResponse kcToken = KeycloakTokenResponse.builder()
            .accessToken(str(jetons.get("access_token")))
            .refreshToken(str(jetons.get("refresh_token")))
            .tokenType("Bearer")
            .expiresIn(intOf(jetons.get("expires_in")))
            .refreshExpiresIn(intOf(jetons.get("refresh_expires_in")))
            .build();

        // 2FA actif : le code d'autorisation du fournisseur est déjà consommé, impossible de le rejouer après
        // la saisie du code. Les jetons sont scellés dans un défi illisible côté navigateur, et la session
        // n'est délivrée que par completeOAuthTwoFactor, une fois le code vérifié. Avant ce garde, une
        // connexion GitHub ou Google contournait le 2FA (OSS-1.1).
        if (twoFactorService.isEnabled(user.getId())) {
            log.info("2FA requis pour la connexion externe de : {}", email);
            String challenge = oauthTwoFactorChallenge.seal(new OAuthTwoFactorChallenge.Pending(
                user.getId(), kcToken.getAccessToken(), kcToken.getRefreshToken(),
                kcToken.getExpiresIn(), kcToken.getRefreshExpiresIn(), firstName, lastName));
            return AuthResponse.builder().twoFactorRequired(true).twoFactorChallenge(challenge).build();
        }

        auditService.record(null, user.getId(), AuditService.USER_LOGIN);
        log.info("Connexion externe réussie pour : {}", email);

        return buildAuthResponse(user, kcToken, firstName, lastName);
    }

    /**
     * Connexion externe, étape du second facteur : ouvre le défi scellé par {@link #completeOAuthLogin},
     * vérifie le code TOTP, puis délivre la session.
     */
    @Transactional
    public AuthResponse completeOAuthTwoFactor(String challenge, String totp) {
        OAuthTwoFactorChallenge.Pending pending = oauthTwoFactorChallenge.open(challenge);
        User user = userRepository.findById(pending.userId())
            .orElseThrow(() -> new BusinessException("This sign-in has expired. Please sign in again."));
        if (!Boolean.TRUE.equals(user.getIsActive())) {
            throw new BusinessException("This account is disabled.");
        }
        if (totp == null || totp.isBlank()) {
            throw new BusinessException("Enter the code from your authenticator app.");
        }
        twoFactorService.verifyOrThrow(user.getId(), totp);

        KeycloakTokenResponse kcToken = KeycloakTokenResponse.builder()
            .accessToken(pending.accessToken())
            .refreshToken(pending.refreshToken())
            .tokenType("Bearer")
            .expiresIn(pending.expiresIn())
            .refreshExpiresIn(pending.refreshExpiresIn())
            .build();

        auditService.record(null, user.getId(), AuditService.USER_LOGIN);
        log.info("Connexion externe réussie après 2FA pour : {}", user.getEmail());
        return buildAuthResponse(user, kcToken, pending.firstName(), pending.lastName());
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
        LocalDateTime purgeAt = user.getDeletionScheduledAt() == null
            ? null
            : user.getDeletionScheduledAt().plusDays(graceDays);
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
            .isActive(user.getIsActive())
            .createdAt(user.getCreatedAt())
            .scheduledPurgeAt(purgeAt)
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
            throw new RuntimeException("Invalid token");
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
