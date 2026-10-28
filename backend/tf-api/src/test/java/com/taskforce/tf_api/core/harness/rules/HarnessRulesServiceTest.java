package com.taskforce.tf_api.core.harness.rules;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.model.HarnessRuleSet;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.HarnessRuleSetRepository;

@ExtendWith(MockitoExtension.class)
@DisplayName("Règles du harnais remises au runner")
class HarnessRulesServiceTest {

    @Mock private HarnessRuleSetRepository repository;

    private HarnessRulesService service;
    private Workspace workspace;

    @BeforeEach
    void setUp() {
        service = new HarnessRulesService(repository);
        workspace = Workspace.builder().id(9L).slug("acme").owner(User.builder().id(7L).email("pierre@acme.dev").build()).build();
    }

    @Test
    @DisplayName("sans règles écrites : la table par défaut, dont la personne propriétaire de l'espace répond")
    void defaultsOwnedByTheWorkspaceOwner() {
        when(repository.findFirstByWorkspaceIdOrderByVersionDesc(9L)).thenReturn(Optional.empty());

        RulesBundle bundle = service.bundleFor(workspace);

        assertThat(bundle.format()).isEqualTo(RulesBundle.FORMAT);
        assertThat(bundle.workspace()).isEqualTo("acme");
        assertThat(bundle.version()).isEqualTo(1);
        assertThat(bundle.rules()).isNotEmpty().allSatisfy(r -> assertThat(r.owner()).isEqualTo("pierre@acme.dev"));
        assertThat(bundle.rules()).extracting(RulesBundle.Rule::id).contains("pay", "no-harness-change");
    }

    @Test
    @DisplayName("l'empreinte remise est celle que le runner recalcule, et elle ne bouge pas d'un appel à l'autre")
    void digestIsTheOneTheRunnerRecomputes() {
        when(repository.findFirstByWorkspaceIdOrderByVersionDesc(9L)).thenReturn(Optional.empty());

        RulesBundle bundle = service.bundleFor(workspace);

        assertThat(bundle.digest()).isEqualTo(RulesDigest.of(new ObjectMapper().valueToTree(bundle)));
        assertThat(service.bundleFor(workspace).digest()).isEqualTo(bundle.digest());
    }

    @Test
    @DisplayName("avec des règles écrites : la dernière version de l'espace, telle quelle")
    void latestVersionWins() {
        Map<String, Object> rule = Map.of(
            "id", "pay-small", "when", Map.of("action", "payment"), "class", "irreversible", "effect", "deny",
            "owner", "pierre@acme.dev", "reason", "Pas de paiement par un agent.", "review", "2027-03-01");
        when(repository.findFirstByWorkspaceIdOrderByVersionDesc(9L))
            .thenReturn(Optional.of(HarnessRuleSet.builder().version(4).rules(List.of(rule)).build()));

        RulesBundle bundle = service.bundleFor(workspace);

        assertThat(bundle.version()).isEqualTo(4);
        assertThat(bundle.rules()).singleElement().satisfies(r -> {
            assertThat(r.id()).isEqualTo("pay-small");
            assertThat(r.effect()).isEqualTo("deny");
            assertThat(r.actionClass()).isEqualTo("irreversible");
        });
        assertThat(RulesEngine.decide(bundle, Map.of("action", "payment")).effect()).isEqualTo("deny");
    }
}
