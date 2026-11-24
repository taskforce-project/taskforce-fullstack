package com.taskforce.tf_api.core.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.taskforce.tf_api.core.model.MissionPerson;

/** L'identifiant opaque de chaque personne que les dossiers nomment (R159, M6). */
@Repository
public interface MissionPersonRepository extends JpaRepository<MissionPerson, Long> {
}
