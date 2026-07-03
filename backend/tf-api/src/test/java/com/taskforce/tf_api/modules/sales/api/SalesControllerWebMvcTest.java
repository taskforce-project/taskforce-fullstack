package com.taskforce.tf_api.modules.sales.api;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.modules.sales.dto.response.EnterpriseInquiryResponse;
import com.taskforce.tf_api.modules.sales.service.SalesService;
import com.taskforce.tf_api.shared.security.SecurityConfig;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Tests de tranche web — {@link SalesController} (demande de contact ENTERPRISE, endpoint public).
 */
@WebMvcTest(SalesController.class)
@Import(SecurityConfig.class)
@ActiveProfiles("test")
@DisplayName("SalesController (@WebMvcTest)")
class SalesControllerWebMvcTest {

    @Autowired private MockMvc mockMvc;

    @MockitoBean private SalesService salesService;
    @MockitoBean private UserRepository userRepository;
    @MockitoBean private WorkspaceRepository workspaceRepository;
    @MockitoBean private WorkspaceMemberRepository workspaceMemberRepository;

    @Test
    @DisplayName("POST /api/sales/inquiry valide (public, sans JWT) → 201 + success")
    void inquiry_valid_201() throws Exception {
        when(salesService.createInquiry(any())).thenReturn(
            EnterpriseInquiryResponse.builder()
                .inquiryId(java.util.UUID.randomUUID()).fullName("Jane Doe").email("jane@corp.io")
                .teamSize("51-200").status("NEW").message("Reçu").build());

        String body = "{\"fullName\":\"Jane Doe\",\"email\":\"jane@corp.io\",\"teamSize\":\"51-200\",\"message\":\"Bonjour\"}";

        mockMvc.perform(post("/api/sales/inquiry").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.email").value("jane@corp.io"));
    }

    @Test
    @DisplayName("POST /api/sales/inquiry email invalide → 400")
    void inquiry_invalid_email_400() throws Exception {
        String body = "{\"fullName\":\"Jane\",\"email\":\"not-an-email\",\"teamSize\":\"1-10\"}";
        mockMvc.perform(post("/api/sales/inquiry").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("POST /api/sales/inquiry sans champs obligatoires → 400")
    void inquiry_missing_fields_400() throws Exception {
        mockMvc.perform(post("/api/sales/inquiry").contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isBadRequest());
    }
}
