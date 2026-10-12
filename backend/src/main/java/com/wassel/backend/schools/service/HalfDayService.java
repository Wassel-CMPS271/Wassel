package com.wassel.backend.schools.service;

import com.wassel.backend.schools.dto.CreateHalfDayRequest;
import com.wassel.backend.schools.dto.HalfDayResponse;
import com.wassel.backend.schools.entity.HalfDay;
import com.wassel.backend.schools.exception.CalendarDateConflictException;
import com.wassel.backend.schools.repository.HalfDayRepository;
import com.wassel.backend.schools.repository.HolidayRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * Manages a school's half-days. Every method takes the school id explicitly and only ever
 * touches that school's rows, so callers can't cross the tenant boundary.
 */
@Service
@RequiredArgsConstructor
public class HalfDayService {

	private static final String ALREADY_HALF_DAY_MESSAGE = "That date is already marked as a half-day.";
	private static final String IS_HOLIDAY_MESSAGE = "That date is a holiday, so it can't also be a half-day.";

	private final HalfDayRepository halfDayRepository;
	private final HolidayRepository holidayRepository;

	/** The school's half-days, earliest first. */
	@Transactional(readOnly = true)
	public List<HalfDayResponse> listHalfDays(UUID schoolId) {
		return halfDayRepository.findBySchoolIdOrderByDateAsc(schoolId).stream()
				.map(this::toResponse)
				.toList();
	}

	@Transactional
	public HalfDayResponse addHalfDay(UUID schoolId, CreateHalfDayRequest request) {
		if (halfDayRepository.existsBySchoolIdAndDate(schoolId, request.date())) {
			throw new CalendarDateConflictException(ALREADY_HALF_DAY_MESSAGE);
		}
		// A closed day can't end early. HolidayService enforces the reverse.
		if (holidayRepository.existsBySchoolIdAndDate(schoolId, request.date())) {
			throw new CalendarDateConflictException(IS_HOLIDAY_MESSAGE);
		}

		HalfDay halfDay = HalfDay.builder().schoolId(schoolId).date(request.date()).build();
		try {
			return toResponse(halfDayRepository.saveAndFlush(halfDay));
		} catch (DataIntegrityViolationException e) {
			// Two admins marking the same date at once: the unique constraint is the backstop
			// for the check above.
			throw new CalendarDateConflictException(ALREADY_HALF_DAY_MESSAGE);
		}
	}

	private HalfDayResponse toResponse(HalfDay halfDay) {
		return new HalfDayResponse(halfDay.getId(), halfDay.getDate());
	}
}
