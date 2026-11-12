package com.taskforce.tf_api.core.harness.rules;

import java.util.regex.Pattern;

/**
 * Le fait {@code secret} du socle (R157 : aucun secret ne sort) : un texte qui part (une commande, une adresse, les
 * arguments d'un outil) porte-t-il un secret ? Les formats reconnus sont ceux dont la forme suffit à dire que c'est un
 * secret : les jetons de TaskForce, de GitHub, GitLab, Slack, des fournisseurs de modèles, de Stripe, d'AWS, de Google,
 * de npm, de Hugging Face, de Linear et de Notion, une clé privée, un jeton de session (JWT). Code déterministe, compilé
 * en JavaScript avec le moteur : le runner et le serveur voient les mêmes secrets.
 *
 * <p>Ce qui n'a pas de forme reconnaissable (un mot de passe, une clé maison) n'est pas vu ici : ce fait-là reste à
 * produire par qui connaît les secrets de l'espace.</p>
 */
public final class SecretScan {

    private static final Pattern SECRET = Pattern.compile(String.join("|",
        "\\btf[adpr]_[A-Za-z0-9_-]{40,}",                        // jetons de TaskForce (personnel, desktop, runner)
        "\\bwhsec_[A-Za-z0-9_-]{30,}",                           // secret de signature d'un webhook
        "\\bgh[pousr]_[A-Za-z0-9]{36,}",                         // GitHub
        "\\bgithub_pat_[A-Za-z0-9_]{50,}",                       // GitHub, jeton à grain fin
        "\\bglpat-[A-Za-z0-9_-]{20,}",                           // GitLab
        "\\bxox[abposr]-[A-Za-z0-9-]{10,}",                      // Slack
        "\\bsk-[A-Za-z0-9_-]{32,}",                              // OpenAI, Anthropic (sk-ant-...) et compatibles
        "\\bgsk_[A-Za-z0-9]{40,}",                               // Groq
        "\\b(?:sk|rk)_live_[A-Za-z0-9]{20,}",                    // Stripe, clés de production
        "\\bAKIA[0-9A-Z]{16}\\b",                                // AWS, identifiant de clé d'accès
        "\\bAIza[0-9A-Za-z_-]{35}",                              // Google, clé d'API
        "\\bnpm_[A-Za-z0-9]{36}",                                // npm
        "\\bhf_[A-Za-z0-9]{34,}",                                // Hugging Face
        "\\blin_api_[A-Za-z0-9]{40}",                            // Linear
        "\\b(?:secret|ntn)_[A-Za-z0-9]{40,}",                    // Notion
        "-----BEGIN [A-Z ]*PRIVATE KEY-----",                    // clé privée
        "\\beyJ[A-Za-z0-9_-]{10,}\\.eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}")); // jeton de session (JWT)

    private SecretScan() {
    }

    /** Vrai quand le texte porte au moins un secret d'un format reconnu. */
    public static boolean in(String text) {
        return text != null && !text.isEmpty() && SECRET.matcher(text).find();
    }
}
