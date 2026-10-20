package com.taskforce.tf_api.shared.exception;

import java.util.List;
import java.util.stream.Stream;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.mock.http.MockHttpInputMessage;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.validation.BindingResult;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;

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
            new ResourceNotFoundException("Workspace not found"), req());
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(r.getBody()).isNotNull();
        assertThat(r.getBody().getMessage()).contains("not found");
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
            new ForbiddenException("Access denied"), req());
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
    @DisplayName("méthode non prise en charge → 405 avec l'en-tête Allow")
    void method_not_allowed_405() {
        ResponseEntity<ErrorResponse> r = handler.handleMethodNotSupported(
            new HttpRequestMethodNotSupportedException("GET", List.of("POST")), req());
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.METHOD_NOT_ALLOWED);
        assertThat(r.getHeaders().getAllow()).containsExactly(org.springframework.http.HttpMethod.POST);
        assertThat(r.getBody().getMessage()).contains("not allowed");
    }

    @Test
    @DisplayName("corps absent ou illisible → 400, sans le détail de l'analyseur")
    void unreadable_body_400() {
        ResponseEntity<ErrorResponse> r = handler.handleUnreadableBody(
            new HttpMessageNotReadableException("JSON parse error: Unexpected end-of-input", new MockHttpInputMessage(new byte[0])),
            req());
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(r.getBody().getMessage()).isEqualTo("The request body is missing or malformed.");
        assertThat(r.getBody().getPath()).isEqualTo("/api/test");
    }

    @Test
    @DisplayName("type de contenu que la route ne lit pas → 415 avec l'en-tête Accept")
    void unsupported_media_type_415() {
        ResponseEntity<ErrorResponse> r = handler.handleUnsupportedMediaType(
            new HttpMediaTypeNotSupportedException(MediaType.APPLICATION_FORM_URLENCODED, List.of(MediaType.APPLICATION_JSON),
                HttpMethod.POST),
            req());
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.UNSUPPORTED_MEDIA_TYPE);
        assertThat(r.getHeaders().getAccept()).containsExactly(MediaType.APPLICATION_JSON);
        assertThat(r.getBody().getMessage()).contains("not supported");
    }

    /** Méthode de contrôleur factice : fournit le {@link MethodParameter} que demandent les exceptions de liaison. */
    @SuppressWarnings("unused")
    private static void sampleHandler(String value) {
        // jamais appelée
    }

    private static MethodParameter sampleParameter() throws NoSuchMethodException {
        return new MethodParameter(GlobalExceptionHandlerTest.class.getDeclaredMethod("sampleHandler", String.class), 0);
    }

    static Stream<Arguments> missingValues() throws NoSuchMethodException {
        return Stream.of(
            Arguments.of(new MissingServletRequestParameterException("q", "String"),
                "The request parameter 'q' is required."),
            Arguments.of(new MissingRequestHeaderException("Authorization", sampleParameter()),
                "The request header 'Authorization' is required."),
            Arguments.of(new MissingServletRequestPartException("file"),
                "The request part 'file' is required."));
    }

    @ParameterizedTest(name = "{1}")
    @MethodSource("missingValues")
    @DisplayName("paramètre, en-tête ou fichier obligatoire absent → 400 qui nomme ce qui manque")
    void missing_value_400(Exception ex, String message) {
        ResponseEntity<ErrorResponse> r = handler.handleMissingRequestValue(ex, req());
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(r.getBody().getMessage()).isEqualTo(message);
        assertThat(r.getBody().getPath()).isEqualTo("/api/test");
    }

    @Test
    @DisplayName("paramètre mal typé → 400 qui nomme le paramètre, sans renvoyer la valeur reçue")
    void type_mismatch_400() throws NoSuchMethodException {
        ResponseEntity<ErrorResponse> r = handler.handleArgumentTypeMismatch(
            new MethodArgumentTypeMismatchException("abc<b>", Long.class, "id", sampleParameter(),
                new NumberFormatException("For input string: \"abc<b>\"")),
            req());
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(r.getBody().getMessage()).isEqualTo("The parameter 'id' has an invalid value.");
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
