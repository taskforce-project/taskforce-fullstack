package com.taskforce.tf_api.modules.chat.dto.response;

import com.taskforce.tf_api.core.enums.ChannelKind;
import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class ChannelResponse {

    private Long       id;
    private ChannelKind kind;
    private String     name;
    private String     description;
    private Boolean    isPrivate;
    private Long       projectId;
    private String     projectName;
    private long       memberCount;
}
