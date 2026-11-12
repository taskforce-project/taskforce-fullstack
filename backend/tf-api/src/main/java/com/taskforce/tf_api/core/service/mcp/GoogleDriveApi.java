package com.taskforce.tf_api.core.service.mcp;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

import org.springframework.stereotype.Component;

import com.fasterxml.jackson.databind.JsonNode;
import com.taskforce.tf_api.shared.exception.BusinessException;

import lombok.RequiredArgsConstructor;

/**
 * L'API de Google Drive (v3), avec la portée {@code drive.file} (séance n°22, R154) : TaskForce n'atteint que les fichiers
 * que la personne a choisis dans le sélecteur de Google, et ceux qu'il a lui-même rangés. Pas de portée restreinte, donc
 * pas d'évaluation de sécurité chez Google. Chaque appel porte le jeton de la personne : ses droits, rien de plus.
 */
@Component
@RequiredArgsConstructor
public class GoogleDriveApi {

    public static final String FOLDER = "application/vnd.google-apps.folder";
    private static final String DOC = "application/vnd.google-apps.document";
    private static final String SHEET = "application/vnd.google-apps.spreadsheet";
    private static final String SLIDES = "application/vnd.google-apps.presentation";
    private static final String FIELDS = "id,name,mimeType,modifiedTime,version,webViewLink,size,"
        + "owners(displayName,emailAddress),lastModifyingUser(displayName),capabilities(canAddChildren)";
    private static final Pattern ID = Pattern.compile("[A-Za-z0-9_-]{1,200}");

    private final CompanyApiHttp http;

    /** Un fichier ou un dossier, tel que Drive le décrit : de quoi le citer (version, responsable, date) et l'ouvrir. */
    public record DriveFile(String id, String name, String mimeType, String modifiedTime, String version,
                            String webViewLink, Long size, String owner, String lastModifiedBy, boolean canAddChildren) {

        public boolean folder() {
            return FOLDER.equals(mimeType);
        }
    }

    /** Les fichiers que TaskForce peut lire, par leur nom ou leur texte ; les plus récents quand rien n'est cherché. */
    public List<DriveFile> search(String base, String token, String query) {
        String text = query == null ? "" : query.strip();
        String q = "trashed = false and mimeType != '" + FOLDER + "'"
            + (text.isEmpty() ? "" : " and (name contains '" + quote(text) + "' or fullText contains '" + quote(text) + "')");
        // Drive refuse un tri avec fullText : la pertinence décide alors.
        String url = base + "/drive/v3/files?pageSize=10&supportsAllDrives=true&includeItemsFromAllDrives=true"
            + (text.isEmpty() ? "&orderBy=" + enc("modifiedTime desc") : "")
            + "&fields=" + enc("files(" + FIELDS + ")") + "&q=" + enc(q);
        List<DriveFile> out = new ArrayList<>();
        for (JsonNode f : http.getJson(url, token).path("files")) out.add(file(f));
        return out;
    }

    public DriveFile file(String base, String token, String fileId) {
        return file(http.getJson(base + "/drive/v3/files/" + id(fileId) + "?supportsAllDrives=true&fields=" + enc(FIELDS),
            token));
    }

    /** Un dossier où la personne peut ajouter des fichiers. */
    public DriveFile folder(String base, String token, String folderId) {
        DriveFile f = file(base, token, folderId);
        if (!f.folder()) throw new BusinessException("This is a file, not a folder. Choose a folder.");
        if (!f.canAddChildren()) throw new BusinessException("You can't add files to this folder. Choose another one.");
        return f;
    }

    /**
     * Le texte d'un fichier, lu à l'instant : un document, une feuille (la première, en CSV) ou une présentation de
     * Google, un fichier texte, un document Word ou PowerPoint.
     */
    public String text(String base, String token, DriveFile f, int maxChars) {
        String url = base + "/drive/v3/files/" + id(f.id());
        byte[] bytes;
        if (DOC.equals(f.mimeType()) || SLIDES.equals(f.mimeType())) {
            bytes = http.getBytes(url + "/export?mimeType=" + enc("text/plain"), token, CompanyApiHttp.MAX_BYTES);
        } else if (SHEET.equals(f.mimeType())) {
            bytes = http.getBytes(url + "/export?mimeType=" + enc("text/csv"), token, CompanyApiHttp.MAX_BYTES);
        } else if (textual(f.mimeType())) {
            bytes = http.getBytes(url + "?alt=media&supportsAllDrives=true", token, CompanyApiHttp.MAX_BYTES);
        } else if (OfficeText.readable(f.mimeType(), f.name())) {
            return OfficeText.extract(http.getBytes(url + "?alt=media&supportsAllDrives=true", token,
                CompanyApiHttp.MAX_BYTES), f.mimeType(), f.name(), maxChars);
        } else {
            throw new BusinessException("TaskForce can't read this kind of file yet (" + f.name() + "): open it in Google Drive.");
        }
        String s = new String(bytes, StandardCharsets.UTF_8);
        return s.length() > maxChars ? s.substring(0, maxChars) : s;
    }

    /** Range un fichier dans un dossier ; Drive garde un fichier du même nom à côté, sans le remplacer. */
    public DriveFile upload(String base, String token, String folderId, String name, String mediaType, byte[] content) {
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("name", name);
        metadata.put("parents", List.of(id(folderId)));
        metadata.put("mimeType", mediaType);
        return file(http.postRelated(base + "/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields="
            + enc(FIELDS), token, metadata, content, mediaType));
    }

    // -------------------------------------------------------------------------

    static boolean textual(String mimeType) {
        if (mimeType == null) return false;
        return mimeType.startsWith("text/") || mimeType.equals("application/json") || mimeType.equals("application/xml")
            || mimeType.equals("application/x-yaml");
    }

    private static DriveFile file(JsonNode f) {
        JsonNode owner = f.path("owners").path(0);
        String ownerName = owner.path("displayName").asText(null);
        if (ownerName == null) ownerName = owner.path("emailAddress").asText(null);
        return new DriveFile(f.path("id").asText(null), f.path("name").asText(null), f.path("mimeType").asText(null),
            f.path("modifiedTime").asText(null), f.path("version").asText(null), f.path("webViewLink").asText(null),
            f.hasNonNull("size") ? f.path("size").asLong() : null, ownerName,
            f.path("lastModifyingUser").path("displayName").asText(null),
            f.path("capabilities").path("canAddChildren").asBoolean(false));
    }

    /** Un identifiant de Drive, jamais un chemin : rien d'autre que ses lettres, ses chiffres, - et _. */
    static String id(String raw) {
        String v = raw == null ? "" : raw.strip();
        if (!ID.matcher(v).matches()) throw new BusinessException("This isn't a Google Drive file.");
        return v;
    }

    /** Une chaîne de la requête de Drive : la barre oblique inverse et l'apostrophe échappées. */
    static String quote(String s) {
        return s.replace("\\", "\\\\").replace("'", "\\'");
    }

    private static String enc(String s) {
        return URLEncoder.encode(s, StandardCharsets.UTF_8);
    }
}
