package com.taskforce.tf_api.core.service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Stream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

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

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Tests unitaires — {@link DashboardCardService}, cartes de dashboard par (user, workspace).
 *
 * <p>Garanties : (1) le premier accès bootstrappe les 4 cartes par défaut, jamais quand il en
 * existe déjà ; (2) une création s'ajoute en fin de liste ; (3) l'update est partiel (null =
 * inchangé) ; (4) le reorder réécrit les positions 0..n et ignore les ids inconnus ; (5) une carte
 * hors scope (autre user / autre workspace) est introuvable (404).
 */
@ExtendWith(MockitoExtension.class)
class DashboardCardServiceTest {

    private static final Long WS_ID   = 1L;
    private static final Long USER_ID = 10L;

    @Mock  private BrainAccessGuard        access;
    @Mock  private DashboardCardRepository repository;
    @Mock  private UserRepository          userRepository;
    @InjectMocks private DashboardCardService service;

    private User user;

    @BeforeEach
    void setUp() {
        Workspace ws = mock(Workspace.class);
        lenient().when(ws.getId()).thenReturn(WS_ID);
        lenient().when(access.resolveAndAuthorize(anyString(), any())).thenReturn(ws);

        user = mock(User.class);
        lenient().when(userRepository.findById(USER_ID)).thenReturn(Optional.of(user));

        // Le repository renvoie ce qu'on lui donne (les ids restent ceux posés par les builders).
        lenient().when(repository.save(any(DashboardCard.class))).thenAnswer(inv -> inv.getArgument(0));
        lenient().when(repository.saveAll(any())).thenAnswer(inv -> inv.getArgument(0));
    }

    // ── Bootstrap des cartes par défaut ───────────────────────────────────────

    @ParameterizedTest(name = "{0} carte(s) existante(s) → {1} carte(s) renvoyée(s), bootstrap = {2}")
    @CsvSource({
        "0, 4, true",
        "1, 1, false",
        "3, 3, false",
    })
    @DisplayName("le bootstrap ne crée les cartes par défaut que si le dashboard est vide")
    void bootstrapOnlyWhenEmpty(int existingCount, int expectedCount, boolean expectBootstrap) {
        List<DashboardCard> existing = new ArrayList<>();
        for (int i = 0; i < existingCount; i++) {
            existing.add(card((long) (i + 1), "throughput", i));
        }
        when(repository.findByWorkspaceIdAndUserIdOrderByPositionAsc(WS_ID, USER_ID)).thenReturn(existing);

        List<DashboardCardResponse> cards = service.list("demo", USER_ID);

        assertThat(cards).hasSize(expectedCount);
        if (expectBootstrap) {
            verify(repository).saveAll(any());
        } else {
            verify(repository, never()).saveAll(any());
        }
    }

    @Test
    @DisplayName("le bootstrap crée les 4 cartes par défaut dans l'ordre, positions 0..3")
    void bootstrapCreatesTheFourDefaults() {
        when(repository.findByWorkspaceIdAndUserIdOrderByPositionAsc(WS_ID, USER_ID)).thenReturn(List.of());

        List<DashboardCardResponse> cards = service.list("demo", USER_ID);

        assertThat(cards).extracting(DashboardCardResponse::cardType)
            .containsExactly("ops-health", "throughput", "needs-attention", "ai-usage");
        assertThat(cards).extracting(DashboardCardResponse::position).containsExactly(0, 1, 2, 3);
        assertThat(cards).allSatisfy(c -> assertThat(c.config()).isEmpty());
    }

    // ── Création (en fin de liste) ────────────────────────────────────────────

    @ParameterizedTest(name = "dernière position {0} → nouvelle carte en position {1}")
    @CsvSource({
        "  , 0",   // dashboard vide
        "0 , 1",
        "3 , 4",
    })
    @DisplayName("une création s'ajoute toujours en fin de liste (max + 1)")
    void createAppendsAtEnd(Integer lastPosition, int expectedPosition) {
        Optional<DashboardCard> last = lastPosition == null
            ? Optional.empty()
            : Optional.of(card(99L, "throughput", lastPosition));
        when(repository.findTopByWorkspaceIdAndUserIdOrderByPositionDesc(WS_ID, USER_ID)).thenReturn(last);

        CreateDashboardCardRequest request = new CreateDashboardCardRequest();
        request.setCardType("burndown");

        DashboardCardResponse created = service.create("demo", USER_ID, request);

        assertThat(created.cardType()).isEqualTo("burndown");
        assertThat(created.position()).isEqualTo(expectedPosition);
        assertThat(created.config()).isEmpty();   // config absente → {}
    }

    // ── Mise à jour partielle (null = inchangé) ───────────────────────────────

    @ParameterizedTest(name = "title={0}, timeRange={1} → title={2}, timeRange={3}")
    @CsvSource({
        "Mon titre,     , Mon titre, 30d",   // timeRange null → inchangé
        "         , 90d , Ancien   , 90d",   // title null → inchangé
        "Nouveau  , 7d  , Nouveau  , 7d",
    })
    @DisplayName("l'update est partiel : seuls les champs non null sont modifiés")
    void updateIsPartial(String newTitle, String newTimeRange, String expectedTitle, String expectedTimeRange) {
        DashboardCard card = card(5L, "throughput", 0);
        card.setTitle("Ancien");
        card.setTimeRange("30d");
        when(repository.findByIdAndWorkspaceIdAndUserId(5L, WS_ID, USER_ID)).thenReturn(Optional.of(card));

        UpdateDashboardCardRequest request = new UpdateDashboardCardRequest();
        request.setTitle(newTitle);
        request.setTimeRange(newTimeRange);

        DashboardCardResponse updated = service.update("demo", USER_ID, 5L, request);

        assertThat(updated.title()).isEqualTo(expectedTitle);
        assertThat(updated.timeRange()).isEqualTo(expectedTimeRange);
        assertThat(updated.cardType()).isEqualTo("throughput");   // jamais modifié par l'update
    }

    @Test
    @DisplayName("l'update remplace la config quand elle est fournie")
    void updateReplacesConfig() {
        DashboardCard card = card(5L, "ai-chart", 0);
        when(repository.findByIdAndWorkspaceIdAndUserId(5L, WS_ID, USER_ID)).thenReturn(Optional.of(card));

        UpdateDashboardCardRequest request = new UpdateDashboardCardRequest();
        request.setConfig(Map.of("size", "2"));

        DashboardCardResponse updated = service.update("demo", USER_ID, 5L, request);

        assertThat(updated.config()).containsEntry("size", "2");
    }

    // ── Réordonnancement ──────────────────────────────────────────────────────

    @ParameterizedTest(name = "ordre demandé {1} → positions {2}")
    @MethodSource("reorderCases")
    @DisplayName("le reorder réécrit les positions 0..n dans l'ordre demandé, ids inconnus ignorés")
    void reorderRewritesPositions(List<Long> cardIds, List<Long> orderedIds, List<Long> expectedOrder) {
        List<DashboardCard> cards = new ArrayList<>();
        for (int i = 0; i < cardIds.size(); i++) {
            cards.add(card(cardIds.get(i), "throughput", i));
        }
        when(repository.findByWorkspaceIdAndUserIdOrderByPositionAsc(WS_ID, USER_ID)).thenReturn(cards);

        List<DashboardCardResponse> reordered = service.reorder("demo", USER_ID, orderedIds);

        assertThat(reordered).extracting(DashboardCardResponse::id).containsExactlyElementsOf(expectedOrder);
        verify(repository).saveAll(any());
    }

    static Stream<Arguments> reorderCases() {
        return Stream.of(
            // Permutation complète : les positions suivent exactement la liste.
            Arguments.of(List.of(1L, 2L, 3L), List.of(3L, 1L, 2L), List.of(3L, 1L, 2L)),
            // Id inconnu (99) : ignoré, les autres prennent 0..n.
            Arguments.of(List.of(1L, 2L, 3L), List.of(99L, 2L, 1L, 3L), List.of(2L, 1L, 3L)),
            // Liste vide : rien ne bouge.
            Arguments.of(List.of(1L, 2L), List.of(), List.of(1L, 2L))
        );
    }

    // ── Suppression + scope propriétaire ──────────────────────────────────────

    @Test
    @DisplayName("la suppression retire la carte de SON propriétaire")
    void deleteRemovesOwnCard() {
        DashboardCard card = card(5L, "ai-usage", 0);
        when(repository.findByIdAndWorkspaceIdAndUserId(5L, WS_ID, USER_ID)).thenReturn(Optional.of(card));

        service.delete("demo", USER_ID, 5L);

        verify(repository).delete(card);
    }

    @Test
    @DisplayName("une carte hors scope (autre user / autre workspace) est introuvable → 404")
    void outOfScopeCardIsNotFound() {
        when(repository.findByIdAndWorkspaceIdAndUserId(anyLong(), anyLong(), anyLong()))
            .thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.delete("demo", USER_ID, 42L))
            .isInstanceOf(ResourceNotFoundException.class)
            .hasMessageContaining("42");
    }

    // ── Helper ────────────────────────────────────────────────────────────────

    private DashboardCard card(Long id, String cardType, int position) {
        return DashboardCard.builder()
            .id(id)
            .user(user)
            .cardType(cardType)
            .position(position)
            .build();
    }
}
