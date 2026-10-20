package com.taskforce.tf_api.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.taskforce.tf_api.core.dto.response.DesktopProfileResponse;
import com.taskforce.tf_api.core.dto.response.MemberSkillProfileResponse;
import com.taskforce.tf_api.core.model.NotificationPreference;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.NotificationPreferenceRepository;

@ExtendWith(MockitoExtension.class)
@DisplayName("DesktopProfileReader : réglages du compte repris par l'app desktop")
class DesktopProfileReaderTest {

    @Mock private MemberSkillProfileService skillProfiles;
    @Mock private NotificationPreferenceRepository notificationPreferences;
    @InjectMocks private DesktopProfileReader reader;

    private static final User ADA = User.builder().id(7L).email("ada@example.com").jobTitle("Engineering lead")
        .onboardingCompleted(true).build();

    @Test
    @DisplayName("rôle, onboarding, profil de compétences le plus récent et notifications")
    void reads_the_account_settings() {
        when(skillProfiles.latestForUser(7L)).thenReturn(Optional.of(MemberSkillProfileResponse.builder().userId(7L)
            .skills(List.of("Java", "React")).profileText("Backend first").capacityHoursPerWeek(32).seniority("SENIOR")
            .growthEnabled(true).growthTargetSkills(List.of("Rust")).build()));
        when(notificationPreferences.findByUserId(7L)).thenReturn(List.of(
            NotificationPreference.builder().eventKey("issue_assigned").inApp(true).email(false).build()));

        DesktopProfileResponse profile = reader.read(ADA);

        assertThat(profile.jobTitle()).isEqualTo("Engineering lead");
        assertThat(profile.onboardingCompleted()).isTrue();
        assertThat(profile.skills().getSkills()).containsExactly("Java", "React");
        assertThat(profile.skills().getSeniority()).isEqualTo("SENIOR");
        assertThat(profile.skills().getCapacityHoursPerWeek()).isEqualTo(32);
        assertThat(profile.skills().getGrowthEnabled()).isTrue();
        assertThat(profile.skills().getGrowthTargetSkills()).containsExactly("Rust");
        assertThat(profile.skills().getProfileText()).isEqualTo("Backend first");
        assertThat(profile.notifications()).singleElement().satisfies(item -> {
            assertThat(item.getEventKey()).isEqualTo("issue_assigned");
            assertThat(item.getInApp()).isTrue();
            assertThat(item.getEmail()).isFalse();
        });
    }

    @Test
    @DisplayName("un compte sans profil ni préférence : rien à reprendre que le rôle et l'onboarding")
    void empty_account() {
        when(skillProfiles.latestForUser(8L)).thenReturn(Optional.empty());
        when(notificationPreferences.findByUserId(8L)).thenReturn(List.of());

        DesktopProfileResponse profile = reader.read(User.builder().id(8L).email("new@example.com").build());

        assertThat(profile.skills()).isNull();
        assertThat(profile.notifications()).isEmpty();
        assertThat(profile.onboardingCompleted()).isFalse();
    }
}
