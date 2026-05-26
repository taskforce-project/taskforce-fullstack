package com.taskforce.tf_api.modules.chat.dto.request;

import java.util.List;

import com.taskforce.tf_api.core.enums.ChannelKind;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class CreateChannelRequest {

    @NotNull
    private ChannelKind kind;

    @Size(max = 100)
    private String name;

    @Size(max = 500)
    private String description;

    private Boolean isPrivate = false;

    /** IDs des membres à ajouter (en plus du créateur). */
    private List<Long> memberIds;

    /** Pour un PROJECT_CHANNEL ou DM entre deux membres d'un projet. */
    private Long projectId;
}
