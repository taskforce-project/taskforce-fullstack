package com.taskforce.tf_api.core.service.agent;

import java.util.List;

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
import org.springframework.test.util.ReflectionTestUtils;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.dto.response.ChartSpecResponse;
import com.taskforce.tf_api.core.dto.response.NamedValue;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.service.LlmClient;
import com.taskforce.tf_api.core.service.brain.BrainAccessGuard;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Tests unitaires — {@link ChartSpecService}, moteur à deux modes (série temporelle + répartition).
 *
 * <p>Garanties : (1) sans LLM, la demande est routée par mots-clés vers le bon mode ; (2) avec LLM,
 * la sortie est validée — une répartition passe par {@link AnalyticsQueryService} (données réelles),
 * une série temporelle référence un dataset connu, le hors-périmètre devient {@code unsupported}.
 */
@ExtendWith(MockitoExtension.class)
class ChartSpecServiceTest {

    @Mock  private BrainAccessGuard      access;
    @Mock  private LlmClient             llm;
    @Mock  private AnalyticsQueryService queryService;
    @InjectMocks private ChartSpecService service;

    @Spy private ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        Workspace ws = mock(Workspace.class);
        lenient().when(ws.getId()).thenReturn(1L);
        lenient().when(access.resolveAndAuthorize(anyString(), any())).thenReturn(ws);
        ReflectionTestUtils.setField(service, "model", "test-model");

        // Whitelist du moteur de requête (données réelles) — stubs génériques.
        lenient().when(queryService.isValidDimension(anyString())).thenReturn(true);
        lenient().when(queryService.dimensionLabel(anyString())).thenReturn("Projet");
        lenient().when(queryService.measureLabel(anyString())).thenReturn("Nombre d'issues");
        lenient().when(queryService.run(any(), anyString(), anyString(), anyString()))
            .thenReturn(List.of(new NamedValue("Web App", 12), new NamedValue("API", 7)));

        // Prédiction (score de succès sur données réelles) — stubs génériques.
        lenient().when(queryService.isValidPrediction(anyString())).thenReturn(true);
        lenient().when(queryService.predictionTitle(anyString())).thenReturn("Prédiction de succès par projet");
        lenient().when(queryService.predictionYLabel(anyString())).thenReturn("Score de succès (%)");
        lenient().when(queryService.predict(any(), anyString()))
            .thenReturn(List.of(new NamedValue("Infrastructure", 73), new NamedValue("Web App", 60)));
    }

    // ── Répartition (retrieval DB) ────────────────────────────────────────────

    @ParameterizedTest(name = "« {0} » → répartition (mode breakdown)")
    @CsvSource({
        "le nombre d'issues par projet",
        "répartition des issues par statut",
        "issues ouvertes par assigné",
        "combien d'issues par priorité",
    })
    @DisplayName("sans LLM, « par X » déclenche une répartition calculée en base")
    void heuristicRoutesBreakdown(String prompt) {
        when(llm.isConfigured()).thenReturn(false);

        ChartSpecResponse spec = service.generate("demo", 1L, prompt, null);

        assertThat(spec.mode()).isEqualTo("breakdown");
        assertThat(spec.data()).isNotEmpty();          // vraies données du moteur de requête
        assertThat(spec.dataset()).isNull();
        assertThat(spec.unsupported()).isNull();
    }

    @Test
    @DisplayName("une répartition LLM valide est exécutée et porte les données réelles")
    void llmBreakdownIsExecuted() {
        llmReturns("""
            {"title":"Issues par projet","dimension":"PROJECT","measure":"COUNT","scope":"ALL","chartType":"bar"}
            """);

        ChartSpecResponse spec = service.generate("demo", 1L, "issues par projet", null);

        assertThat(spec.mode()).isEqualTo("breakdown");
        assertThat(spec.chartType()).isEqualTo("bar");
        assertThat(spec.data()).extracting(NamedValue::label).contains("Web App", "API");
        assertThat(spec.yLabel()).isEqualTo("Nombre d'issues");
    }

    // ── Prédiction (projections sur données réelles, jamais inventées) ─────────

    @ParameterizedTest(name = "« {0} » → prédiction (mode breakdown, score de succès)")
    @CsvSource({
        "prédiction de succès des projets",
        "quels projets ont le plus de chances de réussir",
        "montre le risque par projet",
        "santé des projets",
    })
    @DisplayName("sans LLM, une demande de prédiction est routée vers le score de succès")
    void heuristicRoutesPrediction(String prompt) {
        when(llm.isConfigured()).thenReturn(false);

        ChartSpecResponse spec = service.generate("demo", 1L, prompt, null);

        assertThat(spec.mode()).isEqualTo("breakdown");
        assertThat(spec.yLabel()).isEqualTo("Score de succès (%)");
        assertThat(spec.data()).extracting(NamedValue::label).contains("Infrastructure");
        assertThat(spec.dimension()).isNull();   // instantané : la donnée voyage dans le spec
    }

    @Test
    @DisplayName("une prédiction demandée par le LLM (predict=SUCCESS) est calculée en base")
    void llmPredictionIsExecuted() {
        llmReturns("""
            {"title":"Chances de succès par projet","predict":"SUCCESS"}
            """);

        ChartSpecResponse spec = service.generate("demo", 1L, "predictions de succes des projets", null);

        assertThat(spec.mode()).isEqualTo("breakdown");
        assertThat(spec.yLabel()).isEqualTo("Score de succès (%)");
        assertThat(spec.data()).extracting(NamedValue::value).contains(73L);
    }

    // ── Séries temporelles ────────────────────────────────────────────────────

    @ParameterizedTest(name = "« {0} » → série temporelle {1}")
    @CsvSource({
        "burndown du sprint,           burndown",
        "débit quotidien sur 30 jours, throughput",
        "avancement des projets,       projects",
    })
    @DisplayName("sans LLM, les demandes temporelles restent en mode timeseries")
    void heuristicRoutesTimeseries(String prompt, String expectedDataset) {
        when(llm.isConfigured()).thenReturn(false);

        ChartSpecResponse spec = service.generate("demo", 1L, prompt, null);

        assertThat(spec.mode()).isEqualTo("timeseries");
        assertThat(spec.dataset()).isEqualTo(expectedDataset);
        assertThat(spec.data()).isNull();
    }

    @Test
    @DisplayName("une série temporelle LLM valide est conservée")
    void llmTimeseriesIsKept() {
        llmReturns("""
            {"title":"Débit","dataset":"throughput","chartType":"area","bucket":"week","series":["resolved","opened"]}
            """);

        ChartSpecResponse spec = service.generate("demo", 1L, "débit", null);

        assertThat(spec.mode()).isEqualTo("timeseries");
        assertThat(spec.dataset()).isEqualTo("throughput");
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
        assertThat(spec.series()).containsExactly("openIssues");
    }

    // ── Robustesse ────────────────────────────────────────────────────────────

    @Test
    @DisplayName("une demande hors périmètre est marquée unsupported, sans données inventées")
    void unsupportedRequestIsSurfaced() {
        llmReturns("{\"unsupported\":\"Les revenus ne sont pas disponibles dans Taskforce.\"}");

        ChartSpecResponse spec = service.generate("demo", 1L, "revenus mensuels", null);

        assertThat(spec.mode()).isEqualTo("unsupported");
        assertThat(spec.unsupported()).contains("revenus");
        assertThat(spec.data()).isNull();
        assertThat(spec.dataset()).isNull();
    }

    @Test
    @DisplayName("si le LLM renvoie du charabia, on retombe proprement sur l'heuristique")
    void malformedLlmOutputFallsBack() {
        llmReturns("ceci n'est pas du JSON");

        ChartSpecResponse spec = service.generate("demo", 1L, "issues par projet", null);

        assertThat(spec.mode()).isEqualTo("breakdown");  // l'heuristique rattrape
    }

    @Test
    @DisplayName("un dataset ET une dimension inconnus → repli heuristique (jamais de faux graphe)")
    void unusableLlmOutputFallsBack() {
        when(queryService.isValidDimension("REVENUE")).thenReturn(false);
        llmReturns("""
            {"title":"X","dimension":"REVENUE","measure":"COUNT"}
            """);

        // Le prompt parle de burndown → l'heuristique doit rattraper avec un dataset réel.
        ChartSpecResponse spec = service.generate("demo", 1L, "montre le burndown", null);

        assertThat(spec.mode()).isEqualTo("timeseries");
        assertThat(spec.dataset()).isEqualTo("burndown");
    }

    // ── Helper ────────────────────────────────────────────────────────────────

    private void llmReturns(String json) {
        when(llm.isConfigured()).thenReturn(true);
        when(llm.chatCompletion(anyString(), anyString(), anyString(), anyBoolean(), anyString())).thenReturn(json);
    }
}
