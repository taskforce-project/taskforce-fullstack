package com.taskforce.tf_api.core.api;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import com.taskforce.tf_api.core.dto.response.ModelBenchmarkResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.agent.ModelBenchmarkService;
import com.taskforce.tf_api.shared.exception.ForbiddenException;
import com.taskforce.tf_api.shared.security.SecurityConfig;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Tests de tranche web : {@link ModelBenchmarkController} (la matrice, un passage, le verdict, l'essai à l'aveugle), le service mocké. */
@WebMvcTest(ModelBenchmarkController.class)
@Import(SecurityConfig.class)
@ActiveProfiles("test")
@DisplayName("ModelBenchmarkController (@WebMvcTest)")
class ModelBenchmarkControllerWebMvcTest {

    @Autowired private MockMvc mockMvc;

    @MockitoBean private ModelBenchmarkService benchmark;
    @MockitoBean private UserRepository userRepository;
    @MockitoBean private WorkspaceRepository workspaceRepository;
    @MockitoBean private WorkspaceMemberRepository workspaceMemberRepository;

    private static final String EMAIL = "dev@it.dev";
    private static final String URL = "/api/workspaces/acme/ai/benchmark";
    private static final LocalDateTime AT = LocalDateTime.of(2026, 11, 8, 10, 0);
    private static final ModelBenchmarkResponse MATRIX = new ModelBenchmarkResponse("OLLAMA", "qwen3:8b", 1, 22,
        List.of(new ModelBenchmarkResponse.TaskInfo("summarize", "Summarize", "An issue", 3, true)),
        List.of(new ModelBenchmarkResponse.ModelRow("qwen3:8b", true, AT, 660,
            List.of(new ModelBenchmarkResponse.Cell("summarize", "give_it", 3, 3, 3, "you", 0)),
            new ModelBenchmarkResponse.ModelFacts("qwen3", "8.2B", 5_225_388_164L, 40960, true, true, 6_740_000_000L, 6_170_000_000L, null))));
    private static final ModelBenchmarkResponse.ModelDetail DETAIL = new ModelBenchmarkResponse.ModelDetail("qwen3:8b", true, AT, 22, List.of(), List.of());

    private RequestPostProcessor auth() {
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.of(User.builder().id(7L).email(EMAIL).build()));
        return jwt().jwt(b -> b.claim("email", EMAIL));
    }

    @Test
    @DisplayName("GET : la matrice de l'espace")
    void matrix_200() throws Exception {
        when(benchmark.matrix("acme", 7L)).thenReturn(MATRIX);

        mockMvc.perform(get(URL).with(auth()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.provider").value("OLLAMA"))
            .andExpect(jsonPath("$.data.models[0].estimateSeconds").value(660))
            .andExpect(jsonPath("$.data.models[0].cells[0].verdict").value("give_it"))
            .andExpect(jsonPath("$.data.models[0].cells[0].judge").value("you"))
            .andExpect(jsonPath("$.data.models[0].facts.family").value("qwen3"))
            .andExpect(jsonPath("$.data.models[0].facts.gpuBytes").value(6_170_000_000L))
            .andExpect(jsonPath("$.data.tasks[0].trial").value(true));
    }

    @Test
    @DisplayName("POST load : charge le modèle du passage ; un modèle qui ne se charge pas est un résultat, 200")
    void load_200() throws Exception {
        var a = auth();
        when(benchmark.load("acme", 7L, 9L)).thenReturn(new ModelBenchmarkResponse.LoadResult("too_slow", null, null, null, null));

        mockMvc.perform(post(URL + "/runs/9/load").with(a))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.status").value("too_slow"));
    }

    @Test
    @DisplayName("POST stop : coupe l'appel en cours de la personne")
    void stop_200() throws Exception {
        var a = auth();

        mockMvc.perform(post(URL + "/stop").with(a)).andExpect(status().isOk());

        verify(benchmark).stop("acme", 7L);
    }

    @Test
    @DisplayName("GET history : les passages de l'espace")
    void history_200() throws Exception {
        var a = auth();
        when(benchmark.history("acme", 7L)).thenReturn(List.of(new ModelBenchmarkResponse.RunLine(9L, "qwen3:14b", AT, 22, 22, 15, 3)));

        mockMvc.perform(get(URL + "/history").with(a))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data[0].model").value("qwen3:14b"))
            .andExpect(jsonPath("$.data[0].tooSlow").value(3));
    }

    @Test
    @DisplayName("POST trials : un seul modèle suffit")
    void trial_oneModel() throws Exception {
        var a = auth();
        when(benchmark.startTrial("acme", 7L, 3L, 40L, "summarize", List.of("qwen3:8b")))
            .thenReturn(new ModelBenchmarkResponse.TrialStarted(4L, "summarize", "OPS-35", List.of("A")));

        mockMvc.perform(post(URL + "/trials").with(a).contentType(MediaType.APPLICATION_JSON)
                .content("{\"projectId\":3,\"issueId\":40,\"task\":\"summarize\",\"models\":[\"qwen3:8b\"]}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.letters[0]").value("A"));
    }

    @Test
    @DisplayName("GET detail : le détail d'un modèle, nommé en paramètre (un nom peut contenir « : » ou « / »)")
    void detail_200() throws Exception {
        when(benchmark.detail("acme", 7L, "org/qwen3:8b")).thenReturn(DETAIL);

        mockMvc.perform(get(URL + "/detail").param("model", "org/qwen3:8b").with(auth()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.model").value("qwen3:8b"));
    }

    @Test
    @DisplayName("POST runs puis un cas : le passage s'ouvre sur le modèle nommé, chaque cas se joue à part, avec son temps")
    void run_200() throws Exception {
        var a = auth();
        when(benchmark.start("acme", 7L, "qwen3:14b")).thenReturn(new ModelBenchmarkResponse.RunStarted(9L, "qwen3:14b", AT, List.of("code-slugify-ts")));
        when(benchmark.play("acme", 7L, 9L, "code-slugify-ts")).thenReturn(new ModelBenchmarkResponse.CaseDetail(55L, "code-slugify-ts", "A title", true, true,
            null, null, List.of(), List.of(), "An answer", 12_000L, AT, false));

        mockMvc.perform(post(URL + "/runs").with(a).contentType(MediaType.APPLICATION_JSON).content("{\"model\":\"qwen3:14b\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.runId").value(9));
        mockMvc.perform(post(URL + "/runs/9/cases/code-slugify-ts").with(a))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.resultId").value(55))
            .andExpect(jsonPath("$.data.durationMs").value(12000));
    }

    @ParameterizedTest(name = "« {0} »")
    @ValueSource(strings = {"{}", "{\"model\":\"\"}", "{\"model\":\"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\"}"})
    @DisplayName("POST runs : un modèle absent ou trop long est refusé")
    void run_400(String body) throws Exception {
        mockMvc.perform(post(URL + "/runs").with(auth()).contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isBadRequest());
        verify(benchmark, never()).start(any(), any(), any());
    }

    @ParameterizedTest(name = "« {0} »")
    @ValueSource(strings = {"true", "false", "null"})
    @DisplayName("PUT verdict : réussi, raté, ou null pour la rendre au code")
    void verdict_200(String passed) throws Exception {
        Boolean value = "null".equals(passed) ? null : Boolean.valueOf(passed);
        when(benchmark.overturn("acme", 7L, 55L, value)).thenReturn(DETAIL);

        mockMvc.perform(put(URL + "/results/55/verdict").with(auth()).contentType(MediaType.APPLICATION_JSON).content("{\"passed\":" + passed + "}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.model").value("qwen3:8b"));
        verify(benchmark).overturn("acme", 7L, 55L, value);
    }

    @Test
    @DisplayName("l'essai à l'aveugle : les lettres, une réponse sans nom, puis le choix et les noms")
    void trial_200() throws Exception {
        var a = auth();
        when(benchmark.startTrial("acme", 7L, 3L, 40L, "summarize", List.of("qwen3:8b", "qwen3:14b")))
            .thenReturn(new ModelBenchmarkResponse.TrialStarted(4L, "summarize", "OPS-35", List.of("A", "B")));
        when(benchmark.playTrial("acme", 7L, 4L, "A")).thenReturn(new ModelBenchmarkResponse.TrialLetterAnswer("A", "An answer", 3000L, false));
        when(benchmark.chooseTrial("acme", 7L, 4L, "A")).thenReturn(new ModelBenchmarkResponse.TrialResult(4L, "summarize", "OPS-35", "A", "qwen3:14b", AT,
            List.of(new ModelBenchmarkResponse.TrialAnswer("A", "qwen3:14b", "An answer", 3000L, false))));

        mockMvc.perform(post(URL + "/trials").with(a).contentType(MediaType.APPLICATION_JSON)
                .content("{\"projectId\":3,\"issueId\":40,\"task\":\"summarize\",\"models\":[\"qwen3:8b\",\"qwen3:14b\"]}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.letters[1]").value("B"));
        mockMvc.perform(post(URL + "/trials/4/letters/A").with(a))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.answer").value("An answer"))
            .andExpect(jsonPath("$.data.model").doesNotExist());
        mockMvc.perform(post(URL + "/trials/4/choice").with(a).contentType(MediaType.APPLICATION_JSON).content("{\"letter\":\"A\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.chosenModel").value("qwen3:14b"));
    }

    @ParameterizedTest(name = "« {0} »")
    @ValueSource(strings = {
        "{\"issueId\":40,\"task\":\"summarize\",\"models\":[\"a\",\"b\"]}",
        "{\"projectId\":3,\"task\":\"summarize\",\"models\":[\"a\",\"b\"]}",
        "{\"projectId\":3,\"issueId\":40,\"models\":[\"a\",\"b\"]}",
        "{\"projectId\":3,\"issueId\":40,\"task\":\"summarize\",\"models\":[]}",
        "{\"projectId\":3,\"issueId\":40,\"task\":\"summarize\",\"models\":[\"a\",\"b\",\"c\",\"d\"]}",
    })
    @DisplayName("POST trials : il faut l'issue, la tâche et un à trois modèles")
    void trial_400(String body) throws Exception {
        mockMvc.perform(post(URL + "/trials").with(auth()).contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isBadRequest());
        verify(benchmark, never()).startTrial(any(), any(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("hors de l'espace : 403 du service")
    void stranger_403() throws Exception {
        var a = auth();
        when(benchmark.matrix("acme", 7L)).thenThrow(new ForbiddenException("no"));

        mockMvc.perform(get(URL).with(a)).andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("sans jeton : 401")
    void unauthenticated_401() throws Exception {
        mockMvc.perform(get(URL)).andExpect(status().isUnauthorized());
        mockMvc.perform(post(URL + "/trials").contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isUnauthorized());
    }
}
