package com.wassel.backend.schools.repository;

import com.wassel.backend.schools.entity.SchoolSettings;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

/**
 * The primary key is the school id, so {@code findById(schoolId)} is the tenant-scoped lookup.
 */
public interface SchoolSettingsRepository extends JpaRepository<SchoolSettings, UUID> {
}
