package com.taskforce.tf_api.util;
import com.taskforce.tf_api.core.dto.request.*;
import com.taskforce.tf_api.core.enums.*;
import com.taskforce.tf_api.core.model.*;
import org.keycloak.representations.idm.UserRepresentation;
import java.time.LocalDateTime;
import java.util.UUID;
public class TestDataBuilder {
    public static User buildUser() {
        return User.builder().id(1L).keycloakId(UUID.randomUUID().toString()).email("test@example.com").planType(PlanType.FREE).planStatus(PlanStatus.ACTIVE).isActive(true).build();
    }
    public static User buildUser(String email, PlanType planType) {
        return User.builder().id(1L).keycloakId(UUID.randomUUID().toString()).email(email).planType(planType).planStatus(PlanStatus.ACTIVE).isActive(true).build();
    }
    public static OtpVerification buildOtp() {
        return OtpVerification.builder().keycloakId(UUID.randomUUID().toString()).email("test@example.com").otpCode("123456").otpType(OtpType.EMAIL_VERIFICATION).otpStatus(OtpStatus.PENDING).attempts(0).maxAttempts(5).expiresAt(LocalDateTime.now().plusMinutes(15)).planType(PlanType.FREE.toString()).build();
    }
    public static OtpVerification buildOtp(String email, String code, OtpType type) {
        return OtpVerification.builder().keycloakId(UUID.randomUUID().toString()).email(email).otpCode(code).otpType(type).otpStatus(OtpStatus.PENDING).attempts(0).maxAttempts(5).expiresAt(LocalDateTime.now().plusMinutes(15)).planType(PlanType.FREE.toString()).build();
    }
    public static OtpVerification buildExpiredOtp() {
        return OtpVerification.builder().keycloakId(UUID.randomUUID().toString()).email("test@example.com").otpCode("123456").otpType(OtpType.EMAIL_VERIFICATION).otpStatus(OtpStatus.PENDING).attempts(0).maxAttempts(5).expiresAt(LocalDateTime.now().minusMinutes(1)).planType(PlanType.FREE.toString()).build();
    }
    public static RefreshToken buildRefreshToken(User user) {
        return RefreshToken.builder().userId(user.getId()).token(UUID.randomUUID().toString()).expiresAt(LocalDateTime.now().plusDays(30)).build();
    }
    public static UserRepresentation buildKeycloakUser() {
        UserRepresentation user = new UserRepresentation(); user.setId(UUID.randomUUID().toString()); user.setEmail("test@example.com"); user.setFirstName("Test"); user.setLastName("User"); user.setEmailVerified(false); user.setEnabled(true); return user;
    }
    public static UserRepresentation buildKeycloakUser(String email, String firstName, String lastName, boolean emailVerified) {
        UserRepresentation user = new UserRepresentation(); user.setId(UUID.randomUUID().toString()); user.setEmail(email); user.setFirstName(firstName); user.setLastName(lastName); user.setEmailVerified(emailVerified); user.setEnabled(true); return user;
    }
    public static RegisterRequest buildRegisterRequest() {
        return RegisterRequest.builder().email("test@example.com").password("Password123!").firstName("Test").lastName("User").planType(PlanType.FREE).build();
    }
    public static RegisterRequest buildRegisterRequest(String email, PlanType planType) {
        return RegisterRequest.builder().email(email).password("Password123!").firstName("Test").lastName("User").planType(planType).build();
    }
    public static LoginRequest buildLoginRequest() {
        return LoginRequest.builder().email("test@example.com").password("Password123!").build();
    }
    public static LoginRequest buildLoginRequest(String email, String password) {
        return LoginRequest.builder().email(email).password(password).build();
    }
    public static VerifyOtpRequest buildVerifyOtpRequest() {
        return VerifyOtpRequest.builder().email("test@example.com").otpCode("123456").build();
    }
    public static VerifyOtpRequest buildVerifyOtpRequest(String email, String code) {
        return VerifyOtpRequest.builder().email(email).otpCode(code).build();
    }
    public static SelectPlanRequest buildSelectPlanRequest() {
        return SelectPlanRequest.builder().email("test@example.com").planType("PREMIUM").build();
    }
    public static SelectPlanRequest buildSelectPlanRequest(String email, String planType) {
        return SelectPlanRequest.builder().email(email).planType(planType).build();
    }
}
