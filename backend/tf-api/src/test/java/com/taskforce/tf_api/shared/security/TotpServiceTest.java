package com.taskforce.tf_api.shared.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class TotpServiceTest {

    private final TotpService totp = new TotpService();

    @Test
    void generateSecret_isBase32AndLongEnough() {
        String s = totp.generateSecret();
        assertThat(s).isNotBlank().matches("[A-Z2-7]+");
        assertThat(s.length()).isGreaterThanOrEqualTo(32); // 20 octets → 32 caractères Base32
    }

    @Test
    void verify_acceptsFreshlyGeneratedCode() {
        String secret = totp.generateSecret();
        String code = totp.generate(secret, totp.currentStep());
        assertThat(totp.verify(secret, code)).isTrue();
    }

    @Test
    void verify_toleratesOneWindowSkew() {
        String secret = totp.generateSecret();
        long step = totp.currentStep();
        assertThat(totp.verify(secret, totp.generate(secret, step - 1))).isTrue();
        assertThat(totp.verify(secret, totp.generate(secret, step + 1))).isTrue();
    }

    @Test
    void verify_rejectsCodeOutsideWindow() {
        String secret = totp.generateSecret();
        long step = totp.currentStep();
        // 3 fenêtres en dehors de la tolérance (±1) → doit être rejeté.
        assertThat(totp.verify(secret, totp.generate(secret, step + 5))).isFalse();
    }

    @Test
    void verify_rejectsWrongCode() {
        String secret = totp.generateSecret();
        long step = totp.currentStep();
        String c0 = totp.generate(secret, step - 1);
        String c1 = totp.generate(secret, step);
        String c2 = totp.generate(secret, step + 1);
        String bad = Stream.of("000000", "111111", "222222", "333333")
            .filter(x -> !x.equals(c0) && !x.equals(c1) && !x.equals(c2))
            .findFirst().orElseThrow();
        assertThat(totp.verify(secret, bad)).isFalse();
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "12345", "1234567", "abcdef", "12 456"})
    void verify_rejectsMalformed(String code) {
        assertThat(totp.verify(totp.generateSecret(), code)).isFalse();
    }

    @Test
    void generate_isStableForSameStep() {
        String secret = totp.generateSecret();
        long step = totp.currentStep();
        assertThat(totp.generate(secret, step)).isEqualTo(totp.generate(secret, step));
    }

    @Test
    void buildUri_isOtpauthTotpWithSecretAndIssuer() {
        String uri = totp.buildUri("ABC234", "user@example.com", "TaskForce");
        assertThat(uri)
            .startsWith("otpauth://totp/TaskForce:")
            .contains("secret=ABC234")
            .contains("issuer=TaskForce")
            .contains("digits=6")
            .contains("period=30");
    }
}
