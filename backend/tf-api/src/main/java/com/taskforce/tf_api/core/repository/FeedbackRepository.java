package com.taskforce.tf_api.core.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.model.Feedback;

/** Accès aux retours utilisateur (« Give feedback »). */
@Repository
public interface FeedbackRepository extends JpaRepository<Feedback, Long> {
}
