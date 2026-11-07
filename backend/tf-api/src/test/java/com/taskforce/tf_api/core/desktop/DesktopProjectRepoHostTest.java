package com.taskforce.tf_api.core.desktop;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;

import com.taskforce.tf_api.core.service.GitHubTokenSource;
import com.taskforce.tf_api.shared.exception.BusinessException;

@DisplayName("DesktopProjectRepoHost : le dépôt d'un projet passe par le GitHub CLI de la personne")
@SuppressWarnings("unchecked")
class DesktopProjectRepoHostTest {

    private final GitHubTokenSource tokens = mock(GitHubTokenSource.class);
    private final RestTemplate rest = mock(RestTemplate.class);
    private final DesktopProjectRepoHost host = new DesktopProjectRepoHost(tokens, rest);

    @Test
    @DisplayName("lier un dépôt ne demande pas l'intégration GitHub de l'espace : la coque a vérifié l'accès avec gh")
    void linking_needs_no_workspace_integration() {
        assertThatCode(() -> host.assertRepoAccessible("acme", "acme/website")).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("le backend ne crée pas de dépôt : la coque le crée avec gh, puis le lie")
    void creating_happens_on_this_computer() {
        assertThatThrownBy(() -> host.createRepo("acme", "website", true))
            .isInstanceOf(BusinessException.class)
            .hasMessage(DesktopProjectRepoHost.CREATED_ON_THIS_COMPUTER);
        assertThat(host.createsRepos("acme")).isFalse();
        assertThat(host.linksRepos("acme")).isTrue();
    }

    /**
     * Test du CEO du 05/11/2026 : la carte du dépôt n'offrait qu'« aucun dépôt ». Les dépôts proposés sont les siens, lus
     * avec le jeton de son gh, par la requête de la coque, les derniers où il a poussé d'abord.
     */
    @Test
    @DisplayName("les dépôts de la personne, lus avec le jeton de son gh, comme la coque les liste")
    void the_person_s_repositories_come_from_their_gh() {
        when(tokens.token(null)).thenReturn(Optional.of("gho_person"));
        when(rest.exchange(eq(DesktopProjectRepoHost.REPOS), eq(HttpMethod.GET), any(HttpEntity.class),
                any(ParameterizedTypeReference.class)))
            .thenReturn(ResponseEntity.ok(List.of(Map.of("full_name", "Miche1-Pierre/test-taskforce"),
                Map.of("full_name", "acme/site"), Map.of("full_name", "not a repo"), Map.of("name", "nameless"))));

        assertThat(host.recentRepos("acme", 10)).containsExactly("Miche1-Pierre/test-taskforce", "acme/site");
        assertThat(host.recentRepos("acme", 1)).containsExactly("Miche1-Pierre/test-taskforce");

        ArgumentCaptor<HttpEntity<Void>> request = ArgumentCaptor.forClass(HttpEntity.class);
        org.mockito.Mockito.verify(rest, org.mockito.Mockito.atLeastOnce()).exchange(eq(DesktopProjectRepoHost.REPOS),
            eq(HttpMethod.GET), request.capture(), any(ParameterizedTypeReference.class));
        assertThat(request.getValue().getHeaders().getFirst("Authorization")).isEqualTo("Bearer gho_person");
        assertThat(DesktopProjectRepoHost.REPOS).contains("sort=pushed").contains("affiliation=owner,collaborator,organization_member");
    }

    @Test
    @DisplayName("sans connexion à GitHub sur cet ordinateur, ou GitHub injoignable : aucun dépôt, la réponse libre reste")
    void without_github_no_repository_is_offered() {
        when(tokens.token(null)).thenReturn(Optional.empty());
        assertThat(host.recentRepos("acme", 10)).isEmpty();
        verify(rest, never()).exchange(any(String.class), any(HttpMethod.class), any(HttpEntity.class),
            any(ParameterizedTypeReference.class));

        when(tokens.token(null)).thenReturn(Optional.of("gho_person"));
        when(rest.exchange(eq(DesktopProjectRepoHost.REPOS), eq(HttpMethod.GET), any(HttpEntity.class),
                any(ParameterizedTypeReference.class)))
            .thenThrow(new ResourceAccessException("GitHub unreachable"));
        assertThat(host.recentRepos("acme", 10)).isEmpty();
    }
}
