package com.taskforce.tf_api.core.service.delivery;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

/** Une ligne du dossier en Markdown (R159, L10) : la raison d'une décision passe avant la coupe, entière. */
class MissionEvidenceDescribeTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    @Test
    @DisplayName("une décision aux longs champs garde sa raison entière, en tête ; le reste se coupe à 300 caractères")
    void the_reason_comes_before_the_cut() {
        ObjectNode data = JSON.createObjectNode();
        data.put("approval", 9);
        data.put("decision", "ALLOW");
        data.put("summary", "x".repeat(400));
        data.put("reason", "Checked the diff with the auditors, line by line");

        String line = MissionEvidenceService.describe(data);

        assertThat(line).startsWith("reason: Checked the diff with the auditors, line by line, approval: 9, decision: ALLOW");
        assertThat(line).endsWith("...");
        assertThat(line.length()).isLessThanOrEqualTo("reason: Checked the diff with the auditors, line by line, ".length() + 300);
    }

    @Test
    @DisplayName("sans raison, la ligne ne change pas : les champs dans leur ordre, coupés à 300 caractères")
    void without_a_reason_nothing_changes() {
        ObjectNode data = JSON.createObjectNode();
        data.put("tool", "Edit");
        data.put("path", "src/export.ts");
        assertThat(MissionEvidenceService.describe(data)).isEqualTo("tool: Edit, path: src/export.ts");
    }
}
