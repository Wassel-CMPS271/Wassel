package com.wassel.backend.routes.repository;

import com.wassel.backend.routes.entity.RouteProposal;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

/** Every query is scoped by school id and route id, so a proposal can't be reached through another route. */
public interface RouteProposalRepository extends JpaRepository<RouteProposal, UUID> {

	Optional<RouteProposal> findBySchoolIdAndRouteIdAndId(UUID schoolId, UUID routeId, UUID id);

	/**
	 * Deletes the proposal and returns how many rows went: 1 for the request that got it, 0 for
	 * one that lost a race or named a proposal that is gone. A bulk delete rather than a derived
	 * one, so two applies of the same proposal cannot both win.
	 */
	@Modifying
	@Query("delete from RouteProposal p where p.schoolId = :schoolId and p.routeId = :routeId and p.id = :id")
	int claim(@Param("schoolId") UUID schoolId, @Param("routeId") UUID routeId, @Param("id") UUID id);

	@Modifying
	@Query("delete from RouteProposal p where p.schoolId = :schoolId and p.routeId = :routeId")
	void deleteForRoute(@Param("schoolId") UUID schoolId, @Param("routeId") UUID routeId);
}
