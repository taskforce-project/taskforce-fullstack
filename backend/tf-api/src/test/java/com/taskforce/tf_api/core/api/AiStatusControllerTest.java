package com.taskforce.tf_api.core.api;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import com.taskforce.tf_api.core.service.AiStatusService;
import com.taskforce.tf_api.core.service.AiStatusService.AiStatus;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** État de l'IA pour l'interface : lu dans le cache, relu tout de suite quand l'interface le demande. */
@DisplayName("AiStatusController")
class AiStatusControllerTest {

    private static final AiStatus READY = new AiStatus(true, true, "qwen3:8b", "qwen3:8b", true, "bge-m3");

    @ParameterizedTest(name = "refresh={0}")
    @ValueSource(booleans = {false, true})
    @DisplayName("renvoie l'état, et ne vide le cache que sur demande")
    void readsTheStatusAndRefreshesOnlyWhenAsked(boolean refresh) {
        AiStatusService service = mock(AiStatusService.class);
        when(service.current()).thenReturn(READY);

        var response = new AiStatusController(service).status(refresh);

        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().getData()).isEqualTo(READY);
        if (refresh) {
            var order = inOrder(service);
            order.verify(service).invalidate();
            order.verify(service).current();
        } else {
            verify(service, never()).invalidate();
        }
    }
}
