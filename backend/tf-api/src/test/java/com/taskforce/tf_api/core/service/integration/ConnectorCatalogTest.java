package com.taskforce.tf_api.core.service.integration;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

import com.taskforce.tf_api.core.dto.response.ConnectorDescriptor;
import com.taskforce.tf_api.core.dto.response.ConnectorField;
import com.taskforce.tf_api.core.enums.ConnectionPath;
import com.taskforce.tf_api.core.enums.ConnectorAuthType;
import com.taskforce.tf_api.core.enums.ConnectorCategory;
import com.taskforce.tf_api.core.enums.ToolClass;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Tests unitaires de {@link ConnectorCatalog} : trois intégrations natives et 31 préréglages de serveurs MCP
 * (ADR-020), lus dans le fichier des préréglages (R99), dont un seul essayé de bout en bout et montré à tous (TF-J1-3).
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

    // ── Intégrité globale ────────────────────────────────────────────────────

    @Test
    @DisplayName("trois natives et 31 préréglages MCP, rien d'autre")
    void troisNativesEtTrenteEtUnPrereglages() {
        assertThat(catalogue.all())
            .filteredOn(d -> d.authType() != ConnectorAuthType.MCP)
            .extracting(ConnectorDescriptor::key)
            .containsExactly("plane", "github", "slack");
        assertThat(catalogue.all()).filteredOn(d -> d.authType() == ConnectorAuthType.MCP).hasSize(31);
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
            // Sauf le serveur que l'entreprise crée chez l'éditeur (Zoho) : son adresse vient de la personne.
            if (d.preset().connection() != ConnectionPath.SERVER_URL) assertThat(d.mcpSuggestedUrl()).startsWith("https://");
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

    @ParameterizedTest(name = "{0} -> {1}")
    @CsvSource({
        "jira,           TICKETS_PROJECTS",
        "confluence,     KNOWLEDGE",
        "notion,         KNOWLEDGE",
        "gitlab,         CODE",
        "github-mcp,     CODE",
        "slack-mcp,      CHAT_MAIL",
        "stripe,         FINANCE_HR",
        "zoho,           SALES",
        "intercom,       SUPPORT",
        "excalidraw,     DESIGN",
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
        "square,   https://mcp.squareup.com/sse",
        "zapier,   https://mcp.zapier.com/api/mcp/mcp",
    })
    @DisplayName("l'URL préremplie est celle du serveur officiel vérifié")
    void urlPrerempliesVerifiees(String cle, String url) {
        assertThat(catalogue.byKey(cle).orElseThrow().mcpSuggestedUrl()).isEqualTo(url);
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {"docker", "ollama", "trello", "shadcn"})
    @DisplayName("les tuiles retirées au lot 6 ne sont plus au catalogue")
    void tuilesRetirees(String cle) {
        assertThat(catalogue.byKey(cle)).isEmpty();
    }

    @ParameterizedTest(name = "{0} -> {1}")
    @CsvSource({"linear, true", "zapier, true", "github, false", "plane, false", "trello, false"})
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
        assertThat(catalogue.isShown(cle, true)).isFalse();
    }

    // ── Préréglages essayés (TF-J1-3) ────────────────────────────────────────

    @Test
    @DisplayName("un seul préréglage essayé de bout en bout : Linear ; les 30 autres restent déclarés")
    void unSeulPrereglageEssaye() {
        assertThat(catalogue.all()).filteredOn(d -> catalogue.isTriedPreset(d.key()))
            .extracting(ConnectorDescriptor::key).containsExactly("linear");
        assertThat(catalogue.all()).filteredOn(d -> d.authType() == ConnectorAuthType.MCP)
            .filteredOn(d -> !catalogue.isTriedPreset(d.key())).hasSize(30);
    }

    @ParameterizedTest(name = "{0} -> {1}")
    @CsvSource({"linear, true", "jira, false", "cloudflare, false", "github, false", "plane, false", "trello, false"})
    @DisplayName("isTriedPreset : vrai pour un préréglage essayé seulement, jamais pour une native ou une clé inconnue")
    void isTriedPreset(String cle, boolean attendu) {
        assertThat(catalogue.isTriedPreset(cle)).isEqualTo(attendu);
    }

    @ParameterizedTest(name = "{0}, connecté ici = {1} -> montré = {2}")
    @CsvSource({
        "plane,      false, true",
        "github,     false, true",
        "slack,      false, true",
        "linear,     false, true",
        "jira,       false, false",
        "cloudflare, false, false",
        "cloudflare, true,  true",
        "zapier,     true,  true",
        "trello,     true,  false",
    })
    @DisplayName("isShown : natives et préréglage essayé pour tous ; un préréglage jamais essayé pour l'espace qui l'a connecté")
    void isShown(String cle, boolean connecteIci, boolean attendu) {
        assertThat(catalogue.isShown(cle, connecteIci)).isEqualTo(attendu);
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
        assertThat(catalogue.isShown(cle, false)).isTrue();
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
