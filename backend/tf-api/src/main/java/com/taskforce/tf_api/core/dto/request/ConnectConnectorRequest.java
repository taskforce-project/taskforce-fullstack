package com.taskforce.tf_api.core.dto.request;

import java.util.Map;

import lombok.Data;

/**
 * Connexion générique d'un connecteur du catalogue : la carte des champs déclarés
 * (clé → valeur), telle que remplie par l'utilisateur. Les champs requis sont validés côté service
 * contre le descripteur du connecteur.
 */
@Data
public class ConnectConnectorRequest {

    private Map<String, String> config;
}
