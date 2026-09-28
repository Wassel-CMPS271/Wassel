package com.wassel.backend.schools.service;

import com.wassel.backend.schools.dto.SchoolTimesRequest;
import com.wassel.backend.schools.dto.SchoolTimesResponse;
import com.wassel.backend.schools.entity.SchoolSettings;
import com.wassel.backend.schools.exception.InvalidSchoolTimesException;
import com.wassel.backend.schools.repository.SchoolSettingsRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * Reads and updates a school's settings. Every method takes the school id explicitly and
 * only ever touches that school's row, so callers can't cross the tenant boundary.
 */
@Service
@RequiredArgsConstructor
public class SchoolSettingsService {

	private final SchoolSettingsRepository schoolSettingsRepository;

	@Transactional(readOnly = true)
	public SchoolTimesResponse getTimes(UUID schoolId) {
		return schoolSettingsRepository.findById(schoolId)
				.map(this::toResponse)
				.orElseGet(() -> new SchoolTimesResponse(null, null));
	}

	@Transactional
	public SchoolTimesResponse updateTimes(UUID schoolId, SchoolTimesRequest request) {
		if (!request.dismissalTime().isAfter(request.arrivalTime())) {
			throw new InvalidSchoolTimesException("Dismissal time must be after arrival time.");
		}

		SchoolSettings settings = schoolSettingsRepository.findById(schoolId)
				.orElseGet(() -> SchoolSettings.builder().schoolId(schoolId).build());
		settings.setArrivalTime(request.arrivalTime());
		settings.setDismissalTime(request.dismissalTime());
		return toResponse(schoolSettingsRepository.save(settings));
	}

	private SchoolTimesResponse toResponse(SchoolSettings settings) {
		return new SchoolTimesResponse(settings.getArrivalTime(), settings.getDismissalTime());
	}
}
