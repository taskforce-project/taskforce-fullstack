package com.taskforce.tf_api.core.service;

import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestTemplate;

import com.taskforce.tf_api.core.dto.request.SlackChannelRequest;
import com.taskforce.tf_api.core.dto.response.IntegrationStatusResponse;
import com.taskforce.tf_api.core.dto.response.SlackChannelResponse;
import com.taskforce.tf_api.core.enums.IntegrationProvider;
import com.taskforce.tf_api.core.model.Integration;
import com.taskforce.tf_api.core.model.SlackChannel;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.IntegrationRepository;
import com.taskforce.tf_api.core.repository.SlackChannelRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Service
@RequiredArgsConstructor
@Slf4j
public class SlackIntegrationService {

    private static final String SLACK_OAUTH_AUTHORIZE = "https://slack.com/oauth/v2/authorize";
    private static final String SLACK_TOKEN_URL       = "https://slack.com/api/oauth.v2.access";

    @Value("${integrations.slack.client-id:}")
    private String clientId;

    @Value("${integrations.slack.client-secret:}")
    private String clientSecret;

    @Value("${app.frontend-url:http://localhost:3000}")
    private String frontendUrl;

    @Value("${app.url:http://localhost:8080}")
    private String appUrl;

    private final IntegrationRepository  integrationRepository;
    private final SlackChannelRepository slackChannelRepository;
    private final WorkspaceRepository    workspaceRepository;
    private final RestTemplate           restTemplate;

    // ----------------------------------------------------------------
    // OAuth flow
    // ----------------------------------------------------------------

    public URI buildAuthorizeUrl(String workspaceSlug) {
        String callbackUrl = appUrl + "/api/integrations/slack/callback";
        String url = SLACK_OAUTH_AUTHORIZE
            + "?client_id=" + encode(clientId)
            + "&redirect_uri=" + encode(callbackUrl)
            + "&scope=chat:write,channels:read,incoming-webhook"
            + "&state=" + encode(workspaceSlug);
        return URI.create(url);
    }

    @Transactional
    public String handleCallback(String code, String workspaceSlug) {
        // 1. Exchange code for token
        Map<String, Object> tokenResponse = exchangeCodeForToken(code);

        String botToken  = extractPath(tokenResponse, "access_token");
        String teamId    = extractPath(tokenResponse, "team.id");
        String teamName  = extractPath(tokenResponse, "team.name");

        // 2. Persist integration (upsert)
        Workspace workspace = workspaceRepository.findBySlug(workspaceSlug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace not found: " + workspaceSlug));

        Optional<Integration> existing = integrationRepository
            .findByWorkspaceIdAndProvider(workspace.getId(), IntegrationProvider.SLACK);

        Map<String, String> meta = new HashMap<>();
        meta.put("teamId",   teamId);
        meta.put("teamName", teamName);

        Integration integration = existing.orElseGet(() ->
            Integration.builder()
                .workspace(workspace)
                .provider(IntegrationProvider.SLACK)
                .build()
        );
        integration.setAccessToken(botToken);
        integration.setMeta(meta);
        integrationRepository.save(integration);

        return frontendUrl + "/" + workspaceSlug + "/settings?section=integrations&slack=connected";
    }

    @Transactional
    public void disconnect(String workspaceSlug) {
        Workspace workspace = workspaceRepository.findBySlug(workspaceSlug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace not found: " + workspaceSlug));
        integrationRepository.deleteByWorkspaceIdAndProvider(workspace.getId(), IntegrationProvider.SLACK);
    }

    public IntegrationStatusResponse getStatus(String workspaceSlug) {
        Workspace workspace = workspaceRepository.findBySlug(workspaceSlug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace not found: " + workspaceSlug));
        return integrationRepository
            .findByWorkspaceIdAndProvider(workspace.getId(), IntegrationProvider.SLACK)
            .map(i -> new IntegrationStatusResponse(i.getId(), "SLACK", true, i.getMeta(), i.getConnectedAt()))
            .orElse(new IntegrationStatusResponse(null, "SLACK", false, Map.of(), null));
    }

    // ----------------------------------------------------------------
    // Channel config
    // ----------------------------------------------------------------

    @Transactional
    public SlackChannelResponse addChannel(String workspaceSlug, SlackChannelRequest req) {
        Workspace workspace = workspaceRepository.findBySlug(workspaceSlug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace not found: " + workspaceSlug));

        SlackChannel channel = SlackChannel.builder()
            .workspace(workspace)
            .channelId(req.channelId())
            .channelName(req.channelName())
            .eventTypes(req.eventTypes() != null ? req.eventTypes().toArray(new String[0]) : new String[]{})
            .active(true)
            .build();

        slackChannelRepository.save(channel);
        return toResponse(channel);
    }

    public List<SlackChannelResponse> getChannels(String workspaceSlug) {
        Workspace workspace = workspaceRepository.findBySlug(workspaceSlug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace not found: " + workspaceSlug));
        return slackChannelRepository.findByWorkspaceIdOrderByCreatedAtDesc(workspace.getId())
            .stream()
            .map(this::toResponse)
            .toList();
    }

    @Transactional
    public void deleteChannel(String workspaceSlug, Long channelId) {
        Workspace workspace = workspaceRepository.findBySlug(workspaceSlug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace not found: " + workspaceSlug));
        slackChannelRepository.deleteByIdAndWorkspaceId(channelId, workspace.getId());
    }

    // ----------------------------------------------------------------
    // Send notification (fire-and-forget)
    // ----------------------------------------------------------------

    public void sendNotification(Long workspaceId, String text) {
        integrationRepository
            .findByWorkspaceIdAndProvider(workspaceId, IntegrationProvider.SLACK)
            .ifPresent(integration -> {
                try {
                    HttpHeaders headers = new HttpHeaders();
                    headers.setBearerAuth(integration.getAccessToken());
                    headers.setContentType(MediaType.APPLICATION_JSON);

                    // Get first active channel for this workspace
                    slackChannelRepository
                        .findByWorkspaceIdOrderByCreatedAtDesc(workspaceId)
                        .stream()
                        .filter(SlackChannel::getActive)
                        .findFirst()
                        .ifPresent(channel -> {
                            Map<String, String> body = Map.of(
                                "channel", channel.getChannelId(),
                                "text",    text
                            );
                            HttpEntity<Map<String, String>> request = new HttpEntity<>(body, headers);
                            restTemplate.postForObject(
                                "https://slack.com/api/chat.postMessage",
                                request,
                                Map.class
                            );
                        });
                } catch (Exception e) {
                    log.warn("Failed to send Slack notification to workspace {}: {}", workspaceId, e.getMessage());
                }
            });
    }

    // ----------------------------------------------------------------
    // Helpers
    // ----------------------------------------------------------------

    @SuppressWarnings("unchecked")
    private Map<String, Object> exchangeCodeForToken(String code) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);

        MultiValueMap<String, String> body = new LinkedMultiValueMap<>();
        body.add("client_id",     clientId);
        body.add("client_secret", clientSecret);
        body.add("code",          code);

        HttpEntity<MultiValueMap<String, String>> request = new HttpEntity<>(body, headers);
        ResponseEntity<Map<String, Object>> response = restTemplate.exchange(
            SLACK_TOKEN_URL,
            HttpMethod.POST,
            request,
            new ParameterizedTypeReference<Map<String, Object>>() {}
        );

        Map<String, Object> responseBody = response.getBody();
        if (responseBody == null || Boolean.FALSE.equals(responseBody.get("ok"))) {
            throw new RuntimeException("Failed to obtain Slack access token: " +
                (responseBody != null ? responseBody.get("error") : "null response"));
        }
        return responseBody;
    }

    @SuppressWarnings("unchecked")
    private String extractPath(Map<String, Object> map, String path) {
        String[] parts = path.split("\\.");
        Object current = map;
        for (String part : parts) {
            if (current instanceof Map) {
                current = ((Map<String, Object>) current).get(part);
            } else {
                return "";
            }
        }
        return current != null ? String.valueOf(current) : "";
    }

    private SlackChannelResponse toResponse(SlackChannel c) {
        return new SlackChannelResponse(
            c.getId(),
            c.getChannelId(),
            c.getChannelName(),
            c.getEventTypes() != null ? Arrays.asList(c.getEventTypes()) : List.of(),
            Boolean.TRUE.equals(c.getActive()),
            c.getCreatedAt()
        );
    }

    private String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}
