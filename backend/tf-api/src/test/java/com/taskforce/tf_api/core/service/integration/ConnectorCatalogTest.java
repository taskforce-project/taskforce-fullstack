package com.taskforce.tf_api.core.service.integration;

import java.util.List;
import java.util.stream.Stream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;

import com.taskforce.tf_api.core.dto.response.ConnectorDescriptor;
import com.taskforce.tf_api.core.dto.response.ConnectorField;
import com.taskforce.tf_api.core.enums.ConnectorAuthType;
import com.taskforce.tf_api.core.enums.ConnectorStatus;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.params.provider.Arguments.arguments;

/**
 * Tests unitaires — {@link ConnectorCatalog}.
 *
 * <p>Le catalogue est <b>déclaratif</b> : il n'appelle aucun service externe, mais c'est lui qui
 * pilote toute l'UI générique d'intégrations (quels champs afficher, lesquels masquer, quel outil
 * est branchable). Une erreur de déclaration ne casse donc rien à la compilation et ne se voit qu'à
 * l'écran — ou pire, en base : un champ de secret oublié en clair. D'où des tests d'<b>intégrité</b>
 * du catalogue plutôt que de comportement.
 */
@DisplayName("ConnectorCatalog (catalogue déclaratif d'intégrations)")
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
    @DisplayName("chaque descripteur est complet : clé, nom, description, catégorie, mode d'auth")
    void chaqueDescripteurEstComplet() {
        assertThat(catalogue.all()).isNotEmpty();

        assertThat(catalogue.all()).allSatisfy(d -> {
            assertThat(d.key()).isNotBlank();
            assertThat(d.name()).isNotBlank();
            assertThat(d.description()).isNotBlank();
            assertThat(d.category()).isNotNull();
            assertThat(d.authType()).isNotNull();
            assertThat(d.status()).isNotNull();
            assertThat(d.capabilities()).isNotEmpty();
        });
    }

    @Test
    @DisplayName("les clés sont des slugs stables : minuscules, chiffres et tirets")
    void lesClesSontDesSlugs() {
        // La clé sert d'identifiant d'URL et de colonne en base : elle ne doit jamais varier
        // en casse ni contenir d'espace.
        assertThat(catalogue.all())
            .extracting(ConnectorDescriptor::key)
            .allMatch(k -> k.matches("[a-z0-9-]+"), "slug minuscule");
    }

    @Test
    @DisplayName("aucune clé n'est déclarée deux fois")
    void aucuneCleEnDouble() {
        // Le catalogue s'appuie sur une Map : un doublon écraserait silencieusement la première
        // déclaration. On compare donc les clés distinctes au nombre d'entrées.
        List<String> cles = catalogue.all().stream().map(ConnectorDescriptor::key).toList();

        assertThat(cles).doesNotHaveDuplicates();
    }

    @Test
    @DisplayName("l'ordre de déclaration est préservé (le pool s'affiche par catégorie)")
    void ordreDeDeclarationPreserve() {
        // L'UI rend le catalogue dans l'ordre reçu, regroupé par catégorie : un tri arbitraire
        // (HashMap) mélangerait les catégories à chaque démarrage.
        List<ConnectorDescriptor> tous = catalogue.all();

        assertThat(tous.get(0).key()).isEqualTo("plane");
        assertThat(tous).extracting(ConnectorDescriptor::key).containsSubsequence("plane", "github", "slack");
    }

    @Test
    @DisplayName("les connecteurs à MCP hébergé officiel portent une URL MCP suggérée (MCP-ready 1-clic)")
    void connecteursMcpReadyOntUneUrlSuggeree() {
        // Set curé (endpoints vérifiés) : URL pré-remplie éditable dans le dialog Connect.
        assertThat(catalogue.byKey("sentry").orElseThrow().mcpSuggestedUrl()).isEqualTo("https://mcp.sentry.dev/mcp");
        assertThat(catalogue.byKey("linear").orElseThrow().mcpSuggestedUrl()).isEqualTo("https://mcp.linear.app/mcp");
        assertThat(catalogue.byKey("cloudflare").orElseThrow().mcpSuggestedUrl()).isNotBlank();
        assertThat(catalogue.byKey("asana").orElseThrow().mcpSuggestedUrl()).isNotBlank();
        assertThat(catalogue.byKey("jira").orElseThrow().mcpSuggestedUrl()).isNotBlank();

        // TF-MCP-05 : lot vérifié par sonde le 03/09/2026 (initialize -> 401 + WWW-Authenticate OAuth).
        assertThat(catalogue.byKey("notion").orElseThrow().mcpSuggestedUrl()).isEqualTo("https://mcp.notion.com/mcp");
        assertThat(catalogue.byKey("stripe").orElseThrow().mcpSuggestedUrl()).isEqualTo("https://mcp.stripe.com");
        assertThat(catalogue.byKey("attio").orElseThrow().mcpSuggestedUrl()).isEqualTo("https://mcp.attio.com/mcp");
        assertThat(catalogue.byKey("hubspot").orElseThrow().mcpSuggestedUrl()).isNotBlank();
        assertThat(catalogue.byKey("paypal").orElseThrow().mcpSuggestedUrl()).isNotBlank();
        assertThat(catalogue.byKey("intercom").orElseThrow().mcpSuggestedUrl()).isNotBlank();
        assertThat(catalogue.byKey("neon").orElseThrow().mcpSuggestedUrl()).isNotBlank();
        assertThat(catalogue.byKey("canva").orElseThrow().mcpSuggestedUrl()).isNotBlank();

        // Un connecteur générique sans MCP hébergé reste en bring-your-own : pas d'URL suggérée,
        // mais il garde la capability "mcp" (l'utilisateur colle l'URL de son propre serveur MCP).
        ConnectorDescriptor docker = catalogue.byKey("docker").orElseThrow();
        assertThat(docker.mcpSuggestedUrl()).isNull();
        assertThat(docker.capabilities()).contains("mcp");
    }

    @Test
    @DisplayName("all() renvoie une copie : modifier le résultat n'altère pas le catalogue")
    void allRenvoieUneCopieDefensive() {
        int tailleInitiale = catalogue.all().size();

        catalogue.all().clear();

        assertThat(catalogue.all()).hasSize(tailleInitiale);
    }

    // ── Recherche par clé ────────────────────────────────────────────────────

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {"plane", "github", "slack", "stripe", "ollama"})
    @DisplayName("byKey retrouve un connecteur déclaré")
    void byKeyRetrouveUnConnecteurDeclare(String cle) {
        assertThat(catalogue.byKey(cle))
            .isPresent()
            .get()
            .extracting(ConnectorDescriptor::key)
            .isEqualTo(cle);
    }

    @Test
    @DisplayName("byKey renvoie vide pour une clé inconnue plutôt que null")
    void byKeyVidePourCleInconnue() {
        assertThat(catalogue.byKey("outil-qui-nexiste-pas")).isEmpty();
    }

    @Test
    @DisplayName("isAvailable distingue un connecteur déclaré d'une clé inconnue")
    void isAvailableDistingueDeclareEtInconnu() {
        assertThat(catalogue.isAvailable("plane")).isTrue();
        assertThat(catalogue.isAvailable("outil-qui-nexiste-pas")).isFalse();
    }

    // ── Champs de connexion déduits du mode d'auth ───────────────────────────

    static Stream<Arguments> champsAttendusParModeAuth() {
        return Stream.of(
            arguments(ConnectorAuthType.API_KEY, List.of("apiKey")),
            arguments(ConnectorAuthType.TOKEN, List.of("token")),
            // Pas d'app OAuth enregistrée pour ces services → token personnel, choix assumé.
            arguments(ConnectorAuthType.OAUTH2, List.of("token")),
            arguments(ConnectorAuthType.CONFIG, List.of("endpoint", "apiKey"))
        );
    }

    @ParameterizedTest(name = "{0} demande {1}")
    @MethodSource("champsAttendusParModeAuth")
    @DisplayName("les champs d'un connecteur générique découlent de son mode d'authentification")
    void champsGeneriquesSelonModeAuth(ConnectorAuthType auth, List<String> clesAttendues) {
        ConnectorDescriptor generique = premierGenerique(auth);

        assertThat(generique.fields())
            .extracting(ConnectorField::key)
            .containsExactlyElementsOf(clesAttendues);
    }

    @ParameterizedTest
    @MethodSource("champsAttendusParModeAuth")
    @DisplayName("chaque connecteur générique porte une aide de configuration")
    void aideDeConfigurationPresente(ConnectorAuthType auth) {
        // Sans app OAuth 1-clic, l'utilisateur doit savoir où récupérer sa clé : l'aide n'est pas
        // décorative, c'est la seule indication qu'il aura.
        assertThat(premierGenerique(auth).setupHint()).isNotBlank();
    }

    // ── Sécurité des champs ──────────────────────────────────────────────────

    @Test
    @DisplayName("tout champ portant un secret est marqué secret (masqué à l'écran, chiffré en base)")
    void lesChampsSensiblesSontMarquesSecret() {
        // Le drapeau `secret` pilote à la fois le masquage UI et le chiffrement au repos : un champ
        // de clé oublié en `text` exposerait un identifiant en clair.
        List<ConnectorField> champsSensibles = catalogue.all().stream()
            .flatMap(d -> d.fields().stream())
            .filter(f -> f.key().toLowerCase().matches(".*(key|token|secret|password).*"))
            .toList();

        assertThat(champsSensibles).isNotEmpty();
        assertThat(champsSensibles).allSatisfy(f -> assertThat(f.secret()).isTrue());
    }

    @Test
    @DisplayName("un endpoint n'est pas un secret : il reste lisible")
    void lEndpointNestPasUnSecret() {
        ConnectorDescriptor config = premierGenerique(ConnectorAuthType.CONFIG);

        assertThat(config.fields())
            .filteredOn(f -> f.key().equals("endpoint"))
            .singleElement()
            .satisfies(f -> assertThat(f.secret()).isFalse());
    }

    @Test
    @DisplayName("tous les champs déclarés sont obligatoires")
    void tousLesChampsSontObligatoires() {
        assertThat(catalogue.all())
            .flatExtracting(ConnectorDescriptor::fields)
            .allMatch(ConnectorField::required, "champ obligatoire");
    }

    // ── Connecteurs réellement implémentés ───────────────────────────────────

    @Test
    @DisplayName("Plane est branchable par clé API et documente sa procédure")
    void planeEstBranchableParCleApi() {
        ConnectorDescriptor plane = catalogue.byKey("plane").orElseThrow();

        assertThat(plane.status()).isEqualTo(ConnectorStatus.AVAILABLE);
        assertThat(plane.authType()).isEqualTo(ConnectorAuthType.API_KEY);
        assertThat(plane.docsUrl()).isNotBlank();
        assertThat(plane.fields())
            .extracting(ConnectorField::key)
            .containsExactly("apiKey", "planeWorkspace");
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {"github", "slack"})
    @DisplayName("les connecteurs OAuth 1-clic ne demandent aucun champ et savent agir")
    void connecteursOauthUnClic(String cle) {
        ConnectorDescriptor d = catalogue.byKey(cle).orElseThrow();

        assertThat(d.authType()).isEqualTo(ConnectorAuthType.OAUTH2);
        // Redirection vers le fournisseur : rien à saisir, donc aucun champ de formulaire.
        assertThat(d.fields()).isEmpty();
        assertThat(d.capabilities()).contains("observe", "act");
        assertThat(d.docsUrl()).isNotBlank();
    }

    @Test
    @DisplayName("les connecteurs génériques observent + sont MCP-connectables, sans « act » écrit à la main")
    void connecteursGeneriquesObserventSeulement() {
        // « act » suppose une intégration écrite à la main (comme GitHub/Slack) : un connecteur
        // générique ne doit jamais l'annoncer. Il porte « mcp » (branchable comme serveur MCP externe,
        // écritures validées humainement) en plus d'« observe » depuis le pont MCP-catalogue.
        assertThat(catalogue.all())
            .filteredOn(d -> d.docsUrl() == null)
            .allSatisfy(d -> assertThat(d.capabilities()).containsExactly("observe", "mcp"));
    }

    // ── Utilitaire ───────────────────────────────────────────────────────────

    /**
     * Premier connecteur <b>générique</b> du mode d'auth demandé. Les trois connecteurs réellement
     * implémentés (Plane, GitHub, Slack) déclarent leurs propres champs et portent une {@code docsUrl} :
     * on les écarte pour n'observer que les valeurs par défaut.
     */
    private ConnectorDescriptor premierGenerique(ConnectorAuthType auth) {
        return catalogue.all().stream()
            .filter(d -> d.authType() == auth && d.docsUrl() == null)
            .findFirst()
            .orElseThrow(() -> new AssertionError("aucun connecteur générique en " + auth));
    }
}
