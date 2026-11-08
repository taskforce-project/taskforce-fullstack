package com.taskforce.tf_api.core.repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.model.ModelBlindTrialAnswer;

@Repository
public interface ModelBlindTrialAnswerRepository extends JpaRepository<ModelBlindTrialAnswer, Long> {

    Optional<ModelBlindTrialAnswer> findByTrialIdAndLetter(Long trialId, String letter);

    List<ModelBlindTrialAnswer> findByTrialIdOrderByLetterAsc(Long trialId);

    List<ModelBlindTrialAnswer> findByTrialIdInOrderByLetterAsc(Collection<Long> trialIds);
}
