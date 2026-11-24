package com.wassel.backend.students.service;

import com.wassel.backend.geocoding.service.Geocoder;
import com.wassel.backend.students.dto.ImportRowResult;
import com.wassel.backend.students.dto.ImportStudentRow;
import com.wassel.backend.students.dto.ImportStudentsRequest;
import com.wassel.backend.students.dto.ImportStudentsResponse;
import com.wassel.backend.students.entity.Student;
import com.wassel.backend.students.entity.StudentStatus;
import com.wassel.backend.students.exception.InvalidImportException;
import com.wassel.backend.students.repository.StudentRepository;
import com.wassel.backend.users.service.UserService;
import jakarta.validation.Validation;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.IntStream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * SCRUM-300, the import rules of docs/contracts/students-import.md, with a real validator and a mocked repository
 * (no database): a request malformed as a whole, the per-row field checks, and both kinds of duplicate.
 */
class StudentImportServiceTests {

	private static final UUID SCHOOL = UUID.randomUUID();

	private static final String PHONE_FORMAT = "Use a format like \"+961 3 123 456\" or \"+961 70 234 567\"";

	private StudentRepository repository;

	private Geocoder geocoder;

	private StudentService service;

	@BeforeEach
	void setUp() {
		repository = mock(StudentRepository.class);
		geocoder = mock(Geocoder.class);
		when(repository.saveAllAndFlush(any())).thenAnswer(call -> call.getArgument(0));
		service = new StudentService(repository, mock(UserService.class), geocoder,
				Validation.buildDefaultValidatorFactory().getValidator());
	}

	private static ImportStudentRow row(int number, String first, String last, String phone) {
		return new ImportStudentRow(number, first, last, "Grade 3", "Guardian", phone);
	}

	private ImportStudentsResponse send(ImportStudentRow... rows) {
		return service.importStudents(SCHOOL, new ImportStudentsRequest(List.of(rows)));
	}

	@SuppressWarnings("unchecked")
	private List<Student> saved() {
		ArgumentCaptor<List<Student>> captor = ArgumentCaptor.forClass(List.class);
		verify(repository).saveAllAndFlush(captor.capture());
		return captor.getValue();
	}

	private String malformed(ImportStudentsRequest request) {
		return assertThrows(InvalidImportException.class, () -> service.importStudents(SCHOOL, request)).getMessage();
	}

	// ---- malformed as a whole: 400, nothing created ----

	@Test
	void noRowsEmptyOrOver500IsMalformedAndCreatesNobody() {
		String size = "Import between 1 and 500 students at a time.";
		assertEquals(size, malformed(null));
		assertEquals(size, malformed(new ImportStudentsRequest(null)));
		assertEquals(size, malformed(new ImportStudentsRequest(List.of())));
		List<ImportStudentRow> tooMany = IntStream.rangeClosed(1, 501)
				.mapToObj(i -> row(i, "A", "B", "+961 3 123 456")).toList();
		assertEquals(size, malformed(new ImportStudentsRequest(tooMany)));
		verify(repository, never()).saveAllAndFlush(any());
	}

	@Test
	void exactly500RowsIsAccepted() {
		List<ImportStudentRow> rows = IntStream.rangeClosed(1, 500)
				.mapToObj(i -> row(i, "First" + i, "Last", "+961 3 123 456")).toList();
		assertEquals(500, service.importStudents(SCHOOL, new ImportStudentsRequest(rows)).created());
	}

	@Test
	void aMissingNullOrNonPositiveRowNumberIsMalformed() {
		String message = "Every row needs a row number of 1 or more.";
		List<ImportStudentRow> withNull = new ArrayList<>();
		withNull.add(row(2, "A", "B", "+961 3 123 456"));
		withNull.add(null);
		assertEquals(message, malformed(new ImportStudentsRequest(withNull)));
		assertEquals(message, malformed(new ImportStudentsRequest(List.of(
				new ImportStudentRow(null, "A", "B", "G", "G", "+961 3 123 456")))));
		assertEquals(message, malformed(new ImportStudentsRequest(List.of(row(0, "A", "B", "+961 3 123 456")))));
		assertEquals(message, malformed(new ImportStudentsRequest(List.of(row(-4, "A", "B", "+961 3 123 456")))));
		verify(repository, never()).saveAllAndFlush(any());
	}

	@Test
	void aRepeatedRowNumberNamesTheFirstRepeatedOneInRequestOrder() {
		assertEquals("Row 3 appears more than once.", malformed(new ImportStudentsRequest(List.of(
				row(2, "A", "B", "+961 3 123 456"), row(3, "C", "D", "+961 3 123 457"),
				row(3, "E", "F", "+961 3 123 458"), row(4, "G", "H", "+961 3 123 459")))));
		// 5 is used again before 3 is, so 5 is "the first repeated one" even though 3 repeats too.
		assertEquals("Row 5 appears more than once.", malformed(new ImportStudentsRequest(List.of(
				row(5, "A", "B", "+961 3 123 456"), row(3, "C", "D", "+961 3 123 457"),
				row(5, "E", "F", "+961 3 123 458"), row(3, "G", "H", "+961 3 123 459")))));
	}

	@Test
	void theChecksRunInOrderSoABadRowNumberBeatsARepeat() {
		assertEquals("Every row needs a row number of 1 or more.", malformed(new ImportStudentsRequest(List.of(
				row(2, "A", "B", "+961 3 123 456"), row(2, "C", "D", "+961 3 123 457"),
				row(0, "E", "F", "+961 3 123 458")))));
	}

	// ---- rows that all succeed ----

	@Test
	void everyGoodRowIsCreatedActiveWithNoAddressRouteOrParentAndNothingIsGeocoded() {
		ImportStudentsResponse response = send(row(2, "Nour", "Haddad", "+961 3 123 456"),
				row(3, "Omar", "Haddad", "+961 70 234 567"));

		assertEquals(2, response.created());
		assertEquals(0, response.rejected());
		assertEquals(List.of(2, 3), response.results().stream().map(ImportRowResult::row).toList());
		for (ImportRowResult result : response.results()) {
			assertEquals("created", result.status());
			assertNull(result.errors());
			assertEquals("active", result.student().status());
			assertNull(result.student().address());
			assertNull(result.student().latitude());
			assertNull(result.student().route());
			assertNull(result.student().parentUserId());
		}
		for (Student student : saved()) {
			assertEquals(SCHOOL, student.getSchoolId());
			assertEquals(StudentStatus.ACTIVE, student.getStatus());
			assertNull(student.getAddress());
		}
		verifyNoInteractions(geocoder);
	}

	@Test
	void studentsAreSavedInRequestOrder() {
		send(row(9, "Zed", "Z", "+961 3 123 456"), row(2, "Amy", "A", "+961 3 123 457"));
		assertEquals(List.of("Zed", "Amy"), saved().stream().map(Student::getFirstName).toList());
	}

	@Test
	void valuesAreTrimmedIncludingNonBreakingSpacesAndAByteOrderMark() {
		ImportStudentsResponse response = send(new ImportStudentRow(2, "﻿  Nour ", " Haddad ",
				" Grade 3 ", "  Guardian ", "+961 3 123 456 "));

		assertEquals(1, response.created());
		Student student = saved().get(0);
		assertEquals("Nour", student.getFirstName());
		assertEquals("Haddad", student.getLastName());
		assertEquals("Grade 3", student.getGrade());
		assertEquals("Guardian", student.getGuardianName());
		assertEquals("+961 3 123 456", student.getGuardianPhone());
	}

	// ---- field errors: one message per field, "is required" wins ----

	@Test
	void aRowWithBadFieldsIsRejectedWithEveryOne_andTheOthersAreUntouched() {
		ImportStudentsResponse response = send(
				row(2, "Nour", "Haddad", "+961 3 123 456"),
				row(5, "Rami", "Aziz", "03 123 456"),
				new ImportStudentRow(8, "", "Haddad", "  ", "Guardian", "+961 3 123 999"));

		assertEquals(1, response.created());
		assertEquals(2, response.rejected());
		assertEquals("created", response.results().get(0).status());
		assertEquals(Map.of("guardianPhone", PHONE_FORMAT), response.results().get(1).errors());
		assertEquals(Map.of("firstName", "First name is required", "grade", "Grade is required"),
				response.results().get(2).errors());
		assertNull(response.results().get(1).student());
		assertEquals(1, saved().size());
	}

	@Test
	void aBlankPhoneGetsOnlyTheRequiredMessageNeverTheFormatOne() {
		for (String blank : new String[] { null, "", "   ", " ", "﻿" }) {
			Map<String, String> errors = send(row(2, "A", "B", blank)).results().get(0).errors();
			assertEquals(Map.of("guardianPhone", "Guardian phone is required"), errors, String.valueOf(blank));
		}
	}

	@Test
	void aNameMadeOnlyOfNonBreakingSpacesIsRequired() {
		Map<String, String> errors = send(row(2, "  ", "B", "+961 3 123 456")).results().get(0).errors();
		assertEquals(Map.of("firstName", "First name is required"), errors);
	}

	@Test
	void valuesLongerThanTheirColumnsAreFieldErrorsNotADatabaseError() {
		ImportStudentsResponse response = send(
				new ImportStudentRow(2, "a".repeat(101), "b".repeat(101), "c".repeat(51), "d".repeat(101),
						"+961 3 123 456"),
				new ImportStudentRow(3, "a".repeat(100), "b".repeat(100), "c".repeat(50), "d".repeat(100),
						"+961 3 123 457"),
				row(4, "A", "B", "+961 3 123 456 " + "9".repeat(40)));

		assertEquals(Map.of("firstName", "First name must be 100 characters or fewer",
				"lastName", "Last name must be 100 characters or fewer",
				"grade", "Grade must be 50 characters or fewer",
				"guardianName", "Guardian name must be 100 characters or fewer"), response.results().get(0).errors());
		assertEquals("created", response.results().get(1).status());
		assertEquals(Map.of("guardianPhone", PHONE_FORMAT), response.results().get(2).errors());
	}

	@Test
	void aRowWithFieldErrorsNeverRunsTheDuplicateCheck() {
		send(new ImportStudentRow(2, "", "Haddad", "Grade 3", "Guardian", "+961 3 123 456"));
		verify(repository, never())
				.existsBySchoolIdAndFirstNameIgnoreCaseAndLastNameIgnoreCaseAndGuardianPhone(any(), anyString(),
						anyString(), anyString());
	}

	// ---- duplicates ----

	@Test
	void aStudentAlreadyInTheRosterIsRejectedWithSingleCreatesTextAndTheNamesAsSent() {
		when(repository.existsBySchoolIdAndFirstNameIgnoreCaseAndLastNameIgnoreCaseAndGuardianPhone(SCHOOL, "Tarek",
				"Mansour", "+961 3 100 101")).thenReturn(true);

		ImportStudentsResponse response = send(row(7, "  Tarek ", "Mansour", "+961 3 100 101"));

		assertEquals(0, response.created());
		assertEquals(Map.of("guardianPhone",
				"A student named Tarek Mansour with guardian phone +961 3 100 101 already exists."),
				response.results().get(0).errors());
	}

	@Test
	void aRepeatInsideTheRequestNamesTheFirstCopyEvenInAnotherLetterCase() {
		when(repository.sameName("Nour", "Haddad", "NOUR", "haddad")).thenReturn(true);

		ImportStudentsResponse response = send(row(2, "Nour", "Haddad", "+961 3 123 456"),
				row(6, "NOUR", "haddad", "+961 3 123 456"), row(9, "Nour", "Haddad", "+961 3 123 456"));

		assertEquals("created", response.results().get(0).status());
		assertEquals(Map.of("guardianPhone", "Same student and guardian phone as row 2."),
				response.results().get(1).errors());
		// Exactly equal: no need to ask the database, and still named after the FIRST copy, not row 6.
		assertEquals(Map.of("guardianPhone", "Same student and guardian phone as row 2."),
				response.results().get(2).errors());
		assertEquals(1, saved().size());
	}

	@Test
	void theLetterCaseComparisonIsTheDatabasesNotJavas() {
		// Same phone, names Java's equals() says differ: the answer comes from the database, here "not the same".
		when(repository.sameName(anyString(), anyString(), anyString(), anyString())).thenReturn(false);

		ImportStudentsResponse response = send(row(2, "Strasse", "B", "+961 3 123 456"),
				row(3, "STRASSE", "B", "+961 3 123 456"));

		assertEquals(2, response.created());
		verify(repository).sameName("Strasse", "B", "STRASSE", "B");
	}

	@Test
	void theSameNameWithAnotherPhoneIsADifferentStudentAndIsNotCompared() {
		ImportStudentsResponse response = send(row(2, "Nour", "Haddad", "+961 3 123 456"),
				row(3, "Nour", "Haddad", "+961 3 123 457"));

		assertEquals(2, response.created());
		verify(repository, never()).sameName(anyString(), anyString(), anyString(), anyString());
	}

	@Test
	void everyLaterCopyOfARowThatWasAlreadyInTheRosterNamesTheFirstCopyNotTheRoster() {
		when(repository.existsBySchoolIdAndFirstNameIgnoreCaseAndLastNameIgnoreCaseAndGuardianPhone(eq(SCHOOL),
				eq("Tarek"), eq("Mansour"), anyString())).thenReturn(true);

		ImportStudentsResponse response = send(row(2, "Tarek", "Mansour", "+961 3 100 101"),
				row(3, "Tarek", "Mansour", "+961 3 100 101"));

		assertTrue(response.results().get(0).errors().get("guardianPhone").contains("already exists"));
		assertEquals(Map.of("guardianPhone", "Same student and guardian phone as row 2."),
				response.results().get(1).errors());
	}

	@Test
	void aRowRejectedForItsFieldsIsNotTheFirstCopyOfAnything() {
		// Row 2 is invalid (no grade), so row 3 with the same names and phone is judged on its own and is created.
		ImportStudentsResponse response = send(
				new ImportStudentRow(2, "Nour", "Haddad", "", "Guardian", "+961 3 123 456"),
				row(3, "Nour", "Haddad", "+961 3 123 456"));

		assertEquals(Map.of("grade", "Grade is required"), response.results().get(0).errors());
		assertEquals("created", response.results().get(1).status());
	}

	@Test
	void createdPlusRejectedIsAlwaysTheNumberOfRowsSent() {
		ImportStudentsResponse response = send(row(2, "A", "B", "+961 3 123 456"), row(3, "", "B", "+961 3 123 457"),
				row(4, "C", "D", "bad"), row(5, "A", "B", "+961 3 123 456"));

		assertEquals(4, response.created() + response.rejected());
		assertEquals(4, response.results().size());
		assertEquals(1, response.created());
	}
}
