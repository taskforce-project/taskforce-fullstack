package com.taskforce.tf_api.core.service.agent;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.dto.response.ChartSpecResponse;
import com.taskforce.tf_api.core.service.LlmClient;
import com.taskforce.tf_api.core.service.brain.BrainAccessGuard;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

/**
 * Tests unitaires — {@link ChartSpecService}.
 *
 * <p>Deux garanties à tenir : (1) sans LLM, le repli par mots-clés produit un graphe utile ;
 * (2) avec LLM, la sortie est <b>validée contre le catalogue</b> — jamais de dataset ou de série
 * inventés ne doit franchir la validation.
 */
@ExtendWith(MockitoExtension.class)
class ChartSpecServiceTest {

    @Mock  private BrainAccessGuard access;
    @Mock  private LlmClient        llm;
    @InjectMocks private ChartSpecService service;

    // Le service a besoin d'un vrai ObjectMapper (parsing JSON) — @Spy le rend injectable par @InjectMocks.
    @Spy private ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        // resolveAndAuthorize est appelé pour l'autorisation ; sa valeur de retour est ignorée ici.
        lenient().when(access.resolveAndAuthorize(anyString(), any())).thenReturn(null);
    }

    // ── Repli déterministe (LLM absent) ──────────────────────────────────────

    @ParameterizedTest(name = "« {0} » → dataset {1}")
    @CsvSource({
        "burndown du sprint,           burndown",
        "reste à faire cette semaine,  burndown",
        "charge par membre,            capacity",
        "qui est surchargé,            capacity",
        "débit quotidien sur 30 jours, throughput",
        "tâches résolues par semaine,  throughput",
    })
    @DisplayName("sans LLM, la demande est mappée au bon dataset par mots-clés")
    void heuristicMapsPromptToDataset(String prompt, String expectedDataset) {
        when(llm.isConfigured()).thenReturn(false);

        ChartSpecResponse spec = service.generate("demo", 1L, prompt, null);

        assertThat(spec.unsupported()).isNull();
        assertThat(spec.dataset()).isEqualTo(expectedDataset);
        assertThat(spec.series()).allMatch(s -> !s.isBlank());
    }

    @Test
    @DisplayName("sans LLM, une charge « par jour » bascule sur la heatmap workload")
    void heuristicPicksWorkloadForDailyLoad() {
        when(llm.isConfigured()).thenReturn(false);

        ChartSpecResponse spec = service.generate("demo", 1L, "charge de l'équipe jour par jour", null);

        assertThat(spec.dataset()).isEqualTo("workload");
        assertThat(spec.chartType()).isEqualTo("heatmap");
    }

    // ── Validation de la sortie LLM contre le catalogue ──────────────────────

    private void llmReturns(String json) {
        when(llm.isConfigured()).thenReturn(true);
        when(llm.chatCompletion(anyString(), anyString(), anyString(), anyBoolean(), anyString())).thenReturn(json);
    }

    @Test
    @DisplayName("une spec LLM valide est conservée")
    void validLlmSpecIsKept() {
        llmReturns("""
            {"title":"Résolues vs ouvertes","description":"par semaine","dataset":"throughput",
             "chartType":"area","bucket":"week","series":["resolved","opened"]}
            """);

        ChartSpecResponse spec = service.generate("demo", 1L, "résolues vs ouvertes", null);

        assertThat(spec.dataset()).isEqualTo("throughput");
        assertThat(spec.chartType()).isEqualTo("area");
        assertThat(spec.bucket()).isEqualTo("week");
        assertThat(spec.series()).containsExactly("resolved", "opened");
    }

    @Test
    @DisplayName("une série inventée est écartée, les séries valides sont gardées")
    void invalidSeriesAreDropped() {
        llmReturns("""
            {"title":"X","dataset":"capacity","chartType":"bar","series":["openIssues","revenue","xyz"]}
            """);

        ChartSpecResponse spec = service.generate("demo", 1L, "charge", null);

        assertThat(spec.dataset()).isEqualTo("capacity");
        assertThat(spec.series()).containsExactly("openIssues");  // revenue/xyz écartés
    }

    @Test
    @DisplayName("un dataset hors catalogue déclenche le repli heuristique (pas de faux graphe)")
    void unknownDatasetFallsBackToHeuristic() {
        llmReturns("""
            {"title":"Revenus","dataset":"revenue","chartType":"bar","series":["amount"]}
            """);

        // Le prompt parle de burndown → l'heuristique doit rattraper avec un dataset réel.
        ChartSpecResponse spec = service.generate("demo", 1L, "montre le burndown", null);

        assertThat(spec.dataset()).isEqualTo("burndown");
        assertThat(spec.series()).containsExactly("remaining", "ideal");
    }

    @Test
    @DisplayName("un type de graphe invalide retombe sur le défaut du dataset")
    void invalidChartTypeUsesDatasetDefault() {
        llmReturns("""
            {"title":"X","dataset":"burndown","chartType":"pie","series":["remaining"]}
            """);

        ChartSpecResponse spec = service.generate("demo", 1L, "burndown", null);

        assertThat(spec.chartType()).isEqualTo("line");  // défaut de burndown
    }

    @Test
    @DisplayName("une demande hors périmètre est marquée unsupported, sans données inventées")
    void unsupportedRequestIsSurfaced() {
        llmReturns("{\"unsupported\":\"Les revenus ne sont pas disponibles dans Taskforce.\"}");

        ChartSpecResponse spec = service.generate("demo", 1L, "revenus mensuels", null);

        assertThat(spec.unsupported()).contains("revenus");
        assertThat(spec.dataset()).isNull();
        assertThat(spec.series()).isEmpty();
    }

    @Test
    @DisplayName("si le LLM renvoie du charabia, on retombe proprement sur l'heuristique")
    void malformedLlmOutputFallsBack() {
        llmReturns("ceci n'est pas du JSON");

        ChartSpecResponse spec = service.generate("demo", 1L, "charge par membre", null);

        assertThat(spec.dataset()).isEqualTo("capacity");
    }
}
