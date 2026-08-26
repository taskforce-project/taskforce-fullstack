package com.taskforce.tf_api.core.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.taskforce.tf_api.core.model.UserTwoFactor;

public interface UserTwoFactorRepository extends JpaRepository<UserTwoFactor, Long> {

    Optional<UserTwoFactor> findByUserId(Long userId);

    boolean existsByUserIdAndEnabledTrue(Long userId);

    void deleteByUserId(Long userId);
}
