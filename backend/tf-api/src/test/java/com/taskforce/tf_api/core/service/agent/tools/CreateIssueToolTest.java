package com.taskforce.tf_api.core.service.agent.tools;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.taskforce.tf_api.core.dto.request.CreateIssueRequest;
import com.taskforce.tf_api.core.dto.response.IssueResponse;
import com.taskforce.tf_api.core.enums.IssuePriority;
import com.taskforce.tf_api.core.service.IssueService;
import com.taskforce.tf_api.core.service.agent.AgentContext;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

/** Tests unitaires — {@link CreateIssueTool} (outil interne d'écriture d'issue, TF-MCP-03). */
@ExtendWith(MockitoExtension.class)
@DisplayName("CreateIssueTool")
class CreateIssueToolTest {

    @Mock private IssueService issueService;

    private CreateIssueTool tool() { return new CreateIssueTool(issueService); }

    @Test
    @DisplayName("métadonnées : name create_issue + projectId/title requis")
    void metadata() {
        var t = tool();
        assertThat(t.name()).isEqualTo("create_issue");
        @SuppressWarnings("unchecked")
        List<String> required = (List<String>) t.parametersSchema().get("required");
        assertThat(required).contains("projectId", "title");
    }

    @Test
    @DisplayName("execute : mappe title/description/priority (« high » → HIGH) et délègue à createIssue")
    void execute_creates_issue() {
        when(issueService.createIssue(eq("acme"), eq(3L), any(), eq(7L)))
            .thenReturn(IssueResponse.builder().id(99L).identifier("WEB-9").title("Rate limiting").build());
        Map<String, Object> args = Map.of("projectId", 3, "title", "Rate limiting",
            "description", "sur l'API publique", "priority", "high");

        String out = tool().execute(args, new AgentContext("acme", 1L, 7L));

        assertThat(out).contains("WEB-9").contains("Rate limiting").contains("99");
        ArgumentCaptor<CreateIssueRequest> cap = ArgumentCaptor.forClass(CreateIssueRequest.class);
        org.mockito.Mockito.verify(issueService).createIssue(eq("acme"), eq(3L), cap.capture(), eq(7L));
        CreateIssueRequest req = cap.getValue();
        assertThat(req.getTitle()).isEqualTo("Rate limiting");
        assertThat(req.getDescription()).isEqualTo("sur l'API publique");
        assertThat(req.getPriority()).isEqualTo(IssuePriority.HIGH); // insensible à la casse
    }

    @Test
    @DisplayName("execute : projectId manquant → message, aucun appel service")
    void execute_missing_project() {
        String out = tool().execute(Map.of("title", "X"), new AgentContext("acme", 1L, 7L));
        assertThat(out).contains("projectId manquant");
        org.mockito.Mockito.verifyNoInteractions(issueService);
    }

    @Test
    @DisplayName("execute : priority invalide → ignorée (null), issue créée quand même")
    void execute_invalid_priority_ignored() {
        when(issueService.createIssue(any(), any(), any(), any()))
            .thenReturn(IssueResponse.builder().id(1L).identifier("WEB-1").title("T").build());
        Map<String, Object> args = Map.of("projectId", 3, "title", "T", "priority", "WAT");

        tool().execute(args, new AgentContext("acme", 1L, 7L));

        ArgumentCaptor<CreateIssueRequest> cap = ArgumentCaptor.forClass(CreateIssueRequest.class);
        org.mockito.Mockito.verify(issueService).createIssue(any(), any(), cap.capture(), any());
        assertThat(cap.getValue().getPriority()).isNull();
    }
}
