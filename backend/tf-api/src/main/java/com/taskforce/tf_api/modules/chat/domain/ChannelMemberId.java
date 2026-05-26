package com.taskforce.tf_api.modules.chat.domain;

import java.io.Serializable;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.AllArgsConstructor;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Embeddable
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode
public class ChannelMemberId implements Serializable {

    @Column(name = "channel_id")
    private Long channelId;

    @Column(name = "user_id")
    private Long userId;
}
