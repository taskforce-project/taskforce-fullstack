package com.taskforce.tf_api.core.service.integration;

import java.io.IOException;
import java.io.InputStream;
import java.util.Arrays;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.dto.response.ConnectorDescriptor;
import com.taskforce.tf_api.core.dto.response.ConnectorField;
import com.taskforce.tf_api.core.enums.ConnectionPath;
import com.taskforce.tf_api.core.enums.ConnectorAuthType;
import com.taskforce.tf_api.core.enums.ConnectorCategory;
import com.taskforce.tf_api.core.enums.ToolClass;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Tests unitaires de {@link ConnectorCatalog} : trois intégrations natives et les préréglages de serveurs MCP
 * (ADR-020), lus dans le fichier des préréglages (R99), dont un seul essayé de bout en bout ; chacun se montre à tous
 * (décision de la Présidence, 12/11/2026). Les comptes viennent du fichier, jamais d'un nombre écrit ici : ajouter un
 * outil au registre ne demande pas de toucher aux tests.
 *
 * <p>Le catalogue est déclaratif : une erreur de déclaration ne casse rien à la compilation et ne se voit qu'à
 * l'écran (tuile sans URL, catégorie vide) ou en base (champ de secret oublié en clair). D'où des tests
 * d'intégrité plutôt que de comportement.</p>
 */
@DisplayName("ConnectorCatalog (natives et préréglages MCP)")
class ConnectorCatalogTest {

    private ConnectorCatalog catalogue;

    @BeforeEach
    void setUp() {
        catalogue = new ConnectorCatalog();
        // `build()` porte @PostConstruct : hors contexte Spring, on l'appelle nous-mêmes.
        catalogue.build();
    }

    /** Les préréglages tels que le fichier les écrit, lus sans le catalogue : la source des comptes. */
    private static JsonNode fichier() throws IOException {
        try (InputStream in = ConnectorCatalogTest.class.getClassLoader().getResourceAsStream(ConnectorCatalog.PRESETS)) {
            return new ObjectMapper().readTree(in).path("presets");
        }
    }

    // ── Intégrité globale ────────────────────────────────────────────────────

    @Test
    @DisplayName("trois natives et chaque préréglage du fichier, rien d'autre")
    void troisNativesEtLesPrereglagesDuFichier() throws IOException {
        assertThat(catalogue.all())
            .filteredOn(d -> d.authType() != ConnectorAuthType.MCP)
            .extracting(ConnectorDescriptor::key)
            .containsExactly("plane", "github", "slack");
        assertThat(catalogue.all()).filteredOn(d -> d.authType() == ConnectorAuthType.MCP).hasSize(fichier().size());
    }

    @Test
    @DisplayName("chaque catégorie du registre a au moins un outil (l'écran n'a pas de rubrique vide)")
    void chaqueCategorieAUnOutil() {
        assertThat(Arrays.stream(ConnectorCategory.values()).filter(c -> c != ConnectorCategory.CUSTOM_MCP))
            .allSatisfy(c -> assertThat(catalogue.all()).as(c.name()).anyMatch(d -> d.category() == c));
    }

    @Test
    @DisplayName("chaque fiche est complète : clé, nom, description, catégorie, mode de connexion, capacités, site")
    void chaqueFicheEstComplete() {
        assertThat(catalogue.all()).allSatisfy(d -> {
            assertThat(d.key()).isNotBlank();
            assertThat(d.name()).isNotBlank();
            assertThat(d.description()).isNotBlank();
            assertThat(d.category()).isNotNull();
            assertThat(d.authType()).isNotNull();
            assertThat(d.capabilities()).isNotEmpty();
            assertThat(d.websiteUrl()).startsWith("https://");
        });
    }

    @Test
    @DisplayName("les clés sont des slugs stables, sans doublon, hors du préfixe des serveurs personnalisés")
    void lesClesSontDesSlugsUniques() {
        // La clé sert d'identifiant d'URL et de colonne en base : ni majuscule, ni espace, ni doublon (la Map
        // écraserait la première déclaration sans bruit).
        List<String> cles = catalogue.all().stream().map(ConnectorDescriptor::key).toList();

        assertThat(cles).allMatch(k -> k.matches("[a-z0-9-]+"), "slug minuscule").doesNotHaveDuplicates()
            .noneMatch(k -> k.startsWith("custom"));
    }

    @Test
    @DisplayName("l'ordre de déclaration est préservé (l'interface groupe par catégorie dans cet ordre)")
    void ordreDeDeclarationPreserve() {
        assertThat(catalogue.all().get(0).key()).isEqualTo("plane");
        assertThat(catalogue.all()).extracting(ConnectorDescriptor::key).containsSubsequence("plane", "github", "slack");
    }

    @Test
    @DisplayName("all() renvoie une copie : modifier le résultat n'altère pas le catalogue")
    void allRenvoieUneCopieDefensive() {
        int tailleInitiale = catalogue.all().size();

        catalogue.all().clear();

        assertThat(catalogue.all()).hasSize(tailleInitiale);
    }

    // ── Préréglages MCP ──────────────────────────────────────────────────────

    @Test
    @DisplayName("un préréglage MCP n'a ni formulaire ni doc native, seulement l'URL HTTPS de son serveur officiel")
    void unPrereglageNaQueSonServeurMcp() {
        assertThat(catalogue.all()).filteredOn(d -> d.authType() == ConnectorAuthType.MCP).allSatisfy(d -> {
            assertThat(d.fields()).isEmpty();
            assertThat(d.capabilities()).containsExactly("mcp");
            assertThat(d.docsUrl()).isNull();
            // Sauf le serveur que l'entreprise crée chez l'éditeur (Zoho) : son adresse vient de la personne ; et l'API
            // d'un éditeur que TaskForce sert lui-même (Google Drive), sans serveur MCP.
            if (d.preset().connection() != ConnectionPath.SERVER_URL && d.preset().api() == null) {
                assertThat(d.mcpSuggestedUrl()).startsWith("https://");
            }
        });
    }

    // ── Le fichier des préréglages (R99, séance n°22) ───────────────────────

    @Test
    @DisplayName("chaque préréglage a sa catégorie du registre, son chemin, et des listes d'outils sans doublon")
    void chaquePrereglageEstDeclareEnDonnees() {
        assertThat(catalogue.all()).filteredOn(d -> d.preset() != null).allSatisfy(d -> {
            assertThat(d.preset().category()).isNotEqualTo(ConnectorCategory.CUSTOM_MCP);
            assertThat(d.preset().connection()).isNotNull();
            assertThat(java.util.Collections.disjoint(d.preset().readTools(), d.preset().writeTools())).isTrue();
            // Pas de tiret cadratin dans un texte d'interface (AGENTS.md) : le caractère U+2014, écrit par son code.
            if (d.preset().admin() != null) {
                assertThat(d.preset().admin().text()).isNotBlank().doesNotContain(String.valueOf((char) 0x2014));
            }
        });
    }

    @Test
    @DisplayName("chaque préréglage cite ses sources, des pages HTTPS lues (registre, R153)")
    void chaquePrereglageCiteSesSources() {
        assertThat(catalogue.all()).filteredOn(d -> d.preset() != null).allSatisfy(d ->
            assertThat(d.preset().sources()).as(d.key()).isNotEmpty().allMatch(s -> s.startsWith("https://")));
    }

    @Test
    @DisplayName("un chemin par application dit l'étape de l'administrateur ; un outil fermé dit pourquoi")
    void cheminParApplicationOuFerme() {
        assertThat(catalogue.all()).filteredOn(d -> d.preset() != null).allSatisfy(d -> {
            ConnectorPreset p = d.preset();
            if (p.blocked() == null && (p.connection() == ConnectionPath.OUR_APP || p.connection() == ConnectionPath.COMPANY_APP)) {
                assertThat(p.admin()).as(d.key()).isNotNull();
            }
            if (p.blocked() != null) assertThat(p.blocked()).as(d.key()).isNotBlank();
            // Une clé, ou l'adresse que l'entreprise crée, se guide : où la créer (sauf chez un outil fermé).
            if (p.blocked() == null && (p.connection() == ConnectionPath.API_KEY || p.connection() == ConnectionPath.SERVER_URL)) {
                assertThat(p.apiKey()).as(d.key()).isNotNull();
            }
        });
    }

    @Test
    @DisplayName("une adresse est celle de tout client : ni propre à Claude, ni un ancien point SSE sauf outil fermé")
    void adressesPourToutClient() {
        assertThat(catalogue.all()).filteredOn(d -> d.preset() != null && d.preset().mcpUrl() != null).allSatisfy(d -> {
            String url = d.preset().mcpUrl();
            assertThat(url).as(d.key()).doesNotContainIgnoringCase("anthropic").doesNotContainIgnoringCase("claude");
            if (d.preset().blocked() == null) assertThat(url).as(d.key()).doesNotEndWith("/sse");
        });
    }

    @ParameterizedTest(name = "{0} -> {1}")
    @CsvSource({
        "jira,           TICKETS_PROJECTS",
        "trello,         TICKETS_PROJECTS",
        "confluence,     KNOWLEDGE",
        "notion,         KNOWLEDGE",
        "box,            FILES_STORAGE",
        "gitlab,         CODE",
        "github-mcp,     CODE",
        "netlify,        CODE",
        "sentry,         MONITORING",
        "datadog,        MONITORING",
        "pagerduty,      MONITORING",
        "amplitude,      DATA",
        "posthog,        DATA",
        "vanta,          SECURITY",
        "slack-mcp,      CHAT_MAIL",
        "zoom,           CHAT_MAIL",
        "stripe,         FINANCE_HR",
        "qonto,          FINANCE_HR",
        "zoho,           SALES",
        "pipedrive,      SALES",
        "intercom,       SUPPORT",
        "excalidraw,     DESIGN",
        "miro,           DESIGN",
        "airtable,       OTHER",
    })
    @DisplayName("les catégories sont celles du registre des outils")
    void categoriesDuRegistre(String cle, ConnectorCategory categorie) {
        assertThat(catalogue.byKey(cle).orElseThrow().category()).isEqualTo(categorie);
    }

    @ParameterizedTest(name = "{0} / {1} -> {2}")
    @CsvSource({
        "linear,     list_issues,          READ",
        "linear,     save_issue,           WRITE",
        "linear,     never_heard_of,       WRITE",
        "excalidraw, export_to_excalidraw, WRITE",
        "stripe,     stripe_api_write,     WRITE",
        "stripe,     stripe_api_read,      READ",
        "custom-x,   search,               WRITE",
        "github,     list_issues,          WRITE",
    })
    @DisplayName("TaskForce décide la classe : celle du préréglage, et un outil inconnu est une écriture (R158)")
    void classeDecideeParTaskForce(String cle, String outil, ToolClass classe) {
        assertThat(catalogue.classOf(cle, outil)).isEqualTo(classe);
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {"github-mcp", "gitlab", "notion", "confluence", "jira", "slack-mcp", "linear", "excalidraw",
        "stripe", "zoho", "asana"})
    @DisplayName("chaque liste d'outils de la première vague dit sa page publique et la date de sa lecture (séance n°23, R160)")
    void lesListesDeLaPremiereVagueDisentLeurSource(String cle) throws IOException {
        JsonNode tools = null;
        for (JsonNode p : fichier()) if (cle.equals(p.path("key").asText())) tools = p.path("tools");
        assertThat(tools).as(cle).isNotNull();
        assertThat(tools.path("source").asText()).as(cle).startsWith("https://");
        assertThat(java.time.LocalDate.parse(tools.path("checked").asText())).as(cle)
            .isAfterOrEqualTo(java.time.LocalDate.of(2026, 11, 12));
    }

    @ParameterizedTest(name = "{0} / {1} -> {2}")
    @CsvSource({
        // Asana publie ses outils par groupe : la lecture sert, l'écriture et l'interactif demandent.
        "asana,      get_task,                READ",
        "asana,      search_objects,          READ",
        "asana,      create_tasks,            WRITE",
        "asana,      search_tasks_preview,    WRITE",
        // Atlassian : la lecture de Teamwork Graph et du code ; executeRead lance n'importe quel outil différé.
        "jira,       getTeamworkGraphContext, READ",
        "confluence, searchCode,              READ",
        "jira,       executeRead,             WRITE",
        "confluence, executeRead,             WRITE",
        // Linear ne publie pas de liste : sur son adresse entière, seul ce que son journal des changements dit en lecture
        // sert sans demander (son adresse de lecture seule : voir laLectureSeuleDocumentee).
        "linear,     list_customer_needs,     READ",
        "linear,     get_issue,               WRITE",
        "gitlab,     list_pipeline_schedules, READ",
        "stripe,     stripe_analytics,        WRITE",
        "notion,     notion-wait-session,     WRITE",
        "slack-mcp,  slack_search_public,     WRITE",
    })
    @DisplayName("la première vague, relue le 12/11/2026 : lecture seulement si l'éditeur le dit, le doute demande (R160)")
    void laPremiereVagueRelue(String cle, String outil, ToolClass classe) {
        assertThat(catalogue.classOf(cle, outil)).isEqualTo(classe);
    }

    @ParameterizedTest(name = "{0} / {1} -> {2}")
    @CsvSource({
        // Excalidraw : create_view garde chaque dessin chez l'éditeur ; read_checkpoint lit ce dépôt, pour l'app seule.
        "excalidraw,      read_me,                 READ",
        "excalidraw,      create_view,             WRITE",
        "excalidraw,      read_checkpoint,         WRITE",
        "excalidraw,      export_to_excalidraw,    WRITE",
        // Confluence : un export fabriqué chez Atlassian, avec un lien dont l'accès n'est pas documenté.
        "confluence,      exportConfluenceContent, WRITE",
        "confluence,      getConfluenceContent,    READ",
        // Excalidraw+ : deux outils sans description sur la page de l'éditeur.
        "excalidraw-plus, list_invites,            WRITE",
        "excalidraw-plus, get_invite,              WRITE",
        "excalidraw-plus, get_scene,               READ",
    })
    @DisplayName("un outil qui garde ou envoie un contenu chez l'éditeur, ou que sa page ne décrit pas, demande (revue de la PR #532)")
    void ceQuiGardeOuEnvoieDemande(String cle, String outil, ToolClass classe) {
        assertThat(catalogue.classOf(cle, outil)).isEqualTo(classe);
    }

    @ParameterizedTest(name = "{0} / {1} -> {2}")
    @CsvSource({
        // La page range les outils par intention, sans dire ce qu'un groupe permet : chacun reste une lecture sur sa
        // propre description (relue le 13/11/2026).
        "jira,       getJiraIssue,                  READ",
        "jira,       getJiraWorkflows,              READ",
        "jira,       getJiraScreen,                 READ",
        "jira,       getJiraWorkflowEditorLink,     WRITE",
        "confluence, diffConfluenceContentVersions, READ",
    })
    @DisplayName("Atlassian : une lecture sur la description de l'outil, pas sur le seul nom de son groupe (revue de la PR #532)")
    void atlassianParLaDescriptionDeChaqueOutil(String cle, String outil, ToolClass classe) {
        assertThat(catalogue.classOf(cle, outil)).isEqualTo(classe);
    }

    @ParameterizedTest(name = "{0} / {1} / {2} -> {3}")
    @CsvSource({
        // L'éditeur écrit que l'adresse de lecture seule ne sert que des lectures : chaque outil qu'elle sert en est une.
        "linear,     https://mcp.linear.app/mcp/readonly,         get_issue,    READ",
        "linear,     https://mcp.linear.app/mcp/readonly,         anything_new, READ",
        "github-mcp, https://api.githubcopilot.com/mcp/readonly,  get_me,       READ",
        "neon,       https://mcp.neon.tech/mcp?readonly=true,     run_sql,      READ",
        // Sur l'adresse entière, la liste documentée vaut.
        "linear,     https://mcp.linear.app/mcp,                  get_issue,    WRITE",
        "linear,     https://mcp.linear.app/mcp,                  list_issues,  READ",
        "neon,       https://mcp.neon.tech/mcp,                   run_sql,      WRITE",
        // Une adresse de lecture seule que l'éditeur ne documente pas ainsi : la classe du nom.
        "supabase,   https://mcp.supabase.com/mcp?read_only=true, execute_sql,  WRITE",
        "lucid,      https://mcp.lucid.app/mcp/readonly,          search,       WRITE",
    })
    @DisplayName("l'adresse de lecture seule que l'éditeur documente ne sert que des lectures (revue de la PR #532)")
    void laLectureSeuleDocumentee(String cle, String adresse, String outil, ToolClass classe) {
        assertThat(catalogue.classOn(cle, adresse, outil)).isEqualTo(classe);
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {"linear", "github-mcp", "neon", "posthog", "klaviyo"})
    @DisplayName("chaque adresse de lecture seule tenue pour lecture cite la page de l'éditeur et la date de sa lecture")
    void lesAdressesDeLectureSeuleCitentLeurPage(String cle) {
        ConnectorPreset preset = catalogue.preset(cle).orElseThrow();
        assertThat(preset.readUrlSource()).as(cle).isNotNull();
        assertThat(preset.readUrlSource().page()).as(cle).startsWith("https://");
        assertThat(java.time.LocalDate.parse(preset.readUrlSource().checked())).as(cle)
            .isAfterOrEqualTo(java.time.LocalDate.of(2026, 11, 13));
        assertThat(preset.isDocumentedReadOnly(preset.readUrl())).as(cle).isTrue();
        assertThat(preset.isDocumentedReadOnly(preset.mcpUrl())).as(cle).isFalse();
    }

    @Test
    @DisplayName("la lecture par défaut : portées et adresse de lecture seule, l'écriture seulement accordée")
    void laLectureParDefaut() {
        ConnectorPreset linear = catalogue.preset("linear").orElseThrow();
        assertThat(linear.scopesFor(false)).containsExactly("read");
        assertThat(linear.scopesFor(true)).containsExactly("read", "write");
        assertThat(linear.urlFor(false)).isEqualTo("https://mcp.linear.app/mcp/readonly");
        assertThat(linear.urlFor(true)).isEqualTo("https://mcp.linear.app/mcp");
        assertThat(catalogue.preset("jira").orElseThrow().scopesFor(false)).noneMatch(s -> s.startsWith("write:"));
        assertThat(catalogue.preset("clickup").orElseThrow().scopesFor(false)).isEmpty();
    }

    @Test
    @DisplayName("le chemin de chaque outil de la première vague (registre, 11/11/2026)")
    void cheminsDeLaPremiereVague() {
        assertThat(catalogue.preset("notion").orElseThrow().connection()).isEqualTo(ConnectionPath.SELF_REGISTRATION);
        assertThat(catalogue.preset("asana").orElseThrow().connection()).isEqualTo(ConnectionPath.OUR_APP);
        assertThat(catalogue.preset("slack-mcp").orElseThrow().connection()).isEqualTo(ConnectionPath.COMPANY_APP);
        assertThat(catalogue.preset("excalidraw-plus").orElseThrow().connection()).isEqualTo(ConnectionPath.API_KEY);
        assertThat(catalogue.preset("zoho").orElseThrow().connection()).isEqualTo(ConnectionPath.SERVER_URL);
        assertThat(catalogue.preset("excalidraw").orElseThrow().connection()).isEqualTo(ConnectionPath.OPEN);
        assertThat(catalogue.preset("figma").orElseThrow().blocked()).contains("waitlist");
    }

    @ParameterizedTest(name = "{0} -> {1}")
    @CsvSource({
        "linear,   https://mcp.linear.app/mcp",
        "sentry,   https://mcp.sentry.dev/mcp",
        "notion,   https://mcp.notion.com/mcp",
        "stripe,   https://mcp.stripe.com",
        "attio,    https://mcp.attio.com/mcp",
        "square,   https://mcp.squareup.com/mcp",
        "neon,     https://mcp.neon.tech/mcp",
        "trello,   https://mcp.trello.com/v1",
        "datadog,  https://mcp.datadoghq.com/v1/mcp",
    })
    @DisplayName("l'URL préremplie est celle du serveur officiel vérifié (répertoire de Claude, 12/11/2026)")
    void urlPrerempliesVerifiees(String cle, String url) {
        assertThat(catalogue.byKey(cle).orElseThrow().mcpSuggestedUrl()).isEqualTo(url);
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {"docker", "ollama", "shadcn"})
    @DisplayName("les tuiles retirées au lot 6 ne sont plus au catalogue (Trello y revient par son serveur officiel)")
    void tuilesRetirees(String cle) {
        assertThat(catalogue.byKey(cle)).isEmpty();
    }

    @ParameterizedTest(name = "{0} -> {1}")
    @CsvSource({"linear, true", "zapier, true", "github, false", "plane, false", "docker, false"})
    @DisplayName("isMcpPreset distingue un préréglage d'une native et d'une clé inconnue")
    void isMcpPreset(String cle, boolean attendu) {
        assertThat(catalogue.isMcpPreset(cle)).isEqualTo(attendu);
    }

    @ParameterizedTest
    @NullSource
    @DisplayName("une clé nulle n'est ni trouvée ni un préréglage, ni montrée")
    void cleNulle(String cle) {
        assertThat(catalogue.byKey(cle)).isEmpty();
        assertThat(catalogue.isMcpPreset(cle)).isFalse();
        assertThat(catalogue.isTriedPreset(cle)).isFalse();
    }

    // ── Préréglages essayés (TF-J1-3) ────────────────────────────────────────

    @Test
    @DisplayName("un seul préréglage essayé de bout en bout : Linear ; chaque autre préréglage du fichier reste à essayer")
    void unSeulPrereglageEssaye() throws IOException {
        int essayes = 0;
        for (JsonNode p : fichier()) if (p.path("tried").isObject()) essayes++;
        assertThat(catalogue.all()).filteredOn(d -> catalogue.isTriedPreset(d.key()))
            .extracting(ConnectorDescriptor::key).containsExactly("linear");
        assertThat(catalogue.all()).filteredOn(d -> d.authType() == ConnectorAuthType.MCP)
            .filteredOn(d -> !catalogue.isTriedPreset(d.key())).hasSize(fichier().size() - essayes);
    }

    @ParameterizedTest(name = "{0} -> {1}")
    @CsvSource({"linear, true", "jira, false", "cloudflare, false", "github, false", "plane, false", "docker, false"})
    @DisplayName("isTriedPreset : vrai pour un préréglage essayé seulement, jamais pour une native ou une clé inconnue")
    void isTriedPreset(String cle, boolean attendu) {
        assertThat(catalogue.isTriedPreset(cle)).isEqualTo(attendu);
    }

    // ── Intégrations natives ─────────────────────────────────────────────────

    @Test
    @DisplayName("Plane se connecte par clé API, documente sa procédure et marque la clé comme secret")
    void planeParCleApi() {
        ConnectorDescriptor plane = catalogue.byKey("plane").orElseThrow();

        assertThat(plane.authType()).isEqualTo(ConnectorAuthType.API_KEY);
        assertThat(plane.docsUrl()).isNotBlank();
        assertThat(plane.setupHint()).isNotBlank();
        assertThat(plane.fields()).extracting(ConnectorField::key).containsExactly("apiKey", "planeWorkspace");
        // Le drapeau `secret` pilote le masquage à l'écran et le chiffrement au repos.
        assertThat(plane.fields()).allSatisfy(f -> {
            assertThat(f.required()).isTrue();
            assertThat(f.secret()).isEqualTo(f.key().equals("apiKey"));
        });
    }

    @ParameterizedTest(name = "{0} : « {1} »")
    @CsvSource(delimiter = '|', value = {
        "plane  | Syncs your Plane projects and work items into the workspace's knowledge.",
        "github | Links pull requests and commits to your issues; a merged pull request completes its issue.",
        "slack  | Posts issue notifications to your channels and brings their history into the workspace's knowledge.",
    })
    @DisplayName("chaque native dit en une phrase ce qu'elle fait, à côté des préréglages (rejeu de la 1.8.0)")
    void chaqueNativeDitCeQuElleFait(String cle, String ligne) {
        ConnectorDescriptor d = catalogue.byKey(cle).orElseThrow();

        assertThat(d.description()).isEqualTo(ligne);
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {"github", "slack"})
    @DisplayName("GitHub et Slack se connectent en un clic (OAuth), sans champ, et savent agir")
    void connecteursOauthUnClic(String cle) {
        ConnectorDescriptor d = catalogue.byKey(cle).orElseThrow();

        assertThat(d.authType()).isEqualTo(ConnectorAuthType.OAUTH2);
        assertThat(d.fields()).isEmpty();
        assertThat(d.capabilities()).containsExactly("observe", "act");
        assertThat(d.docsUrl()).isNotBlank();
        assertThat(d.mcpSuggestedUrl()).isNull();
    }
}
