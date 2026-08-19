package com.taskforce.tf_api.core.service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.dto.request.CreateDashboardCardRequest;
import com.taskforce.tf_api.core.dto.request.UpdateDashboardCardRequest;
import com.taskforce.tf_api.core.dto.response.DashboardCardResponse;
import com.taskforce.tf_api.core.model.DashboardCard;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.DashboardCardRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.service.brain.BrainAccessGuard;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;

/**
 * Cartes de dashboard épinglées, par UTILISATEUR et par WORKSPACE : chaque membre compose son
 * dashboard. Au premier accès (aucune carte), les 4 cartes par défaut sont créées et persistées
 * (bootstrap persistant — donc supprimables ensuite). On ne stocke que la config, jamais de données.
 */
@Service
@RequiredArgsConstructor
public class DashboardCardService {

    /** Les 4 cartes du dashboard par défaut, dans l'ordre d'affichage (positions 0..3). */
    private static final List<String> DEFAULT_CARD_TYPES =
        List.of("ops-health", "throughput", "needs-attention", "ai-usage");

    private final BrainAccessGuard        access;
    private final DashboardCardRepository repository;
    private final UserRepository          userRepository;

    @Transactional
    public List<DashboardCardResponse> list(String slug, Long userId) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        List<DashboardCard> cards = repository.findByWorkspaceIdAndUserIdOrderByPositionAsc(ws.getId(), userId);
        if (cards.isEmpty()) {
            cards = bootstrapDefaults(ws, userId);
        }
        return cards.stream().map(this::toResponse).toList();
    }

    @Transactional
    public DashboardCardResponse create(String slug, Long userId, CreateDashboardCardRequest request) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        int position = repository.findTopByWorkspaceIdAndUserIdOrderByPositionDesc(ws.getId(), userId)
            .map(last -> last.getPosition() + 1)
            .orElse(0);
        DashboardCard card = DashboardCard.builder()
            .workspace(ws)
            .user(requireUser(userId))
            .cardType(request.getCardType().trim())
            .title(request.getTitle())
            .config(request.getConfig() != null ? request.getConfig() : new HashMap<>())
            .timeRange(request.getTimeRange())
            .position(position)
            .build();
        return toResponse(repository.save(card));
    }

    @Transactional
    public DashboardCardResponse update(String slug, Long userId, Long cardId, UpdateDashboardCardRequest request) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        DashboardCard card = requireCard(cardId, ws.getId(), userId);
        if (request.getTitle() != null) {
            card.setTitle(request.getTitle());
        }
        if (request.getConfig() != null) {
            card.setConfig(request.getConfig());
        }
        if (request.getTimeRange() != null) {
            card.setTimeRange(request.getTimeRange());
        }
        return toResponse(repository.save(card));
    }

    @Transactional
    public List<DashboardCardResponse> reorder(String slug, Long userId, List<Long> orderedIds) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        List<DashboardCard> cards = repository.findByWorkspaceIdAndUserIdOrderByPositionAsc(ws.getId(), userId);
        Map<Long, DashboardCard> byId = cards.stream()
            .collect(Collectors.toMap(DashboardCard::getId, Function.identity()));
        // Réécrit les positions 0..n dans l'ordre demandé ; les ids inconnus (carte supprimée
        // entre-temps ou étrangère) sont simplement ignorés.
        int position = 0;
        for (Long id : orderedIds) {
            DashboardCard card = byId.get(id);
            if (card != null) {
                card.setPosition(position++);
            }
        }
        repository.saveAll(cards);
        return cards.stream()
            .sorted((a, b) -> Integer.compare(a.getPosition(), b.getPosition()))
            .map(this::toResponse).toList();
    }

    @Transactional
    public void delete(String slug, Long userId, Long cardId) {
        Workspace ws = access.resolveAndAuthorize(slug, userId);
        repository.delete(requireCard(cardId, ws.getId(), userId));
    }

    // -------------------------------------------------------------------------

    /** Crée et persiste les 4 cartes par défaut du dashboard (positions 0..3). */
    private List<DashboardCard> bootstrapDefaults(Workspace ws, Long userId) {
        User user = requireUser(userId);
        List<DashboardCard> defaults = new ArrayList<>();
        for (int i = 0; i < DEFAULT_CARD_TYPES.size(); i++) {
            defaults.add(DashboardCard.builder()
                .workspace(ws)
                .user(user)
                .cardType(DEFAULT_CARD_TYPES.get(i))
                .config(new HashMap<>())
                .position(i)
                .build());
        }
        return repository.saveAll(defaults);
    }

    private DashboardCard requireCard(Long cardId, Long workspaceId, Long userId) {
        return repository.findByIdAndWorkspaceIdAndUserId(cardId, workspaceId, userId)
            .orElseThrow(() -> new ResourceNotFoundException("Carte de dashboard introuvable: " + cardId));
    }

    private User requireUser(Long userId) {
        return userRepository.findById(userId)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));
    }

    private DashboardCardResponse toResponse(DashboardCard card) {
        return new DashboardCardResponse(
            card.getId(),
            card.getCardType(),
            card.getTitle(),
            card.getConfig(),
            card.getTimeRange(),
            card.getPosition()
        );
    }
}
