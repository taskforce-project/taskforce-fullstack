package com.taskforce.tf_api.shared.exception;

import com.taskforce.tf_api.shared.dto.ErrorResponse;
import com.taskforce.tf_api.shared.util.LogSafe;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.ws.rs.WebApplicationException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.resource.NoResourceFoundException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Gestionnaire global des exceptions
 * Capture toutes les exceptions et les transforme en réponses HTTP standardisées
 */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    /**
     * Gère les exceptions de ressource non trouvée (404)
     */
    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<ErrorResponse> handleResourceNotFoundException(
            ResourceNotFoundException ex,
            HttpServletRequest request) {

        log.error("Resource not found: {}", ex.getMessage());

        ErrorResponse error = ErrorResponse.of(
                HttpStatus.NOT_FOUND.value(),
                "Not Found",
                ex.getMessage(),
                request.getRequestURI()
        );

        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error);
    }

    /**
     * Gère les exceptions métier (400)
     */
    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ErrorResponse> handleBusinessException(
            BusinessException ex,
            HttpServletRequest request) {

        log.error("Business error: {} - {}", ex.getErrorCode(), ex.getMessage());

        ErrorResponse error = ErrorResponse.of(
                HttpStatus.BAD_REQUEST.value(),
                ex.getErrorCode(),
                ex.getMessage(),
                request.getRequestURI()
        );

        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(error);
    }

    /**
     * Gère les erreurs de validation (400)
     */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidationException(
            MethodArgumentNotValidException ex,
            HttpServletRequest request) {

        Map<String, List<String>> validationErrors = new HashMap<>();

        ex.getBindingResult().getAllErrors().forEach(error -> {
            String fieldName = ((FieldError) error).getField();
            String errorMessage = error.getDefaultMessage();

            validationErrors
                    .computeIfAbsent(fieldName, k -> new ArrayList<>())
                    .add(errorMessage);
        });

        log.error("Validation error: {}", validationErrors);

        ErrorResponse error = ErrorResponse.of(
                HttpStatus.BAD_REQUEST.value(),
                "Validation Error",
                "Invalid input data",
                request.getRequestURI(),
                validationErrors
        );

        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(error);
    }

    /**
     * Gère les interdictions métier (403)
     */
    @ExceptionHandler(ForbiddenException.class)
    public ResponseEntity<ErrorResponse> handleForbiddenException(
            ForbiddenException ex,
            HttpServletRequest request) {

        log.error("Forbidden: {}", ex.getMessage());

        ErrorResponse error = ErrorResponse.of(
                HttpStatus.FORBIDDEN.value(),
                "Forbidden",
                ex.getMessage(),
                request.getRequestURI()
        );

        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(error);
    }

    /**
     * Gère les erreurs d'accès refusé (403)
     */
    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ErrorResponse> handleAccessDeniedException(
            AccessDeniedException ex,
            HttpServletRequest request) {

        log.error("Access denied: {}", ex.getMessage());

        ErrorResponse error = ErrorResponse.of(
                HttpStatus.FORBIDDEN.value(),
                "Forbidden",
                "You don't have permission to access this resource",
                request.getRequestURI()
        );

        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(error);
    }

    /**
     * Conflit de règle métier (limite de plan atteinte, doublon, transition d'état interdite…) → 409.
     * Évite que ces erreurs métier remontent en 500 (cf. PROD-4.8).
     */
    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<ErrorResponse> handleIllegalState(
            IllegalStateException ex,
            HttpServletRequest request) {

        log.warn("Conflit métier: {}", ex.getMessage());

        ErrorResponse error = ErrorResponse.of(
                HttpStatus.CONFLICT.value(),
                "Conflict",
                ex.getMessage(),
                request.getRequestURI()
        );

        return ResponseEntity.status(HttpStatus.CONFLICT).body(error);
    }

    /**
     * Débit IA par minute dépassé (budget LLM partagé protégé) → 429 avec {@code Retry-After}.
     * Message clair « réessaie dans un instant » plutôt qu'un échec LLM opaque. Distinct du quota
     * mensuel ({@link IllegalStateException} → 409) : ici c'est un pic de concurrence temporaire.
     */
    @ExceptionHandler(AiRateLimitedException.class)
    public ResponseEntity<ErrorResponse> handleAiRateLimited(
            AiRateLimitedException ex,
            HttpServletRequest request) {

        log.warn("Débit IA dépassé: {}", ex.getMessage());

        ErrorResponse error = ErrorResponse.of(
                HttpStatus.TOO_MANY_REQUESTS.value(),
                "Too Many Requests",
                ex.getMessage(),
                request.getRequestURI()
        );

        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .header("Retry-After", "60")
                .body(error);
    }

    /**
     * Argument métier invalide → 400 (au lieu de 500).
     */
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ErrorResponse> handleIllegalArgument(
            IllegalArgumentException ex,
            HttpServletRequest request) {

        log.warn("Requête invalide: {}", ex.getMessage());

        ErrorResponse error = ErrorResponse.of(
                HttpStatus.BAD_REQUEST.value(),
                "Bad Request",
                ex.getMessage(),
                request.getRequestURI()
        );

        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(error);
    }

    /**
     * Violation de contrainte d'intégrité (unicité, clé étrangère). Se produit notamment sur une
     * course « vérifier puis insérer » — typiquement une double soumission de l'onboarding : le
     * pré-check {@code existsBy...} passe pour deux requêtes concurrentes, et c'est la seconde
     * insertion qui viole la contrainte au commit (ex. {@code uq_project_identifier}, ou un profil
     * de compétences ré-inséré au re-run). Sans ce handler, cela remontait en <b>500 opaque</b> ;
     * on renvoie un <b>409</b> clair, que les appels best-effort du front savent traiter.
     */
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ErrorResponse> handleDataIntegrityViolation(
            DataIntegrityViolationException ex,
            HttpServletRequest request) {

        // Le message JPA/SQL peut exposer des détails de schéma : on le journalise en INTERNE
        // seulement, et on ne renvoie qu'un message générique et sûr au client.
        log.warn("Violation de contrainte d'intégrité sur {} : {}", LogSafe.of(request.getRequestURI()),
                LogSafe.of(ex.getMostSpecificCause().getMessage()));

        ErrorResponse error = ErrorResponse.of(
                HttpStatus.CONFLICT.value(),
                "Conflict",
                "This resource already exists or conflicts with another one.",
                request.getRequestURI()
        );

        return ResponseEntity.status(HttpStatus.CONFLICT).body(error);
    }

    /**
     * Ressource / route inexistante → 404 propre. Sans ce handler, {@code NoResourceFoundException}
     * (chemin statique introuvable — ex. {@code /swagger-ui/**} depuis que springdoc est désactivé en
     * prod, F1 de l'audit) et {@code NoHandlerFoundException} étaient interceptées par le fourre-tout
     * {@code Exception} ci-dessous et remontaient en <b>500</b> au lieu d'un <b>404</b>.
     */
    @ExceptionHandler({NoResourceFoundException.class, NoHandlerFoundException.class})
    public ResponseEntity<ErrorResponse> handleNotFound(
            Exception ex,
            HttpServletRequest request) {

        ErrorResponse error = ErrorResponse.of(
                HttpStatus.NOT_FOUND.value(),
                "Not Found",
                "Resource not found.",
                request.getRequestURI()
        );

        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error);
    }

    /**
     * Méthode HTTP non prise en charge sur une route qui existe (ex. GET sur une route POST seulement) → 405,
     * avec l'en-tête {@code Allow}. Sans ce handler, l'exception tombait dans le fourre-tout {@code Exception}
     * ci-dessous : 500 « Unexpected error » et une trace d'erreur au journal pour une simple requête mal formée.
     */
    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<ErrorResponse> handleMethodNotSupported(
            HttpRequestMethodNotSupportedException ex,
            HttpServletRequest request) {

        ErrorResponse error = ErrorResponse.of(
                HttpStatus.METHOD_NOT_ALLOWED.value(),
                "Method Not Allowed",
                "This method is not allowed on this resource.",
                request.getRequestURI()
        );

        ResponseEntity.BodyBuilder response = ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED);
        if (ex.getSupportedHttpMethods() != null && !ex.getSupportedHttpMethods().isEmpty()) {
            response.allow(ex.getSupportedHttpMethods().toArray(org.springframework.http.HttpMethod[]::new));
        }
        return response.body(error);
    }

    /**
     * Corps de requête absent ou illisible (JSON mal formé, ou d'une autre forme que celle attendue) → 400. Sans ce
     * handler, l'exception tombait dans le fourre-tout {@code Exception} ci-dessous : 500 « Unexpected error » et une
     * trace d'erreur au journal pour une simple requête mal formée (vu en prod le 20/10 : un POST sans corps sur
     * {@code /api/auth/desktop/session}). Le détail de l'analyseur reste au journal, jamais dans la réponse.
     */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ErrorResponse> handleUnreadableBody(
            HttpMessageNotReadableException ex,
            HttpServletRequest request) {

        log.debug("Corps de requête illisible sur {} : {}", LogSafe.of(request.getRequestURI()),
                LogSafe.of(ex.getMostSpecificCause().getMessage()));

        ErrorResponse error = ErrorResponse.of(
                HttpStatus.BAD_REQUEST.value(),
                "Bad Request",
                "The request body is missing or malformed.",
                request.getRequestURI()
        );

        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(error);
    }

    /**
     * Corps d'un type que la route ne lit pas (un formulaire là où elle attend du JSON, par exemple) → 415, avec
     * l'en-tête {@code Accept} des types qu'elle lit. Tombait aussi dans le fourre-tout 500.
     */
    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
    public ResponseEntity<ErrorResponse> handleUnsupportedMediaType(
            HttpMediaTypeNotSupportedException ex,
            HttpServletRequest request) {

        ErrorResponse error = ErrorResponse.of(
                HttpStatus.UNSUPPORTED_MEDIA_TYPE.value(),
                "Unsupported Media Type",
                "This content type is not supported on this resource.",
                request.getRequestURI()
        );

        return ResponseEntity.status(HttpStatus.UNSUPPORTED_MEDIA_TYPE).headers(ex.getHeaders()).body(error);
    }

    /**
     * Fichier trop volumineux (upload multipart) → 413 propre au lieu du 500 fourre-tout.
     * Déclenché par la limite {@code spring.servlet.multipart.max-file-size} avant même le contrôleur
     * (c'était la cause du 500 « Couldn't upload the avatar » pour toute image > 1 Mo).
     */
    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<ErrorResponse> handleMaxUploadSize(
            MaxUploadSizeExceededException ex,
            HttpServletRequest request) {

        ErrorResponse error = ErrorResponse.of(
                HttpStatus.PAYLOAD_TOO_LARGE.value(),
                "Payload Too Large",
                "Fichier trop volumineux.",
                request.getRequestURI()
        );

        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE).body(error);
    }

    /**
     * Échec d'un appel au fournisseur d'identité (Keycloak) via son client JAX-RS — le seul client
     * {@code jakarta.ws.rs} de l'app (API d'administration : comptes, mots de passe, profils). Sans ce
     * handler, cela remontait en <b>500 « erreur inattendue »</b> ; on renvoie un <b>502</b> clair.
     */
    @ExceptionHandler(WebApplicationException.class)
    public ResponseEntity<ErrorResponse> handleIdentityProviderError(
            WebApplicationException ex,
            HttpServletRequest request) {

        log.error("Échec d'un appel au fournisseur d'identité (Keycloak) sur {} : {}",
                LogSafe.of(request.getRequestURI()), LogSafe.of(ex.getMessage()));

        ErrorResponse error = ErrorResponse.of(
                HttpStatus.BAD_GATEWAY.value(),
                "Bad Gateway",
                "The identity service is unavailable. Please try again later.",
                request.getRequestURI()
        );

        return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(error);
    }

    /**
     * Gère toutes les autres exceptions non capturées (500)
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleGlobalException(
            Exception ex,
            HttpServletRequest request) {

        log.error("Unexpected error", ex);

        ErrorResponse error = ErrorResponse.of(
                HttpStatus.INTERNAL_SERVER_ERROR.value(),
                "Internal Server Error",
                "An unexpected error occurred. Please try again later.",
                request.getRequestURI()
        );

        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
    }
}

