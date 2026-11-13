package com.taskforce.tf_api.core.service.integration;

import java.util.List;
import java.util.Set;

import com.taskforce.tf_api.core.enums.ConnectionPath;
import com.taskforce.tf_api.core.enums.ConnectorCategory;
import com.taskforce.tf_api.core.enums.ToolClass;

/**
 * Un préréglage de serveur MCP, lu dans {@code connectors/presets.json} (R99 : des données, pas des lignes de Java).
 *
 * @param mcpUrl     le serveur officiel ; nul quand l'entreprise crée le sien ({@link ConnectionPath#SERVER_URL})
 * @param readUrl    l'adresse du même serveur qui n'expose que la lecture, quand l'éditeur en a une ; la lecture
 *                   est le défaut (R158)
 * @param readUrlSource la page publique où l'éditeur écrit que cette adresse ne sert que des outils de lecture, et la
 *                   date de sa lecture ; nulle tant que personne ne l'a lue : les outils de l'adresse gardent alors la
 *                   classe de leur nom
 * @param scopes     les portées strictement utiles, en lecture puis avec l'écriture ; vides = on n'en demande aucune
 * @param admin      l'étape de l'administrateur, en une phrase et un lien ; {@code required} quand rien ne se connecte
 *                   avant elle
 * @param apiKey     la clé guidée, quand l'éditeur en propose une
 * @param readTools  les outils qui ne font que lire ; tout autre outil est une écriture
 * @param tried      la date et la preuve de l'essai de bout en bout ; nul tant que l'outil n'a pas été essayé (il se
 *                   montre quand même : décision de la Présidence, 12/11/2026)
 * @param blocked    pourquoi l'éditeur ferme la porte aujourd'hui (liste d'attente, revue) ; nul sinon
 * @param api        l'API de l'éditeur que TaskForce sert lui-même, sans serveur MCP (Google Drive, Microsoft Graph) ;
 *                   nul pour un serveur MCP
 */
public record ConnectorPreset(
    String key,
    String name,
    ConnectorCategory category,
    String description,
    String website,
    String mcpUrl,
    String readUrl,
    Source readUrlSource,
    ConnectionPath connection,
    Scopes scopes,
    Admin admin,
    ApiKey apiKey,
    Set<String> readTools,
    Set<String> writeTools,
    Tried tried,
    String blocked,
    List<String> sources,
    List<String> unverified,
    Api api
) {

    /**
     * Un outil servi par l'API de son éditeur, par la même connexion qu'un serveur MCP (une par personne, le même geste,
     * le même retour) : l'émetteur OAuth ({@code {tenant}} y est remplacé par le locataire de l'instance), l'adresse de
     * l'API, le préfixe des variables de notre application ({@code TF_GOOGLE} : {@code TF_GOOGLE_CLIENT_ID}...), et les
     * paramètres que l'éditeur attend en plus à l'autorisation (le jeton de renouvellement de Google).
     */
    public record Api(String kind, String issuer, String base, String app, java.util.Map<String, String> authorize) {}

    /** Les portées demandées : la lecture par défaut, l'écriture quand la personne l'accorde. */
    public record Scopes(List<String> read, List<String> write) {
        public static final Scopes NONE = new Scopes(List.of(), List.of());
    }

    /** L'étape de l'administrateur : la phrase à lui envoyer, et le lien de sa page. */
    public record Admin(boolean required, String text, String link) {}

    /** La clé guidée : où la créer, et l'en-tête qui la porte (nul : {@code Authorization: Bearer}). */
    public record ApiKey(String hint, String link, String header) {}

    /** L'essai de bout en bout : sa date et sa preuve. */
    public record Tried(String date, String proof) {}

    /** Une page publique de l'éditeur, et la date (AAAA-MM-JJ) où elle a été lue. */
    public record Source(String page, String checked) {}

    /** La classe d'un outil de ce serveur, par son nom d'origine : lecture s'il est nommé comme tel, écriture sinon. */
    public ToolClass classOf(String tool) {
        return tool != null && readTools.contains(tool) ? ToolClass.READ : ToolClass.WRITE;
    }

    /**
     * La classe d'un outil servi à cette adresse : sur l'adresse de lecture seule que l'éditeur documente comme ne servant
     * que des outils de lecture ({@code readUrlSource}), une lecture, quel que soit son nom ; ailleurs, celle de son nom
     * ({@link #classOf}).
     */
    public ToolClass classAt(String url, String tool) {
        return isDocumentedReadOnly(url) ? ToolClass.READ : classOf(tool);
    }

    /** Cette adresse est-elle l'adresse de lecture seule que l'éditeur documente comme ne servant que des lectures ? */
    public boolean isDocumentedReadOnly(String url) {
        return readUrlSource != null && url != null && readUrl != null && !readUrl.isBlank() && bare(url).equals(bare(readUrl));
    }

    /** Les portées à demander : celles de la lecture, ou celles de l'écriture quand elle est accordée. */
    public List<String> scopesFor(boolean writes) {
        Scopes s = scopes == null ? Scopes.NONE : scopes;
        List<String> chosen = writes ? s.write() : s.read();
        return chosen == null ? List.of() : chosen;
    }

    /** L'adresse à joindre : celle de la lecture seule quand l'éditeur en a une et que l'écriture n'est pas accordée. */
    public String urlFor(boolean writes) {
        return !writes && readUrl != null && !readUrl.isBlank() ? readUrl : mcpUrl;
    }

    /** Le préréglage a-t-il un serveur officiel ? Faux pour un serveur que l'entreprise crée, et pour l'API d'un éditeur. */
    public boolean hasOfficialServer() {
        return mcpUrl != null && !mcpUrl.isBlank();
    }

    /**
     * Cette adresse est-elle le serveur officiel du préréglage, en écriture ou en lecture seule ? Ses classes d'outils et
     * les clients enregistrés pour lui ne valent que là.
     */
    public boolean serves(String url) {
        if (url == null || !hasOfficialServer()) return false;
        String asked = bare(url);
        return asked.equals(bare(mcpUrl)) || (readUrl != null && !readUrl.isBlank() && asked.equals(bare(readUrl)));
    }

    /** Une adresse sans espaces autour ni barres finales. */
    private static String bare(String url) {
        String v = url.strip();
        int end = v.length();
        while (end > 0 && v.charAt(end - 1) == '/') end--;
        return v.substring(0, end);
    }

    /** L'outil a-t-il été essayé de bout en bout ? */
    public boolean isTried() {
        return tried != null;
    }
}
