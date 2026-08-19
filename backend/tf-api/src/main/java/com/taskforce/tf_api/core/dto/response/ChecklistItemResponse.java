package com.taskforce.tf_api.core.dto.response;

import com.taskforce.tf_api.core.model.IssueChecklistItem;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class ChecklistItemResponse {

    private Long id;
    private String content;
    private boolean done;
    private int position;

    public static ChecklistItemResponse from(IssueChecklistItem item) {
        return ChecklistItemResponse.builder()
            .id(item.getId())
            .content(item.getContent())
            .done(item.isDone())
            .position(item.getPosition())
            .build();
    }
}
