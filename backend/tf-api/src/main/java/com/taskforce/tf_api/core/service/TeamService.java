package com.taskforce.tf_api.core.service;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.dto.request.AddTeamMemberRequest;
import com.taskforce.tf_api.core.dto.request.CreateTeamRequest;
import com.taskforce.tf_api.core.dto.request.UpdateTeamRequest;
import com.taskforce.tf_api.core.dto.response.TeamMemberResponse;
import com.taskforce.tf_api.core.dto.response.TeamResponse;
import com.taskforce.tf_api.core.model.Team;
import com.taskforce.tf_api.core.model.TeamMember;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.TeamMemberRepository;
import com.taskforce.tf_api.core.repository.TeamRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class TeamService {

    private final TeamRepository       teamRepository;
    private final TeamMemberRepository teamMemberRepository;
    private final WorkspaceRepository  workspaceRepository;
    private final UserRepository       userRepository;

    // =========================================================================
    // Queries
    // =========================================================================

    public List<TeamResponse> listTeams(String slug) {
        Workspace workspace = resolveWorkspace(slug);
        return teamRepository.findByWorkspaceIdOrderByUpdatedAtDesc(workspace.getId())
            .stream()
            .map(this::toResponse)
            .toList();
    }

    public TeamResponse getTeam(String slug, Long teamId) {
        Team team = resolveTeam(slug, teamId);
        return toResponse(team);
    }

    // =========================================================================
    // Commands
    // =========================================================================

    @Transactional
    public TeamResponse createTeam(String slug, Long creatorId, CreateTeamRequest request) {
        Workspace workspace = resolveWorkspace(slug);
        User creator = userRepository.findById(creatorId)
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));

        Team team = Team.builder()
            .workspace(workspace)
            .createdBy(creator)
            .name(request.getName())
            .description(request.getDescription())
            .emoji(request.getEmoji() != null ? request.getEmoji() : "👥")
            .color(request.getColor() != null ? request.getColor() : "bg-primary")
            .build();

        team = teamRepository.save(team);

        // Ajouter le créateur comme LEAD
        TeamMember lead = TeamMember.builder()
            .team(team)
            .user(creator)
            .role(com.taskforce.tf_api.core.enums.TeamRole.LEAD)
            .build();
        teamMemberRepository.save(lead);

        return toResponse(team);
    }

    @Transactional
    public TeamResponse updateTeam(String slug, Long teamId, UpdateTeamRequest request) {
        Team team = resolveTeam(slug, teamId);

        if (request.getName() != null && !request.getName().isBlank()) {
            team.setName(request.getName());
        }
        if (request.getDescription() != null) {
            team.setDescription(request.getDescription());
        }
        if (request.getEmoji() != null && !request.getEmoji().isBlank()) {
            team.setEmoji(request.getEmoji());
        }
        if (request.getColor() != null && !request.getColor().isBlank()) {
            team.setColor(request.getColor());
        }

        team = teamRepository.save(team);
        return toResponse(team);
    }

    @Transactional
    public void deleteTeam(String slug, Long teamId) {
        resolveTeam(slug, teamId);
        teamRepository.deleteById(teamId);
    }

    // =========================================================================
    // Members
    // =========================================================================

    public List<TeamMemberResponse> listMembers(String slug, Long teamId) {
        resolveTeam(slug, teamId);
        return teamMemberRepository.findByTeamId(teamId)
            .stream()
            .map(TeamMemberResponse::from)
            .toList();
    }

    @Transactional
    public TeamMemberResponse addMember(String slug, Long teamId, AddTeamMemberRequest request) {
        Team team = resolveTeam(slug, teamId);

        if (teamMemberRepository.existsByTeamIdAndUserId(teamId, request.getUserId())) {
            throw new IllegalStateException("Cet utilisateur est déjà membre de cette équipe");
        }

        User user = userRepository.findById(request.getUserId())
            .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));

        TeamMember member = TeamMember.builder()
            .team(team)
            .user(user)
            .role(request.getRole() != null ? request.getRole() : com.taskforce.tf_api.core.enums.TeamRole.MEMBER)
            .build();

        member = teamMemberRepository.save(member);
        return TeamMemberResponse.from(member);
    }

    @Transactional
    public void removeMember(String slug, Long teamId, Long userId) {
        resolveTeam(slug, teamId);
        if (!teamMemberRepository.existsByTeamIdAndUserId(teamId, userId)) {
            throw new ResourceNotFoundException("Ce membre n'appartient pas à cette équipe");
        }
        teamMemberRepository.deleteByTeamIdAndUserId(teamId, userId);
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    private Workspace resolveWorkspace(String slug) {
        return workspaceRepository.findBySlug(slug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace introuvable"));
    }

    private Team resolveTeam(String slug, Long teamId) {
        Workspace workspace = resolveWorkspace(slug);
        Team team = teamRepository.findById(teamId)
            .orElseThrow(() -> new ResourceNotFoundException("Équipe introuvable"));
        if (!team.getWorkspace().getId().equals(workspace.getId())) {
            throw new ResourceNotFoundException("Équipe introuvable dans ce workspace");
        }
        return team;
    }

    private TeamResponse toResponse(Team team) {
        List<TeamMemberResponse> members = teamMemberRepository.findByTeamId(team.getId())
            .stream()
            .map(TeamMemberResponse::from)
            .toList();
        return TeamResponse.from(team, members);
    }
}
