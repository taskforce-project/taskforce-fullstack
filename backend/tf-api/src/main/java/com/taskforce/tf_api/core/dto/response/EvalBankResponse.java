package com.taskforce.tf_api.core.dto.response;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import com.taskforce.tf_api.core.service.agent.EvalCriteria;
import com.taskforce.tf_api.core.service.agent.EvalGrader;
import com.taskforce.tf_api.core.service.agent.ReplayOutcome;

/**
 * La banque d'évaluations d'un espace (R61, séance n°10) : son interrupteur, ses cas, ses derniers rejeux.
 * Les autres formes de la banque (le brouillon d'un cas, la note d'un cas, le détail d'un rejeu) vivent ici aussi.
 */
public record EvalBankResponse(boolean enabled, boolean canManage, List<CaseSummary> cases, List<RunSummary> runs) {

    /** Un cas : ce qu'il demande, et quand ses critères ont été figés. */
    public record CaseSummary(Long id, String title, String question, String tool, LocalDateTime createdAt,
                              LocalDateTime criteriaAt, boolean mine) {
    }

    /** Un rejeu : le modèle, les cas notés, ceux qui passent. */
    public record RunSummary(Long id, String model, LocalDateTime startedAt, LocalDateTime finishedAt, int total,
                             int passed) {
    }

    /** Le brouillon d'un cas, tiré du dossier d'une réponse de Cortex : la personne le confirme ou le corrige. */
    public record Draft(String record, String title, String question, LocalDate askedOn, List<String> notes,
                        List<DraftCall> calls, EvalCriteria criteria) {
    }

    /** Un appel d'outil de la réponse, tel que le dossier le garde ; une lecture réussie entre à la cassette. */
    public record DraftCall(String tool, String arguments, String effect, String status, boolean read) {
    }

    /** La note d'un cas dans un rejeu : chaque critère, les appels du modèle, sa réponse, le modèle qui a répondu. */
    public record Result(Long caseId, String title, boolean passed, List<EvalGrader.Check> checks,
                         List<ReplayOutcome.ReplayCall> calls, String answer, String model) {
    }

    /** Un rejeu et les notes de ses cas, dans l'ordre où ils ont été rejoués. */
    public record RunDetail(RunSummary run, List<Result> results) {
    }
}
