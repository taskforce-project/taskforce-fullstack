package com.taskforce.tf_api.modules.ged.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.modules.ged.domain.Attachment;

@Repository
public interface AttachmentRepository extends JpaRepository<Attachment, Long> {

    List<Attachment> findByIssueIdOrderByCreatedAtDesc(Long issueId);

    void deleteByIdAndUploadedById(Long id, Long uploadedById);
}
