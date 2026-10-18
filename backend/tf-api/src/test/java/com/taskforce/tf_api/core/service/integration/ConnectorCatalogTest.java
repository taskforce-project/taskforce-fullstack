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
import com.taskforce.tf_api.core.enums.ConnectorAuthType;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Tests unitaires de {@link ConnectorCatalog} : trois intégrations natives et 25 préréglages de serveurs MCP
 * (ADR-020).
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
    @DisplayName("trois natives et 25 préréglages MCP, rien d'autre")
    void troisNativesEtVingtCinqPrereglages() {
        assertThat(catalogue.all())
            .filteredOn(d -> d.authType() != ConnectorAuthType.MCP)
            .extracting(ConnectorDescriptor::key)
            .containsExactly("plane", "github", "slack");
        assertThat(catalogue.all()).filteredOn(d -> d.authType() == ConnectorAuthType.MCP).hasSize(25);
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
    @DisplayName("les clés sont des slugs stables, sans doublon")
    void lesClesSontDesSlugsUniques() {
        // La clé sert d'identifiant d'URL et de colonne en base : ni majuscule, ni espace, ni doublon (la Map
        // écraserait la première déclaration sans bruit).
        List<String> cles = catalogue.all().stream().map(ConnectorDescriptor::key).toList();

        assertThat(cles).allMatch(k -> k.matches("[a-z0-9-]+"), "slug minuscule").doesNotHaveDuplicates();
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
    @DisplayName("un préréglage MCP n'a ni formulaire ni doc native, seulement l'URL de son serveur officiel")
    void unPrereglageNaQueSonServeurMcp() {
        assertThat(catalogue.all()).filteredOn(d -> d.authType() == ConnectorAuthType.MCP).allSatisfy(d -> {
            assertThat(d.fields()).isEmpty();
            assertThat(d.capabilities()).containsExactly("mcp");
            assertThat(d.docsUrl()).isNull();
            assertThat(d.mcpSuggestedUrl()).startsWith("https://");
        });
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
    @DisplayName("une clé nulle n'est ni trouvée ni un préréglage")
    void cleNulle(String cle) {
        assertThat(catalogue.byKey(cle)).isEmpty();
        assertThat(catalogue.isMcpPreset(cle)).isFalse();
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
