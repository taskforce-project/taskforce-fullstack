package com.taskforce.tf_api.modules.sales.api;

import com.taskforce.tf_api.modules.sales.dto.request.EnterpriseInquiryRequest;
import com.taskforce.tf_api.modules.sales.dto.response.EnterpriseInquiryResponse;
import com.taskforce.tf_api.modules.sales.service.SalesService;
import com.taskforce.tf_api.shared.dto.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * Controller REST pour gérer les demandes de contact ENTERPRISE.
 * Endpoint public (pas d'authentification nécessaire).
 */
@RestController
@RequestMapping("/api/sales")
@RequiredArgsConstructor
@Slf4j
public class SalesController {

    private final SalesService salesService;

    /**
     * Créer une demande de contact ENTERPRISE.
     *
     * POST /api/sales/inquiry
     */
    @PostMapping("/inquiry")
    public ResponseEntity<ApiResponse<EnterpriseInquiryResponse>> createInquiry(
            @Valid @RequestBody EnterpriseInquiryRequest request
    ) {
        log.info("📨 POST /api/sales/inquiry - Nouvelle demande de: {}", request.getEmail());

        EnterpriseInquiryResponse response = salesService.createInquiry(request);

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(ApiResponse.success("Demande envoyée avec succès", response));
    }
}
