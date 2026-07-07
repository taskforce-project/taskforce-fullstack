package com.taskforce.tf_api.modules.sales.service;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import com.taskforce.tf_api.core.service.EmailService;
import com.taskforce.tf_api.modules.sales.dto.request.EnterpriseInquiryRequest;
import com.taskforce.tf_api.modules.sales.repository.EnterpriseInquiryRepository;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.util.AbstractIntegrationTest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;

/**
 * Tests d'intégration — {@link SalesService} (demandes Enterprise). Repo réel, {@code EmailService} mocké.
 */
@DisplayName("SalesService (intégration Postgres)")
@Import(SalesService.class)
class SalesServiceIntegrationTest extends AbstractIntegrationTest {

    @Autowired private SalesService salesService;
    @Autowired private EnterpriseInquiryRepository inquiryRepository;

    @MockitoBean private EmailService emailService;

    private EnterpriseInquiryRequest req(String email) {
        EnterpriseInquiryRequest r = new EnterpriseInquiryRequest();
        r.setFullName("Jean Dupont");
        r.setEmail(email);
        r.setTeamSize("51-200");
        r.setMessage("On veut un devis");
        return r;
    }

    @Test
    @DisplayName("createInquiry persiste la demande et envoie une notification interne")
    void should_create_inquiry() {
        salesService.createInquiry(req("lead@corp.dev"));

        assertThat(inquiryRepository.count()).isEqualTo(1);
        verify(emailService).sendInternalNotification(any(), any(), any());
    }

    @Test
    @DisplayName("createInquiry refuse une 2e demande en cours pour le même email")
    void should_reject_duplicate_pending() {
        salesService.createInquiry(req("dup@corp.dev"));

        assertThatThrownBy(() -> salesService.createInquiry(req("dup@corp.dev")))
            .isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("linkInquiryToUser rattache les demandes à l'utilisateur")
    void should_link_inquiry_to_user() {
        salesService.createInquiry(req("link@corp.dev"));

        salesService.linkInquiryToUser("link@corp.dev", 42L);

        assertThat(inquiryRepository.findAll().get(0).getUserId()).isEqualTo(42L);
    }
}
