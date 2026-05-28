package com.taskforce.tf_api.modules.chat.service;

import java.util.List;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.modules.chat.domain.Channel;
import com.taskforce.tf_api.modules.chat.domain.ChatMessage;
import com.taskforce.tf_api.modules.chat.dto.request.SendMessageRequest;
import com.taskforce.tf_api.modules.chat.dto.request.UpdateMessageRequest;
import com.taskforce.tf_api.modules.chat.dto.response.ChatMessageResponse;
import com.taskforce.tf_api.modules.chat.repository.ChannelMemberRepository;
import com.taskforce.tf_api.modules.chat.repository.ChannelRepository;
import com.taskforce.tf_api.modules.chat.repository.ChatMessageRepository;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class ChatMessageService {

    private static final int PAGE_SIZE = 50;

    private final ChatMessageRepository messageRepository;
    private final ChannelRepository     channelRepository;
    private final ChannelMemberRepository memberRepository;
    private final UserRepository        userRepository;

    // =========================================================================
    // History
    // =========================================================================

    @Transactional(readOnly = true)
    public List<ChatMessageResponse> getMessages(Long channelId, Long userId) {
        assertMember(channelId, userId);
        return messageRepository
                .findRecentByChannel(channelId, PageRequest.of(0, PAGE_SIZE))
                .stream()
                .map(this::toResponse)
                .toList();
    }

    // =========================================================================
    // Send (via REST — used internally by WebSocket controller too)
    // =========================================================================

    @Transactional
    public ChatMessageResponse sendMessage(Long channelId, Long userId, String content) {
        assertMember(channelId, userId);

        Channel channel = channelRepository.findById(channelId)
                .orElseThrow(() -> new ResourceNotFoundException("Canal introuvable"));

        User author = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));

        ChatMessage msg = ChatMessage.builder()
                .channel(channel)
                .author(author)
                .content(content)
                .build();

        return toResponse(messageRepository.save(msg));
    }

    // Overload pour valider via DTO
    @Transactional
    public ChatMessageResponse sendMessage(Long channelId, Long userId, SendMessageRequest req) {
        return sendMessage(channelId, userId, req.getContent());
    }

    // =========================================================================
    // Edit
    // =========================================================================

    @Transactional
    public ChatMessageResponse editMessage(Long channelId, Long messageId, Long userId,
                                           UpdateMessageRequest req) {
        ChatMessage msg = findOwnMessage(channelId, messageId, userId);
        msg.setContent(req.getContent());
        msg.setIsEdited(true);
        return toResponse(messageRepository.save(msg));
    }

    // =========================================================================
    // Delete (soft)
    // =========================================================================

    @Transactional
    public void deleteMessage(Long channelId, Long messageId, Long userId) {
        ChatMessage msg = findOwnMessage(channelId, messageId, userId);
        msg.setIsDeleted(true);
        messageRepository.save(msg);
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    private void assertMember(Long channelId, Long userId) {
        if (!memberRepository.existsById_ChannelIdAndId_UserId(channelId, userId)) {
            throw new ResourceNotFoundException("Canal introuvable ou accès refusé");
        }
    }

    private ChatMessage findOwnMessage(Long channelId, Long messageId, Long userId) {
        ChatMessage msg = messageRepository.findById(messageId)
                .orElseThrow(() -> new ResourceNotFoundException("Message introuvable"));
        if (!msg.getChannel().getId().equals(channelId)) {
            throw new ResourceNotFoundException("Message introuvable dans ce canal");
        }
        if (msg.getAuthor() == null || !msg.getAuthor().getId().equals(userId)) {
            throw new com.taskforce.tf_api.shared.exception.ForbiddenException("Vous ne pouvez pas modifier ce message");
        }
        return msg;
    }

    public ChatMessageResponse toResponse(ChatMessage m) {
        String name     = "";
        String initials = "?";
        if (m.getAuthor() != null) {
            String dn = m.getAuthor().getDisplayName();
            if (dn == null || dn.isBlank()) dn = m.getAuthor().getEmail();
            name = dn != null ? dn : "";
            String[] parts = name.split(" ", 2);
            initials = initials(parts[0], parts.length > 1 ? parts[1] : "");
        }
        return ChatMessageResponse.builder()
                .id(m.getId())
                .channelId(m.getChannel().getId())
                .authorId(m.getAuthor() != null ? m.getAuthor().getId() : null)
                .authorName(name.isBlank() ? "Inconnu" : name.trim())
                .authorInitials(initials)
                .content(m.getContent())
                .isEdited(m.getIsEdited())
                .createdAt(m.getCreatedAt())
                .updatedAt(m.getUpdatedAt())
                .build();
    }

    private static String initials(String firstName, String lastName) {
        String f = (firstName != null && !firstName.isBlank()) ? firstName.substring(0, 1).toUpperCase() : "?";
        String l = (lastName  != null && !lastName.isBlank())  ? lastName.substring(0, 1).toUpperCase()  : "";
        return f + l;
    }
}
