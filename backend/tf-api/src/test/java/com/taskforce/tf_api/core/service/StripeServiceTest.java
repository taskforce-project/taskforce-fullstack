package com.taskforce.tf_api.core.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Tests unitaires pour StripeService
 * 
 * Note: Ces tests valident principalement la logique métier (getPriceIdForPlan).
 * Les tests des appels Stripe API nécessiteraient MockedStatic ou...
 * 
 *  Pour tester les interactions Stripe complètes:
 * - Utiliser Stripe CLI: `stripe listen --forward-to localhost:8080/api/webhooks/stripe`
 * - Ou Stripe Mock Server pour tests d'intégration automatisés
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("StripeService Tests")
class StripeServiceTest {

    @InjectMocks
    private StripeService stripeService;

    @BeforeEach
    void setup() {
        ReflectionTestUtils.setField(stripeService, "stripeSecretKey", "sk_test_mock_key");
        ReflectionTestUtils.setField(stripeService, "proPriceId", "price_pro_mock");
        ReflectionTestUtils.setField(stripeService, "enterprisePriceId", "price_enterprise_mock");
    }

    @Nested
    @DisplayName("Get Price ID For Plan Tests")
    class GetPriceIdForPlanTests {

        @Test
        @DisplayName("devrait retourner price ID pour plan PRO")
        void getPriceIdForPlan_withPro_shouldReturnProPriceId() {
            // When
            String result = stripeService.getPriceIdForPlan("PRO");

            // Then
            assertThat(result).isEqualTo("price_pro_mock");
        }

        @Test
        @DisplayName("devrait retourner price ID pour plan ENTERPRISE")
        void getPriceIdForPlan_withEnterprise_shouldReturnEnterprisePriceId() {
            // When
            String result = stripeService.getPriceIdForPlan("ENTERPRISE");

            // Then
            assertThat(result).isEqualTo("price_enterprise_mock");
        }

        @Test
        @DisplayName("devrait lancer exception pour plan invalide")
        void getPriceIdForPlan_withInvalidPlan_shouldThrowException() {
            // When/Then
            assertThatThrownBy(() -> stripeService.getPriceIdForPlan("INVALID"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Type de plan invalide : INVALID");
        }

        @Test
        @DisplayName("devrait accepter plan en minuscules")
        void getPriceIdForPlan_withLowercase_shouldWork() {
            // When
            String result = stripeService.getPriceIdForPlan("pro");

            // Then
            assertThat(result).isEqualTo("price_pro_mock");
        }

        @Test
        @DisplayName("devrait accepter plan ENTERPRISE en minuscules")
        void getPriceIdForPlan_withEnterpriseLowercase_shouldWork() {
            // When
            String result = stripeService.getPriceIdForPlan("enterprise");

            // Then
            assertThat(result).isEqualTo("price_enterprise_mock");
        }
    }

    @Nested
    @DisplayName("Configuration Tests")
    class ConfigurationTests {

        @Test
        @DisplayName("devrait avoir les price IDs configurés")
        void shouldHaveConfiguredPriceIds() {
            // When
            String proPriceId = (String) ReflectionTestUtils.getField(stripeService, "proPriceId");
            String enterprisePriceId = (String) ReflectionTestUtils.getField(stripeService, "enterprisePriceId");

            // Then
            assertThat(proPriceId).isNotNull().isEqualTo("price_pro_mock");
            assertThat(enterprisePriceId).isNotNull().isEqualTo("price_enterprise_mock");
        }

        @Test
        @DisplayName("devrait avoir la clé API configurée")
        void shouldHaveConfiguredApiKey() {
            // When
            String apiKey = (String) ReflectionTestUtils.getField(stripeService, "stripeSecretKey");

            // Then
            assertThat(apiKey).isNotNull().isNotEmpty();
        }
    }

    /**
     * Note sur les tests Stripe API:
     * 
     * Pour tester createCustomer(), createCheckoutSession(), getSubscription(), etc.:
     * 
     * 1. Tests Manuels avec Stripe CLI:
     * ```bash
     * stripe listen --forward-to localhost:8080/api/webhooks/stripe
     * stripe trigger checkout.session.completed
     * ```
     * 
     * 2. Tests automatisés avec Mockito MockedStatic:
     * Nécessite de mocker les classes statiques Stripe (Customer.create(), etc.)
     * Exemple dans AuthServiceTest qui utilise MockedStatic pour Keycloak.
     * 
     * 3. Tests d'intégration avec Stripe Mock Server:
     * https://github.com/stripe/stripe-mock
     * Lance un serveur mock qui simule l'API Stripe complète.
     * 
     * La logique métier principale (getPriceIdForPlan) est couverte par ces tests.
     */
}

