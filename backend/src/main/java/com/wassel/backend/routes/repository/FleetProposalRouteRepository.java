package com.wassel.backend.routes.repository;

import com.wassel.backend.routes.entity.FleetProposalRoute;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface FleetProposalRouteRepository extends JpaRepository<FleetProposalRoute, UUID> {

	List<FleetProposalRoute> findByProposalId(UUID proposalId);

	@Modifying
	@Query("delete from FleetProposalRoute r where r.proposalId = :proposalId")
	void deleteForProposal(@Param("proposalId") UUID proposalId);

	@Modifying
	@Query("delete from FleetProposalRoute r where r.schoolId = :schoolId")
	void deleteForSchool(@Param("schoolId") UUID schoolId);
}
