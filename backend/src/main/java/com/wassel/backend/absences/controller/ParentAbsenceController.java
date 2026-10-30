package com.wassel.backend.absences.controller;

import com.wassel.backend.absences.dto.AbsenceResponse;
import com.wassel.backend.absences.dto.ReportAbsenceRequest;
import com.wassel.backend.absences.service.AbsenceService;
import com.wassel.backend.users.entity.User;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * A parent's own children's absences. The school and the parent are always taken from the
 * authenticated user, never from the request; {@link AbsenceService} still checks
 * {@code studentId} against that parent on every call, so a parent can only ever reach their own
 * children, never another family's by guessing an id.
 */
@RestController
@RequestMapping("/api/parent/children/{studentId}/absences")
@PreAuthorize("hasRole('PARENT')")
@RequiredArgsConstructor
public class ParentAbsenceController {

	private final AbsenceService absenceService;

	@GetMapping
	public List<AbsenceResponse> listAbsences(@AuthenticationPrincipal User parent, @PathVariable UUID studentId) {
		return absenceService.listUpcoming(schoolIdOf(parent), parent.getId(), studentId);
	}

	@PostMapping
	public ResponseEntity<AbsenceResponse> reportAbsence(@AuthenticationPrincipal User parent,
			@PathVariable UUID studentId, @Valid @RequestBody ReportAbsenceRequest request) {
		AbsenceService.ReportResult result = absenceService.reportAbsence(schoolIdOf(parent), parent.getId(),
				studentId, request);
		return ResponseEntity.status(result.created() ? HttpStatus.CREATED : HttpStatus.OK).body(result.absence());
	}

	@DeleteMapping("/{absenceId}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void cancelAbsence(@AuthenticationPrincipal User parent, @PathVariable UUID studentId,
			@PathVariable UUID absenceId) {
		absenceService.cancelAbsence(schoolIdOf(parent), parent.getId(), studentId, absenceId);
	}

	// Same principal assumption as SchoolSettingsController (see its SCRUM-168 TODO): change
	// every controller together if the JWT filter ever uses a different principal type.
	private UUID schoolIdOf(User parent) {
		if (parent == null) {
			throw new AccessDeniedException("No authenticated parent");
		}
		return parent.getSchoolId();
	}
}
