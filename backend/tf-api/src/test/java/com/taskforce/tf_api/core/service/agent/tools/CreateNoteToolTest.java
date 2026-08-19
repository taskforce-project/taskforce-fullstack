package com.taskforce.tf_api.core.service.agent.tools;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.taskforce.tf_api.core.dto.request.CreateKnowledgeNodeRequest;
import com.taskforce.tf_api.core.dto.response.KnowledgeNodeResponse;
import com.taskforce.tf_api.core.service.KnowledgeService;
import com.taskforce.tf_api.core.service.agent.AgentContext;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

/**
 * Tests unitaires — {@link CreateNoteTool} (outil de write-back Brain OS de l'agent).
 * Vérifie le mapping des arguments → {@link CreateKnowledgeNodeRequest} et la délégation au service.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("CreateNoteTool")
class CreateNoteToolTest {

    @Mock private KnowledgeService knowledgeService;

    private CreateNoteTool tool() { return new CreateNoteTool(knowledgeService); }

    private KnowledgeNodeResponse node() {
        return KnowledgeNodeResponse.builder().id(42L).title("Choix Postgres").domain("DECISIONS").build();
    }

    @Test
    @DisplayName("métadonnées de l'outil : name/description/schema non vides")
    void metadata() {
        var t = tool();
        assertThat(t.name()).isEqualTo("create_note");
        assertThat(t.description()).contains("Brain OS");
        assertThat(t.parametersSchema()).containsKey("properties");
        assertThat(t.parametersSchema()).containsEntry("type", "object");
    }

    @Test
    @DisplayName("execute mappe domain/type/title/content/tags et renvoie un message avec le titre créé")
    void execute_maps_all_fields() {
        when(knowledgeService.createNode(eq("acme"), eq(7L), any())).thenReturn(node());
        var t = tool();
        Map<String, Object> args = Map.of(
            "domain", "DECISIONS", "type", "DECISION", "title", "Choix Postgres",
            "content", "On garde Postgres", "tags", List.of("db", "archi"));

        String out = t.execute(args, new AgentContext("acme", 1L, 7L));

        assertThat(out).contains("Choix Postgres").contains("DECISIONS").contains("42");
        ArgumentCaptor<CreateKnowledgeNodeRequest> cap = ArgumentCaptor.forClass(CreateKnowledgeNodeRequest.class);
        org.mockito.Mockito.verify(knowledgeService).createNode(eq("acme"), eq(7L), cap.capture());
        CreateKnowledgeNodeRequest req = cap.getValue();
        assertThat(req.getDomain()).isEqualTo("DECISIONS");
        assertThat(req.getType()).isEqualTo("DECISION");
        assertThat(req.getTitle()).isEqualTo("Choix Postgres");
        assertThat(req.getContent()).isEqualTo("On garde Postgres");
        assertThat(req.getTags()).containsExactly("db", "archi");
    }

    @Test
    @DisplayName("execute sans content ni tags : content=null, pas de tags mappés")
    void execute_without_content_or_tags() {
        when(knowledgeService.createNode(any(), any(), any())).thenReturn(node());
        var t = tool();
        Map<String, Object> args = Map.of("domain", "PROJET", "type", "NOTE", "title", "T");

        t.execute(args, new AgentContext("acme", 1L, 7L));

        ArgumentCaptor<CreateKnowledgeNodeRequest> cap = ArgumentCaptor.forClass(CreateKnowledgeNodeRequest.class);
        org.mockito.Mockito.verify(knowledgeService).createNode(any(), any(), cap.capture());
        assertThat(cap.getValue().getContent()).isNull();
        assertThat(cap.getValue().getTags()).isNullOrEmpty();
    }
}
