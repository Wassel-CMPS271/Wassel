package com.wassel.backend.repository;

import com.wassel.backend.entity.SchoolSettings;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

/**
 * The primary key is the school id, so {@code findById(schoolId)} is the tenant-scoped lookup.
 */
public interface SchoolSettingsRepository extends JpaRepository<SchoolSettings, UUID> {
}
