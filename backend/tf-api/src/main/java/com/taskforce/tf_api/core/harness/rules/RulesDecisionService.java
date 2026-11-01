package com.taskforce.tf_api.core.harness.rules;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.List;
import java.util.Map;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskforce.tf_api.core.service.delivery.LocalRunnerSettings;

/**
 * Expérience E16 (R90 à l'essai) : la décision d'une action de Claude Code demandée au backend de la machine au lieu
 * du moteur du runner. Les faits arrivent tels que le runner les calcule ({@code toolFacts}) ; la décision sort du
 * même moteur que Cortex. Le paquet est la table par défaut, chargée une fois : celle que reçoit un espace sans règles
 * écrites, et celle des cas partagés. Prototype de mesure, pas de chaîne de preuve ni de paquet par mission.
 */
@Service
@ConditionalOnProperty(name = LocalRunnerSettings.ENABLED_PROPERTY, havingValue = "true")
public class RulesDecisionService {

    private final RulesBundle bundle;

    public RulesDecisionService() {
        try (InputStream in = new ClassPathResource(HarnessRulesService.DEFAULT_RESOURCE).getInputStream()) {
            this.bundle = new ObjectMapper().readValue(in, RulesBundle.class);
        } catch (IOException e) {
            throw new UncheckedIOException("Default harness rules missing: " + HarnessRulesService.DEFAULT_RESOURCE, e);
        }
    }

    public RulesEngine.Decision decide(List<Map<String, String>> factsList) {
        return RulesEngine.decideAll(bundle, factsList);
    }
}
