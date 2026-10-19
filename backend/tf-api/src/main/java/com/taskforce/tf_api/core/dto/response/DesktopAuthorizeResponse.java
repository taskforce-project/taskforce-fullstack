package com.taskforce.tf_api.core.dto.response;

/** Adresse de retour de l'app desktop, avec le code d'autorisation et sa valeur {@code state}. */
public record DesktopAuthorizeResponse(String redirectUrl) {}
