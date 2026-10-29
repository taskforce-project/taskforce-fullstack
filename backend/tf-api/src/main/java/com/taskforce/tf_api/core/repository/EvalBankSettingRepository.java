package com.taskforce.tf_api.core.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.model.EvalBankSetting;

@Repository
public interface EvalBankSettingRepository extends JpaRepository<EvalBankSetting, Long> {
}
