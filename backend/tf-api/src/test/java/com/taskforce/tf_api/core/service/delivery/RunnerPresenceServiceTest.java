package com.taskforce.tf_api.core.service.delivery;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

@DisplayName("RunnerPresenceService")
class RunnerPresenceServiceTest {

    /** Une horloge qu'on avance à la main. */
    private static final class Hand extends Clock {
        private Instant now = Instant.parse("2026-10-29T10:45:00Z");

        void advance(Duration by) { now = now.plus(by); }

        @Override public Instant instant() { return now; }
        @Override public ZoneOffset getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(java.time.ZoneId zone) { return this; }
    }

    private final Hand clock = new Hand();
    private final RunnerPresenceService presence = new RunnerPresenceService(clock);

    @Test
    @DisplayName("sans nouvelles d'un runner : aucun problème")
    void nothing_reported() {
        assertThat(presence.problem(7L)).isEmpty();
    }

    @Test
    @DisplayName("le problème signalé vaut deux minutes, puis ne compte plus (runner arrêté ou réparé)")
    void problem_is_fresh_for_two_minutes() {
        presence.report(7L, "tf-runner-pierre", "claude-signed-out");
        clock.advance(Duration.ofSeconds(110));
        assertThat(presence.problem(7L)).contains("claude-signed-out");

        clock.advance(Duration.ofSeconds(20));
        assertThat(presence.problem(7L)).isEmpty();
    }

    @Test
    @DisplayName("avec deux runners, un seul prêt suffit")
    void one_ready_runner_is_enough() {
        presence.report(7L, "tf-runner-desk", "claude-signed-out");
        presence.report(7L, "tf-runner-laptop", null);
        assertThat(presence.problem(7L)).isEmpty();

        presence.report(7L, "tf-runner-laptop", "claude-outdated");
        assertThat(presence.problem(7L)).isPresent();
        assertThat(presence.problem(8L)).isEmpty();
    }
}
