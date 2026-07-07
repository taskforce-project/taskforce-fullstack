package com.taskforce.tf_api.shared.exception;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.validation.BindingResult;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;

import com.taskforce.tf_api.shared.dto.ErrorResponse;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Tests unitaires — {@link GlobalExceptionHandler} : mapping exception → statut HTTP + corps standardisé.
 * Garantit le contrat d'erreur de l'API (404/400/403/409/500) consommé par le front (enveloppe ErrorResponse).
 */
@DisplayName("GlobalExceptionHandler")
class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    private MockHttpServletRequest req() {
        MockHttpServletRequest r = new MockHttpServletRequest();
        r.setRequestURI("/api/test");
        return r;
    }

    @Test
    @DisplayName("ResourceNotFoundException → 404 Not Found")
    void not_found_404() {
        ResponseEntity<ErrorResponse> r = handler.handleResourceNotFoundException(
            new ResourceNotFoundException("Workspace introuvable"), req());
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(r.getBody()).isNotNull();
        assertThat(r.getBody().getMessage()).contains("introuvable");
        assertThat(r.getBody().getPath()).isEqualTo("/api/test");
    }

    @Test
    @DisplayName("BusinessException → 400 Bad Request + errorCode métier")
    void business_400() {
        ResponseEntity<ErrorResponse> r = handler.handleBusinessException(
            new BusinessException("PLAN_LIMIT", "Limite du plan atteinte"), req());
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(r.getBody().getMessage()).contains("Limite du plan");
    }

    @Test
    @DisplayName("MethodArgumentNotValidException → 400 + erreurs de champ agrégées")
    void validation_400() {
        MethodArgumentNotValidException ex = mock(MethodArgumentNotValidException.class);
        BindingResult br = mock(BindingResult.class);
        when(ex.getBindingResult()).thenReturn(br);
        when(br.getAllErrors()).thenReturn(List.of(
            new FieldError("dto", "email", "doit être valide"),
            new FieldError("dto", "email", "obligatoire")));

        ResponseEntity<ErrorResponse> r = handler.handleValidationException(ex, req());
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(r.getBody()).isNotNull();
    }

    @Test
    @DisplayName("ForbiddenException → 403 Forbidden")
    void forbidden_403() {
        ResponseEntity<ErrorResponse> r = handler.handleForbiddenException(
            new ForbiddenException("Accès refusé"), req());
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    @DisplayName("AccessDeniedException (Spring Security) → 403 Forbidden")
    void access_denied_403() {
        ResponseEntity<ErrorResponse> r = handler.handleAccessDeniedException(
            new AccessDeniedException("denied"), req());
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    @DisplayName("IllegalStateException → 409 Conflict")
    void illegal_state_409() {
        ResponseEntity<ErrorResponse> r = handler.handleIllegalState(
            new IllegalStateException("état invalide"), req());
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
    }

    @Test
    @DisplayName("IllegalArgumentException → 400 Bad Request")
    void illegal_argument_400() {
        ResponseEntity<ErrorResponse> r = handler.handleIllegalArgument(
            new IllegalArgumentException("argument invalide"), req());
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    @DisplayName("Exception non gérée → 500 Internal Server Error (jamais de fuite de stacktrace)")
    void global_500() {
        ResponseEntity<ErrorResponse> r = handler.handleGlobalException(
            new RuntimeException("boom"), req());
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        assertThat(r.getBody()).isNotNull();
    }
}
