package com.taskforce.tf_api.core.service.agent;

import java.time.LocalDate;
import java.util.List;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.harness.evidence.CanonicalJson;

/**
 * Un cas de la banque d'évaluations, figé : la question, sa date, les notes servies ce jour-là, et ce
 * que les outils de lecture ont rendu (la cassette). Le rejeu ne sert rien d'autre au modèle.
 */
public record ReplayCase(String question, LocalDate askedOn, List<FrozenNote> notes, List<CassetteEntry> cassette) {

    private static final ObjectMapper JSON = new ObjectMapper();

    public ReplayCase {
        notes = notes == null ? List.of() : List.copyOf(notes);
        cassette = cassette == null ? List.of() : List.copyOf(cassette);
    }

    /** Une note servie à la question, telle qu'elle était. */
    public record FrozenNote(String title, String domain, String content) {
    }

    /** Une lecture faite à l'époque : l'outil, ses arguments en JSON canonique, ce qu'il a rendu. */
    public record CassetteEntry(String tool, String arguments, String output) {
    }

    /** Les arguments d'un appel en JSON canonique : deux appels identiques se reconnaissent, quel que soit l'ordre des clés. */
    public static String canonical(String argsJson) {
        if (argsJson == null || argsJson.isBlank()) return "{}";
        try {
            return CanonicalJson.of(JSON.readTree(argsJson));
        } catch (JsonProcessingException | IllegalArgumentException unreadable) {
            return argsJson.strip();
        }
    }

    /** Ce que la cassette a rendu pour cet appel, s'il a été fait à l'époque. */
    public String served(String tool, String argsJson) {
        String wanted = canonical(argsJson);
        return cassette.stream()
            .filter(entry -> entry.tool().equals(tool) && entry.arguments().equals(wanted))
            .map(CassetteEntry::output)
            .findFirst()
            .orElse(null);
    }
}
