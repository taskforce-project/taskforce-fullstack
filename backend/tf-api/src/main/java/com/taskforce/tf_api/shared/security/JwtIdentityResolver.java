package com.taskforce.tf_api.shared.security;

import java.util.Arrays;
import java.util.List;

import org.springframework.core.env.Environment;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

@Component
@RequiredArgsConstructor
public class JwtIdentityResolver {

    private final Environment environment;

    public String resolveEmail(Jwt jwt) {
        if (isDevProfile()) {
            return firstNonBlank(jwt.getClaimAsString("preferred_username"), jwt.getClaimAsString("email"), jwt.getSubject());
        }

        String email = jwt.getClaimAsString("email");
        if (email == null || email.isBlank()) {
            throw new IllegalStateException("JWT email claim missing");
        }
        return email;
    }

    private boolean isDevProfile() {
        return Arrays.stream(environment.getActiveProfiles()).anyMatch("dev"::equalsIgnoreCase);
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        throw new IllegalStateException("JWT principal claims missing");
    }
}