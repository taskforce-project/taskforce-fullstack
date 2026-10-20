package com.taskforce.tf_api.core.service;

import java.util.List;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.dto.request.UpdateNotificationPreferencesRequest;
import com.taskforce.tf_api.core.dto.request.UpsertMemberSkillsRequest;
import com.taskforce.tf_api.core.dto.response.DesktopProfileResponse;
import com.taskforce.tf_api.core.dto.response.MemberSkillProfileResponse;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.NotificationPreferenceRepository;

import lombok.RequiredArgsConstructor;

/**
 * Lit les réglages d'un compte que l'app desktop reprend (cf. {@link DesktopProfileResponse}) : rôle, onboarding fait,
 * profil de compétences le plus récent et préférences de notification.
 */
@Service
@Profile("!desktop")
@RequiredArgsConstructor
public class DesktopProfileReader {

    private final MemberSkillProfileService skillProfiles;
    private final NotificationPreferenceRepository notificationPreferences;

    @Transactional(readOnly = true)
    public DesktopProfileResponse read(User user) {
        UpsertMemberSkillsRequest skills = skillProfiles.latestForUser(user.getId())
            .map(DesktopProfileReader::toRequest)
            .orElse(null);
        List<UpdateNotificationPreferencesRequest.Item> notifications = notificationPreferences.findByUserId(user.getId())
            .stream()
            .map(preference -> {
                UpdateNotificationPreferencesRequest.Item item = new UpdateNotificationPreferencesRequest.Item();
                item.setEventKey(preference.getEventKey());
                item.setInApp(preference.isInApp());
                item.setEmail(preference.isEmail());
                return item;
            })
            .toList();
        return new DesktopProfileResponse(user.getJobTitle(), Boolean.TRUE.equals(user.getOnboardingCompleted()),
            skills, notifications);
    }

    private static UpsertMemberSkillsRequest toRequest(MemberSkillProfileResponse profile) {
        UpsertMemberSkillsRequest request = new UpsertMemberSkillsRequest();
        request.setSkills(profile.getSkills());
        request.setProfileText(profile.getProfileText());
        request.setCapacityHoursPerWeek(profile.getCapacityHoursPerWeek());
        request.setSeniority(profile.getSeniority());
        request.setGrowthEnabled(profile.isGrowthEnabled());
        request.setGrowthTargetSkills(profile.getGrowthTargetSkills());
        return request;
    }
}
