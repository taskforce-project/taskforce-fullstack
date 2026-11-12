package com.taskforce.tf_api.core.service.rules;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.service.AiMeter;
import com.taskforce.tf_api.core.service.LlmClient;
import com.taskforce.tf_api.shared.exception.BusinessException;

/** Les mots de la personne, traduits par le modèle (R94) : ce qu'il rend de mal formé tombe avant toute vérification. */
@ExtendWith(MockitoExtension.class)
@DisplayName("Traduction d'une règle et d'une action par le modèle de l'espace")
class RuleDraftServiceTest {

    @Mock private LlmClient llm;
    @Mock private AiMeter aiMeter;

    private RuleDraftService drafts;

    @BeforeEach
    void setUp() throws Exception {
        drafts = new RuleDraftService(llm, aiMeter, new ObjectMapper());
        org.mockito.Mockito.lenient().when(aiMeter.metered(any(), any())).thenAnswer(inv ->
            ((AiMeter.AiCall<?>) inv.getArgument(1)).call());
        org.mockito.Mockito.lenient().when(llm.isConfigured()).thenReturn(true);
    }

    private static final List<RuleDraftService.Member> MEMBERS =
        List.of(new RuleDraftService.Member(42L, "Marie Martin", "Finance lead", "MEMBER"));

    @Test
    @DisplayName("la règle du CEO : les règles, les cas, et rien de ce qui n'est pas du contrat")
    void translatesTheCeoRule() {
        when(llm.chatCompletion(anyString(), anyString(), eq(true), eq("standard"))).thenReturn("""
            {"rules":[{"when":{"action":"file.write","path":"**/accounting/**"},"effect":"ask",
              "require":{"approvers":["person:42"]},"id":"injected","owner":"someone"}],
             "cases":[{"text":"Claude Code changes src/accounting/ledger.ts",
                       "facts":{"action":"file.write","path":"src/accounting/ledger.ts","secret":"true"},
                       "expect":"ask","approvers":["person:42"]},
                      {"text":"Not a case","facts":{"action":"payment"},"expect":"ask"},
                      {"facts":{"action":"file.write","path":"src/billing/a.ts"},"expect":"maybe"}],
             "approverNeeded":null,"unclear":"null"}""");

        RuleDraftService.Translation t = drafts.translate(1L, RulesServiceTest.CEO_RULE, "the whole workspace", MEMBERS,
            List.of("notion"));

        assertThat(t.rules()).singleElement().satisfies(r -> {
            assertThat(r).containsOnlyKeys("when", "effect", "require");
            assertThat(r.get("effect")).isEqualTo("ask");
        });
        assertThat(t.cases()).singleElement().satisfies(c -> {
            assertThat(c.facts()).containsOnlyKeys("action", "path", "actor").containsEntry("actor", "agent");
            assertThat(c.expect()).isEqualTo(new RuleCases.Expect("ask", List.of("person:42")));
            assertThat(c.source()).isEqualTo(RuleCases.BY_MODEL);
        });
        assertThat(t.approverNeeded()).isNull();
        assertThat(t.unclear()).isNull();
    }

    @Test
    @DisplayName("la consigne porte les personnes de l'espace, leurs métiers, et les outils branchés")
    void thePromptKnowsThePeopleAndTools() {
        ArgumentCaptor<String> system = ArgumentCaptor.forClass(String.class);
        when(llm.chatCompletion(system.capture(), anyString(), anyBoolean(), anyString()))
            .thenReturn("{\"rules\":[],\"cases\":[],\"approverNeeded\":\"the finance lead\",\"unclear\":null}");

        RuleDraftService.Translation t = drafts.translate(1L, "x", "the project \"Accounting\" only", MEMBERS, List.of("notion"));

        assertThat(system.getValue()).contains("42: Marie Martin, Finance lead (member)").contains("notion")
            .contains("the project \"Accounting\" only").contains("Never allow anything");
        assertThat(t.approverNeeded()).isEqualTo("the finance lead");
    }

    @Test
    @DisplayName("une action décrite : ses faits connus, un agent par défaut ; une action hors du contrat n'en a pas")
    void readsAnAction() {
        when(llm.chatCompletion(anyString(), eq("Action: Claude Code changes the ledger"), eq(true), anyString()))
            .thenReturn("{\"facts\":{\"action\":\"file.write\",\"path\":\"src/accounting/ledger.ts\",\"branch\":\"x\"}}");
        when(llm.chatCompletion(anyString(), eq("Action: Send an email"), eq(true), anyString()))
            .thenReturn("{\"facts\":null,\"unclear\":\"TaskForce doesn't send emails.\"}");

        RuleDraftService.Reading read = drafts.read(1L, "Claude Code changes the ledger", List.of());
        RuleDraftService.Reading none = drafts.read(1L, "Send an email", List.of());

        assertThat(read.facts()).isEqualTo(Map.of("action", "file.write", "path", "src/accounting/ledger.ts", "actor", "agent"));
        assertThat(none.facts()).isNull();
        assertThat(none.unclear()).isEqualTo("TaskForce doesn't send emails.");
    }

    @Test
    @DisplayName("un argument chiffré d'un outil de l'entreprise est un fait ; ailleurs, non")
    void thresholdFacts() {
        when(llm.chatCompletion(anyString(), anyString(), eq(true), anyString()))
            .thenReturn("{\"facts\":{\"action\":\"mcp.write\",\"server\":\"stripe\",\"arg.amount\":1500,\"actor\":\"person\"}}");

        assertThat(drafts.read(1L, "Refund 1,500 in Stripe", List.of("stripe")).facts())
            .containsEntry("arg.amount", "1500").containsEntry("actor", "person");
    }

    @Test
    @DisplayName("sans modèle, ou quand il répond mal : la personne apprend quoi faire")
    void whenTheModelFails() throws Exception {
        when(llm.isConfigured()).thenReturn(false);
        assertThatThrownBy(() -> drafts.translate(1L, "x", "w", List.of(), List.of()))
            .isInstanceOf(BusinessException.class).hasMessageContaining("Settings > AI");

        when(llm.isConfigured()).thenReturn(true);
        when(llm.chatCompletion(anyString(), anyString(), eq(true), anyString())).thenReturn("not json");
        assertThatThrownBy(() -> drafts.translate(1L, "x", "w", List.of(), List.of()))
            .isInstanceOf(BusinessException.class).hasMessageContaining("another way");

        when(llm.chatCompletion(anyString(), anyString(), eq(true), anyString())).thenReturn("[1,2]");
        assertThatThrownBy(() -> drafts.read(1L, "x", List.of())).isInstanceOf(BusinessException.class);

        org.mockito.Mockito.doThrow(new IllegalStateException("down")).when(aiMeter).metered(any(), any());
        assertThatThrownBy(() -> drafts.read(1L, "x", List.of()))
            .isInstanceOf(BusinessException.class).hasMessageContaining("didn't answer");
        assertThat(drafts.available()).isTrue();
    }
}
