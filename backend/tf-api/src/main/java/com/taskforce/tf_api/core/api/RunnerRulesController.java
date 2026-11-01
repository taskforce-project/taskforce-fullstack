package com.taskforce.tf_api.core.api;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.taskforce.tf_api.core.dto.request.RulesDecisionRequest;
import com.taskforce.tf_api.core.dto.response.RulesDecisionResponse;
import com.taskforce.tf_api.core.harness.rules.RulesDecisionService;
import com.taskforce.tf_api.core.harness.rules.RulesEngine;
import com.taskforce.tf_api.core.service.delivery.LocalRunnerSettings;
import com.taskforce.tf_api.core.service.delivery.RunnerIdentityResolver;
import com.taskforce.tf_api.shared.dto.ApiResponse;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

/**
 * Expérience E16 (R90 à l'essai) : le runner demande la décision des règles au backend de la machine, au lieu de la
 * prendre lui-même. Endpoint machine, authentifié comme les autres routes du runner ({@link DeliveryRunnerController}),
 * sur la branche d'expérience seulement : il sert à mesurer l'aller-retour, il n'est pas fusionné.
 */
@RestController
@RequestMapping("/api/delivery/runner/rules")
@ConditionalOnProperty(name = LocalRunnerSettings.ENABLED_PROPERTY, havingValue = "true")
@RequiredArgsConstructor
public class RunnerRulesController {

    private final RulesDecisionService decisions;
    private final RunnerIdentityResolver identityResolver;

    /**
     * POST /api/delivery/runner/rules/decide : la décision pour les faits d'un appel d'outil. Comme sur les autres
     * routes du runner, son identité est vérifiée avant tout.
     */
    @PostMapping("/decide")
    public ResponseEntity<ApiResponse<RulesDecisionResponse>> decide(
        @AuthenticationPrincipal Jwt jwt,
        @Valid @RequestBody RulesDecisionRequest request
    ) {
        identityResolver.resolve(jwt);
        RulesEngine.Decision decision = decisions.decide(request.facts());
        var rule = decision.rule();
        return ResponseEntity.ok(ApiResponse.success("Decision", new RulesDecisionResponse(
            decision.effect(),
            rule == null ? null : rule.id(),
            rule == null ? null : rule.reason(),
            rule == null ? null : rule.actionClass())));
    }
}
