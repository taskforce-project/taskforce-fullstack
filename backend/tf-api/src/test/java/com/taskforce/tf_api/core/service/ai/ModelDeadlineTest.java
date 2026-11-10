package com.taskforce.tf_api.core.service.ai;

import java.time.Duration;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** {@link ModelDeadline} : le budget d'un cas vaut pour tous ses appels au modèle, et rien ne déborde de l'action. */
@DisplayName("ModelDeadline")
class ModelDeadlineTest {

    @Test
    @DisplayName("hors d'une action, rien ; dedans, ce qu'il reste du budget")
    void theBudgetOfAnAction() {
        assertThat(ModelDeadline.remaining()).isEmpty();

        Duration left = ModelDeadline.within(Duration.ofMinutes(5), () -> ModelDeadline.remaining().orElseThrow());

        assertThat(left).isPositive().isLessThanOrEqualTo(Duration.ofMinutes(5));
        assertThat(ModelDeadline.remaining()).isEmpty();
    }

    @Test
    @DisplayName("un budget épuisé se lit zéro ou moins")
    void aSpentBudget() {
        assertThat(ModelDeadline.within(Duration.ZERO, () -> ModelDeadline.remaining().orElseThrow().isPositive())).isFalse();
    }

    @Test
    @DisplayName("une action imbriquée rend le budget de la précédente, même quand elle échoue")
    void nestedActionsRestoreTheBudget() {
        ModelDeadline.within(Duration.ofMinutes(5), () -> {
            assertThatThrownBy(() -> ModelDeadline.within(Duration.ofSeconds(1), () -> {
                throw new IllegalStateException("late");
            })).isInstanceOf(IllegalStateException.class);
            assertThat(ModelDeadline.remaining().orElseThrow()).isGreaterThan(Duration.ofMinutes(4));
            return null;
        });
    }
}
