package com.taskforce.tf_api.core.dto.request;

import lombok.Data;

/** Demande de session Stripe Customer Portal (PROD-4.5). */
@Data
public class PortalSessionRequest {
    /** URL de retour après le portail (optionnel — défaut : front). */
    private String returnUrl;
}
