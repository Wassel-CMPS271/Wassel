package com.wassel.backend.common.exception;

import com.wassel.backend.schools.exception.CalendarDateConflictException;
import com.wassel.backend.schools.exception.HolidayAlreadyExistsException;
import com.wassel.backend.schools.exception.InvalidSchoolTimesException;
import com.wassel.backend.vehicles.exception.VehicleAlreadyExistsException;
import com.wassel.backend.vehicles.exception.VehicleNotFoundException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Translates exceptions thrown from controllers into RFC 9457 problem responses.
 */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

	@ExceptionHandler(MethodArgumentNotValidException.class)
	public ProblemDetail handleValidation(MethodArgumentNotValidException ex) {
		Map<String, String> errors = new LinkedHashMap<>();
		for (FieldError error : ex.getBindingResult().getFieldErrors()) {
			errors.putIfAbsent(error.getField(), error.getDefaultMessage());
		}
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Validation failed");
		problem.setProperty("errors", errors);
		return problem;
	}

	// Unparseable body or field, e.g. malformed JSON or a time that isn't HH:mm. Without this the
	// catch-all below would turn a client mistake into a 500.
	@ExceptionHandler(HttpMessageNotReadableException.class)
	public ProblemDetail handleUnreadableBody(HttpMessageNotReadableException ex) {
		return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Malformed request body");
	}

	// Same "errors" shape as bean validation so clients can render it against the field.
	@ExceptionHandler(InvalidSchoolTimesException.class)
	public ProblemDetail handleInvalidSchoolTimes(InvalidSchoolTimesException ex) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Validation failed");
		problem.setProperty("errors", Map.of("dismissalTime", ex.getMessage()));
		return problem;
	}

	// Same "errors" shape as validation, keyed by the offending field, so clients can show it there.
	@ExceptionHandler(HolidayAlreadyExistsException.class)
	public ProblemDetail handleHolidayAlreadyExists(HolidayAlreadyExistsException ex) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, "Holiday already exists");
		problem.setProperty("errors", Map.of("date", ex.getMessage()));
		return problem;
	}

	// Same shape again for a date that clashes with another calendar entry (half-day vs holiday).
	@ExceptionHandler(CalendarDateConflictException.class)
	public ProblemDetail handleCalendarDateConflict(CalendarDateConflictException ex) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, "Calendar date conflict");
		problem.setProperty("errors", Map.of("date", ex.getMessage()));
		return problem;
	}

	// Same shape again, keyed by plate number, for a duplicate vehicle plate within a school.
	@ExceptionHandler(VehicleAlreadyExistsException.class)
	public ProblemDetail handleVehicleAlreadyExists(VehicleAlreadyExistsException ex) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, "Vehicle already exists");
		problem.setProperty("errors", Map.of("plateNumber", ex.getMessage()));
		return problem;
	}

	@ExceptionHandler(VehicleNotFoundException.class)
	public ProblemDetail handleVehicleNotFound(VehicleNotFoundException ex) {
		return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, ex.getMessage());
	}

	// Thrown by @PreAuthorize checks inside the MVC layer.
	@ExceptionHandler(AccessDeniedException.class)
	public ProblemDetail handleAccessDenied(AccessDeniedException ex) {
		return ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN, "Access denied");
	}

	@ExceptionHandler(Exception.class)
	public ProblemDetail handleUnexpected(Exception ex) {
		log.error("Unhandled exception", ex);
		return ProblemDetail.forStatusAndDetail(HttpStatus.INTERNAL_SERVER_ERROR, "An unexpected error occurred");
	}
}
