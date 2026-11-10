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
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
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

    /** Ce que GitHub dit du jeton : ses droits sont dans l'en-tête ; un jeton à droits fins n'y dit rien. */
    private void githubSays(String scopes) {
        org.springframework.http.ResponseEntity.BodyBuilder reply = ResponseEntity.ok();
        if (scopes != null) reply = reply.header(DesktopProjectRepoHost.SCOPES, scopes);
        when(rest.exchange(eq(DesktopProjectRepoHost.USER), eq(HttpMethod.GET), any(HttpEntity.class),
                any(ParameterizedTypeReference.class)))
            .thenReturn(reply.body(Map.of("login", "me")));
    }

    /** Test du CEO du 09/11/2026 : un nouveau dépôt ne se propose que si le gh de la personne peut vraiment le créer (R15). */
    @ParameterizedTest(name = "droits « {0} » : crée {1}")
    @CsvSource(nullValues = "-", value = {"'gist, read:org, repo, workflow', true", "'read:org, public_repo', false", "-, false"})
    void a_new_repository_is_offered_when_gh_can_create_it(String scopes, boolean creates) {
        when(tokens.token(null)).thenReturn(Optional.of("gho_person"));
        githubSays(scopes);

        assertThat(host.createsRepos("acme")).isEqualTo(creates);
        assertThat(host.linksRepos("acme")).isTrue();
    }

    @Test
    @DisplayName("les droits du jeton se lisent une fois le temps d'une carte ; sans gh ni GitHub, pas de promesse")
    void the_scopes_are_read_once() {
        when(tokens.token(null)).thenReturn(Optional.empty());
        assertThat(host.createsRepos("acme")).isFalse();

        when(tokens.token(null)).thenReturn(Optional.of("gho_person"));
        when(rest.exchange(eq(DesktopProjectRepoHost.USER), eq(HttpMethod.GET), any(HttpEntity.class),
                any(ParameterizedTypeReference.class)))
            .thenThrow(new ResourceAccessException("GitHub unreachable"));
        assertThat(host.createsRepos("acme")).isFalse();

        org.mockito.Mockito.reset(rest);
        githubSays("repo");
        assertThat(host.createsRepos("acme")).isTrue();
        assertThat(host.createsRepos("acme")).isTrue();
        verify(rest, org.mockito.Mockito.times(1)).exchange(eq(DesktopProjectRepoHost.USER), eq(HttpMethod.GET), any(HttpEntity.class),
            any(ParameterizedTypeReference.class));
    }

    @Test
    @DisplayName("le dépôt se crée avec le jeton de son gh : privé, un premier commit, et son nom complet")
    void the_repository_is_created_with_their_gh() {
        when(tokens.token(null)).thenReturn(Optional.of("gho_person"));
        when(rest.exchange(eq(DesktopProjectRepoHost.CREATE), eq(HttpMethod.POST), any(HttpEntity.class),
                any(ParameterizedTypeReference.class)))
            .thenReturn(ResponseEntity.ok(Map.of("full_name", "Miche1-Pierre/recette-113")));

        assertThat(host.createRepo("acme", "recette-113", true)).isEqualTo("Miche1-Pierre/recette-113");

        ArgumentCaptor<HttpEntity<Map<String, Object>>> request = ArgumentCaptor.forClass(HttpEntity.class);
        verify(rest).exchange(eq(DesktopProjectRepoHost.CREATE), eq(HttpMethod.POST), request.capture(),
            any(ParameterizedTypeReference.class));
        assertThat(request.getValue().getHeaders().getFirst("Authorization")).isEqualTo("Bearer gho_person");
        assertThat(request.getValue().getBody()).containsEntry("name", "recette-113").containsEntry("private", true)
            .containsEntry("auto_init", true);
    }

    @Test
    @DisplayName("créer un dépôt qui échoue le dit : gh non connecté, nom déjà pris, GitHub injoignable")
    void a_refused_creation_says_why() {
        when(tokens.token(null)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> host.createRepo("acme", "website", true))
            .isInstanceOf(BusinessException.class).hasMessage(DesktopProjectRepoHost.NOT_CONNECTED);

        when(tokens.token(null)).thenReturn(Optional.of("gho_person"));
        when(rest.exchange(eq(DesktopProjectRepoHost.CREATE), eq(HttpMethod.POST), any(HttpEntity.class),
                any(ParameterizedTypeReference.class)))
            .thenThrow(org.springframework.web.client.HttpClientErrorException.create(org.springframework.http.HttpStatus.UNPROCESSABLE_ENTITY,
                "taken", org.springframework.http.HttpHeaders.EMPTY, new byte[0], null));
        assertThatThrownBy(() -> host.createRepo("acme", "website", true))
            .isInstanceOf(BusinessException.class).hasMessageContaining("'website'");

        org.mockito.Mockito.reset(rest);
        when(rest.exchange(eq(DesktopProjectRepoHost.CREATE), eq(HttpMethod.POST), any(HttpEntity.class),
                any(ParameterizedTypeReference.class)))
            .thenThrow(org.springframework.web.client.HttpClientErrorException.create(org.springframework.http.HttpStatus.FORBIDDEN,
                "no", org.springframework.http.HttpHeaders.EMPTY, new byte[0], null));
        assertThatThrownBy(() -> host.createRepo("acme", "website", true))
            .isInstanceOf(BusinessException.class).hasMessageContaining("repo scope");

        org.mockito.Mockito.reset(rest);
        when(rest.exchange(eq(DesktopProjectRepoHost.CREATE), eq(HttpMethod.POST), any(HttpEntity.class),
                any(ParameterizedTypeReference.class)))
            .thenThrow(new ResourceAccessException("GitHub unreachable"));
        assertThatThrownBy(() -> host.createRepo("acme", "website", true))
            .isInstanceOf(BusinessException.class).hasMessageContaining("couldn't be reached");
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
