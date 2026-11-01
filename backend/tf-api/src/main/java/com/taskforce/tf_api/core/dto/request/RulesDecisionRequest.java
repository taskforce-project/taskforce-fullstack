package com.taskforce.tf_api.core.dto.request;

import java.util.List;
import java.util.Map;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Expérience E16 : les faits d'un appel d'outil de Claude Code, tels que le runner les calcule (un par morceau d'une
 * commande composée, aucun pour un outil interne). Le plus strict l'emporte.
 *
 * @param facts les faits, par nom de condition ({@code action}, {@code tool}, {@code command}, {@code path}...)
 */
public record RulesDecisionRequest(
    @NotNull @Size(max = 64)
    List<@NotNull @Size(max = 8) Map<String, String>> facts
) {}
