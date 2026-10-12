package com.wassel.backend.schools.service;

import com.wassel.backend.schools.dto.CreateHolidayRequest;
import com.wassel.backend.schools.dto.HolidayResponse;
import com.wassel.backend.schools.entity.Holiday;
import com.wassel.backend.schools.exception.CalendarDateConflictException;
import com.wassel.backend.schools.exception.HolidayAlreadyExistsException;
import com.wassel.backend.schools.repository.HalfDayRepository;
import com.wassel.backend.schools.repository.HolidayRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * Manages a school's holiday calendar. Every method takes the school id explicitly and only
 * ever touches that school's holidays, so callers can't cross the tenant boundary.
 */
@Service
@RequiredArgsConstructor
public class HolidayService {

	private static final String DUPLICATE_DATE_MESSAGE = "A holiday is already set for that date.";

	private static final String IS_HALF_DAY_MESSAGE = "That date is marked as a half-day, so it can't also be a holiday.";

	private final HolidayRepository holidayRepository;
	private final HalfDayRepository halfDayRepository;

	/** The school's holidays, earliest first. */
	@Transactional(readOnly = true)
	public List<HolidayResponse> listHolidays(UUID schoolId) {
		return holidayRepository.findBySchoolIdOrderByDateAsc(schoolId).stream()
				.map(this::toResponse)
				.toList();
	}

	@Transactional
	public HolidayResponse addHoliday(UUID schoolId, CreateHolidayRequest request) {
		if (holidayRepository.existsBySchoolIdAndDate(schoolId, request.date())) {
			throw new HolidayAlreadyExistsException(DUPLICATE_DATE_MESSAGE);
		}
		// A day that ends early can't also be a closed day. HalfDayService enforces the reverse.
		if (halfDayRepository.existsBySchoolIdAndDate(schoolId, request.date())) {
			throw new CalendarDateConflictException(IS_HALF_DAY_MESSAGE);
		}

		Holiday holiday = Holiday.builder()
				.schoolId(schoolId)
				.date(request.date())
				.name(request.name().trim())
				.build();
		try {
			return toResponse(holidayRepository.saveAndFlush(holiday));
		} catch (DataIntegrityViolationException e) {
			// Two admins adding the same date at once: the unique constraint is the backstop
			// for the check above.
			throw new HolidayAlreadyExistsException(DUPLICATE_DATE_MESSAGE);
		}
	}

	private HolidayResponse toResponse(Holiday holiday) {
		return new HolidayResponse(holiday.getId(), holiday.getDate(), holiday.getName());
	}
}
