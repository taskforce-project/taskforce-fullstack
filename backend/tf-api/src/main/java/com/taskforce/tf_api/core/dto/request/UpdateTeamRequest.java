package com.taskforce.tf_api.core.dto.request;

import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class UpdateTeamRequest {

    @Size(max = 200)
    private String name;

    @Size(max = 1000)
    private String description;

    @Size(max = 10)
    private String emoji;

    @Size(max = 50)
    private String color;
}
