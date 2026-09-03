package com.taskforce.tf_api.core.service.mcp;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import com.taskforce.tf_api.shared.exception.BusinessException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Tests unitaires — {@link McpClient}. Un serveur HTTP embarqué (JDK {@link HttpServer}) rejoue des
 * réponses MCP <b>en SSE</b> ({@code event: message} / {@code data:}) : prouve handshake +
 * {@code mcp-session-id} + parsing SSE + {@code tools/list} + {@code tools/call} sans réseau externe.
 */
@DisplayName("McpClient")
class McpClientTest {

    private HttpServer server;
    private String url;
    private volatile boolean emitSession = true;   // le serveur émet-il un mcp-session-id ? (stateful)
    private volatile boolean unauthorized = false; // le serveur répond-il 401 à l'initialize ?
    private final McpClient client = new McpClient(new ObjectMapper(), 2000L, 5000L);

    @BeforeEach
    void start() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/mcp", exchange -> {
            String method = exchange.getRequestMethod();
            String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            if ("DELETE".equals(method)) { exchange.sendResponseHeaders(200, -1); exchange.close(); return; }
            if (body.contains("notifications/initialized")) { exchange.sendResponseHeaders(202, -1); exchange.close(); return; }

            String rpc;
            if (body.contains("\"initialize\"")) {
                if (unauthorized) {
                    byte[] err = "{\"error\":\"invalid_token\"}".getBytes(StandardCharsets.UTF_8);
                    exchange.sendResponseHeaders(401, err.length);
                    exchange.getResponseBody().write(err);
                    exchange.close();
                    return;
                }
                if (emitSession) exchange.getResponseHeaders().set("mcp-session-id", "sess-123");
                rpc = "{\"result\":{\"protocolVersion\":\"2025-06-18\",\"serverInfo\":{\"name\":\"t\",\"version\":\"0\"}},\"jsonrpc\":\"2.0\",\"id\":1}";
            } else if (body.contains("tools/list")) {
                rpc = "{\"result\":{\"tools\":["
                    + "{\"name\":\"echo\",\"description\":\"Echo\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"x\":{\"type\":\"string\"}}},\"annotations\":{\"readOnlyHint\":true}},"
                    + "{\"name\":\"add\",\"description\":\"Add\",\"inputSchema\":{\"type\":\"object\"}}]},\"jsonrpc\":\"2.0\",\"id\":2}";
            } else if (body.contains("tools/call")) {
                String tool = body.contains("\"echo\"") ? "echo" : "add";
                rpc = "{\"result\":{\"content\":[{\"type\":\"text\",\"text\":\"CALLED " + tool + "\"}]},\"jsonrpc\":\"2.0\",\"id\":3}";
            } else {
                rpc = "{\"result\":{},\"jsonrpc\":\"2.0\",\"id\":0}";
            }
            byte[] sse = ("event: message\ndata: " + rpc + "\n\n").getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "text/event-stream");
            exchange.sendResponseHeaders(200, sse.length);
            exchange.getResponseBody().write(sse);
            exchange.close();
        });
        server.start();
        url = "http://127.0.0.1:" + server.getAddress().getPort() + "/mcp";
    }

    @AfterEach
    void stop() {
        if (server != null) server.stop(0);
    }

    @Test
    @DisplayName("initialize → capture le mcp-session-id (corps SSE)")
    void initialize_captures_session() {
        McpClient.Session session = client.initialize(new McpClient.ServerRef("srv", url, null));
        assertThat(session.sessionId()).isEqualTo("sess-123");
        assertThat(session.baseUrl()).isEqualTo(url);
    }

    @Test
    @DisplayName("tools/list → parse les définitions d'outils depuis le SSE")
    void list_tools_parses_defs() {
        McpClient.Session session = client.initialize(new McpClient.ServerRef("srv", url, null));
        List<McpClient.ToolDef> defs = client.listTools(session);
        assertThat(defs).hasSize(2);
        assertThat(defs).extracting(McpClient.ToolDef::name).containsExactly("echo", "add");
        assertThat(defs.get(0).inputSchema().path("type").asText()).isEqualTo("object");
        // readOnlyHint → classification lecture/écriture
        assertThat(defs.get(0).readOnly()).isTrue();   // echo : readOnlyHint=true
        assertThat(defs.get(1).readOnly()).isFalse();  // add : absent → écriture (conservateur)
    }

    @Test
    @DisplayName("tools/call → agrège le contenu texte du résultat")
    void call_tool_returns_text() {
        McpClient.Session session = client.initialize(new McpClient.ServerRef("srv", url, null));
        String result = client.callTool(session, "echo", Map.of("x", "hello"));
        assertThat(result).isEqualTo("CALLED echo");
        client.close(session);
    }

    @Test
    @DisplayName("extractJson : SSE → JSON ; JSON brut → inchangé")
    void extract_json_handles_sse_and_raw() {
        assertThat(McpClient.extractJson("event: message\ndata: {\"a\":1}\n\n").trim()).isEqualTo("{\"a\":1}");
        assertThat(McpClient.extractJson("{\"b\":2}")).isEqualTo("{\"b\":2}");
    }

    @Test
    @DisplayName("initialize : serveur stateless (sans mcp-session-id) → session sans id, suite OK")
    void initialize_stateless_without_session_id() {
        emitSession = false; // cas Linear : le serveur ne renvoie PAS de mcp-session-id
        McpClient.Session session = client.initialize(new McpClient.ServerRef("srv", url, null));
        assertThat(session.sessionId()).isNull();
        // Le mode stateless ne casse pas la suite : tools/list fonctionne sans en-tête de session.
        List<McpClient.ToolDef> defs = client.listTools(session);
        assertThat(defs).extracting(McpClient.ToolDef::name).containsExactly("echo", "add");
        assertThat(client.callTool(session, "echo", Map.of("x", "hi"))).isEqualTo("CALLED echo");
        client.close(session); // ne doit pas lever malgré un sessionId null
    }

    @Test
    @DisplayName("initialize : statut d'erreur (401) → échec clair mentionnant le code HTTP")
    void initialize_http_error_is_explicit() {
        unauthorized = true; // token refusé par le serveur
        assertThatThrownBy(() -> client.initialize(new McpClient.ServerRef("srv", url, null)))
            .isInstanceOf(BusinessException.class)
            .hasMessageContaining("401");
    }
}
