package com.wassel.backend.common.exception;

import com.wassel.backend.drivers.exception.DriverAlreadyExistsException;
import com.wassel.backend.drivers.exception.DriverNotFoundException;
import com.wassel.backend.drivers.exception.DriverStatusConflictException;
import com.wassel.backend.drivers.exception.VehicleAssignmentConflictException;
import com.wassel.backend.schools.exception.CalendarDateConflictException;
import com.wassel.backend.schools.exception.HolidayAlreadyExistsException;
import com.wassel.backend.schools.exception.InvalidSchoolTimesException;
import com.wassel.backend.students.exception.StudentAlreadyExistsException;
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

	// Same shape again, keyed by whichever field conflicted (email or phone), for a duplicate
	// driver within a school.
	@ExceptionHandler(DriverAlreadyExistsException.class)
	public ProblemDetail handleDriverAlreadyExists(DriverAlreadyExistsException ex) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, "Driver already exists");
		problem.setProperty("errors", Map.of(ex.getField(), ex.getMessage()));
		return problem;
	}

	@ExceptionHandler(DriverNotFoundException.class)
	public ProblemDetail handleDriverNotFound(DriverNotFoundException ex) {
		return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, ex.getMessage());
	}

	// Same shape again, keyed by "status", for an action that doesn't make sense for the driver's
	// current status (e.g. resending an invite they've already accepted).
	@ExceptionHandler(DriverStatusConflictException.class)
	public ProblemDetail handleDriverStatusConflict(DriverStatusConflictException ex) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, "Driver status conflict");
		problem.setProperty("errors", Map.of("status", ex.getMessage()));
		return problem;
	}

	// Same shape again, keyed by "vehicleId", for a vehicle that can't be assigned (deactivated,
	// or already assigned to another driver).
	@ExceptionHandler(VehicleAssignmentConflictException.class)
	public ProblemDetail handleVehicleAssignmentConflict(VehicleAssignmentConflictException ex) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, "Vehicle assignment conflict");
		problem.setProperty("errors", Map.of("vehicleId", ex.getMessage()));
		return problem;
	}

	// Same shape again, keyed by "guardianPhone", for a student that looks like a duplicate of
	// an existing one (same name and guardian phone) within a school.
	@ExceptionHandler(StudentAlreadyExistsException.class)
	public ProblemDetail handleStudentAlreadyExists(StudentAlreadyExistsException ex) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, "Student already exists");
		problem.setProperty("errors", Map.of("guardianPhone", ex.getMessage()));
		return problem;
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
