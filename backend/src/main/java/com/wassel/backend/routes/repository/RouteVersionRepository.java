package com.wassel.backend.routes.repository;

import com.wassel.backend.routes.entity.RouteVersion;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.UUID;

public interface RouteVersionRepository extends JpaRepository<RouteVersion, UUID> {

	@Modifying
	@Query("delete from RouteVersion v where v.schoolId = :schoolId and v.routeId = :routeId")
	void deleteForRoute(@Param("schoolId") UUID schoolId, @Param("routeId") UUID routeId);
}
