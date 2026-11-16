package com.taskforce.tf_api.core.dto.response;

import java.time.LocalDateTime;
import java.util.List;

import com.taskforce.tf_api.core.process.ProcessModel;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Les processus tels que les écrans et les agents les lisent (ADR-027) : des données. Les seules phrases sont celles
 * du vérificateur, qui dit pourquoi un processus n'entre pas, et ce que la personne a écrit elle-même.
 */
public final class ProcessResponse {

    private ProcessResponse() {
    }

    /**
     * Les processus d'un projet.
     *
     * @param processes  chacun dans sa version en vigueur
     * @param canPublish la personne peut publier une version (le responsable du projet, un propriétaire ou un admin)
     */
    @Schema(name = "ProcessOverview")
    public record Overview(List<Summary> processes, boolean canPublish) {}

    /** Un processus, dans sa version en vigueur. */
    @Schema(name = "ProcessSummary")
    public record Summary(String key, String name, int version, String digest, String author,
                          LocalDateTime publishedAt, int versions) {}

    /** Un processus : sa version en vigueur, avec son modèle, et toutes ses versions. */
    @Schema(name = "ProcessDetail")
    public record Detail(String key, Version current, List<VersionSummary> versions, boolean canPublish) {}

    /**
     * Une version publiée, avec son modèle (« Show raw » le montre tel quel).
     *
     * @param digest l'empreinte du modèle, {@code sha256:...}
     */
    @Schema(name = "ProcessVersion")
    public record Version(String key, int version, String name, String digest, String author, LocalDateTime publishedAt,
                          String derivedFrom, ProcessModel model) {}

    @Schema(name = "ProcessVersionSummary")
    public record VersionSummary(int version, String name, String digest, String author, LocalDateTime publishedAt) {}

    /** Un refus du vérificateur : son code, l'étape visée (identifiant et nom, ou null), et sa phrase. */
    @Schema(name = "ProcessProblem")
    public record Problem(String code, String stepId, String step, String message) {}

    /**
     * Ce que dit le vérificateur d'un processus.
     *
     * @param passed vrai quand il n'y a aucun refus
     * @param digest l'empreinte que la version aurait
     */
    @Schema(name = "ProcessCheck")
    public record Check(boolean passed, String digest, List<Problem> problems) {}

    /**
     * Ce que donne un fichier BPMN 2.0 : le modèle lu, ses refus, et ce qui a été laissé de côté. Rien n'est publié.
     *
     * @param model le modèle lu ; null quand le fichier ne se lit pas du tout
     * @param notes ce que TaskForce n'a pas gardé (le dessin, les réglages d'un autre outil), en phrases
     */
    @Schema(name = "ProcessImport")
    public record Import(boolean passed, String digest, ProcessModel model, List<Problem> problems, List<String> notes) {}

    /**
     * Ce que devient une publication : la version écrite (201), ou les refus qui l'en empêchent (422). Un seul des deux
     * est rempli.
     */
    @Schema(name = "ProcessPublication")
    public record Publication(Version version, Check refused) {}

    /** Un workflow par défaut (ADR-027, point 9), publié avec le code. */
    @Schema(name = "ProcessDefault")
    public record Default(String key, String name, String description, String digest, ProcessModel model) {}
}
