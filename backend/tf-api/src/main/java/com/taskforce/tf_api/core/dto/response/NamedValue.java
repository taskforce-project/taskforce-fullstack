package com.taskforce.tf_api.core.dto.response;

/** Un point de répartition : un libellé (catégorie) et sa valeur agrégée. */
public record NamedValue(String label, long value) {}
