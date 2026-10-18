package com.wassel.backend.students.service;

import com.wassel.backend.geocoding.service.GeocodeResult;
import com.wassel.backend.geocoding.service.Geocoder;
import com.wassel.backend.students.dto.CreateStudentRequest;
import com.wassel.backend.students.dto.StudentResponse;
import com.wassel.backend.students.dto.UpdateStudentAddressRequest;
import com.wassel.backend.students.dto.UpdateStudentLocationRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

/**
 * SCRUM-226: what saving a student's address does to the map pin, written from the ticket's criteria
 * (an address is geocoded and saved; a failed lookup flags the student and never overwrites a pin set
 * by hand), with the geocoding provider replaced by a mock. A "flagged" student is one with no pin.
 * Each test uses its own school, so the tests don't see each other's students.
 */
@SpringBootTest
@ActiveProfiles("test")
class StudentGeocodingCriteriaTests {

	private static final GeocodeResult HAMRA = new GeocodeResult(new BigDecimal("33.893800"), new BigDecimal("35.501800"));

	private static final GeocodeResult ACHRAFIEH = new GeocodeResult(new BigDecimal("33.888400"), new BigDecimal("35.516000"));

	@Autowired
	private StudentService studentService;

	@MockitoBean
	private Geocoder geocoder;

	private UUID school;

	@BeforeEach
	void newSchool() {
		school = UUID.randomUUID();
		when(geocoder.geocode(any())).thenReturn(Optional.empty());
	}

	private UUID newStudent() {
		StudentResponse student = studentService.addStudent(school,
				new CreateStudentRequest("Test", "Student" + UUID.randomUUID(), "Grade 3", "Guardian", "+961 3 123 456", null));
		return student.id();
	}

	private StudentResponse reload(UUID studentId) {
		return studentService.listStudents(school, null, null, null, null).stream()
				.filter(student -> student.id().equals(studentId))
				.findFirst()
				.orElseThrow();
	}

	private void saveAddress(UUID studentId, String address) {
		studentService.updateAddress(school, studentId, new UpdateStudentAddressRequest(address));
	}

	@Test
	void anAddressIsGeocodedAndTheAddressAndPinAreSaved() {
		when(geocoder.geocode(eq("Hamra Street, Beirut"))).thenReturn(Optional.of(HAMRA));
		UUID student = newStudent();

		saveAddress(student, "Hamra Street, Beirut");

		StudentResponse saved = reload(student);
		assertEquals("Hamra Street, Beirut", saved.address());
		assertEquals(0, HAMRA.latitude().compareTo(saved.latitude()));
		assertEquals(0, HAMRA.longitude().compareTo(saved.longitude()));
	}

	@Test
	void changingTheAddressMovesThePinToTheNewAddress() {
		when(geocoder.geocode(eq("Hamra Street, Beirut"))).thenReturn(Optional.of(HAMRA));
		when(geocoder.geocode(eq("Sodeco Square, Beirut"))).thenReturn(Optional.of(ACHRAFIEH));
		UUID student = newStudent();
		saveAddress(student, "Hamra Street, Beirut");

		saveAddress(student, "Sodeco Square, Beirut");

		StudentResponse saved = reload(student);
		assertEquals("Sodeco Square, Beirut", saved.address());
		assertEquals(0, ACHRAFIEH.latitude().compareTo(saved.latitude()));
	}

	@Test
	void aFailedLookupSavesTheAddressAndLeavesNoPinForTheStudent() {
		UUID student = newStudent();

		saveAddress(student, "Somewhere that cannot be found");

		StudentResponse saved = reload(student);
		assertEquals("Somewhere that cannot be found", saved.address());
		assertNull(saved.latitude());
		assertNull(saved.longitude());
	}

	@Test
	void aFailedLookupDoesNotLeaveTheOldPinOnTheNewAddress() {
		when(geocoder.geocode(eq("Hamra Street, Beirut"))).thenReturn(Optional.of(HAMRA));
		UUID student = newStudent();
		saveAddress(student, "Hamra Street, Beirut");

		saveAddress(student, "Somewhere that cannot be found");

		StudentResponse saved = reload(student);
		assertNull(saved.latitude());
		assertNull(saved.longitude());
	}

	@Test
	void aPinSetByHandIsNotMovedWhenTheAddressChangesToOneThatGeocodes() {
		when(geocoder.geocode(eq("Sodeco Square, Beirut"))).thenReturn(Optional.of(ACHRAFIEH));
		UUID student = newStudent();
		studentService.updateLocation(school, student,
				new UpdateStudentLocationRequest(new BigDecimal("33.9000"), new BigDecimal("35.4800")));

		saveAddress(student, "Sodeco Square, Beirut");

		StudentResponse saved = reload(student);
		assertEquals("Sodeco Square, Beirut", saved.address());
		assertEquals(0, new BigDecimal("33.9000").compareTo(saved.latitude()));
		assertEquals(0, new BigDecimal("35.4800").compareTo(saved.longitude()));
	}

	@Test
	void aPinSetByHandIsNotClearedWhenTheNewAddressCannotBeFound() {
		UUID student = newStudent();
		studentService.updateLocation(school, student,
				new UpdateStudentLocationRequest(new BigDecimal("33.9000"), new BigDecimal("35.4800")));

		saveAddress(student, "Somewhere that cannot be found");

		StudentResponse saved = reload(student);
		assertEquals(0, new BigDecimal("33.9000").compareTo(saved.latitude()));
		assertEquals(0, new BigDecimal("35.4800").compareTo(saved.longitude()));
	}

	@Test
	void aPinSetByHandSurvivesSeveralAddressChanges() {
		when(geocoder.geocode(eq("Hamra Street, Beirut"))).thenReturn(Optional.of(HAMRA));
		UUID student = newStudent();
		studentService.updateLocation(school, student,
				new UpdateStudentLocationRequest(new BigDecimal("33.9000"), new BigDecimal("35.4800")));

		saveAddress(student, "Hamra Street, Beirut");
		saveAddress(student, "Somewhere that cannot be found");
		saveAddress(student, "Hamra Street, Beirut");

		assertEquals(0, new BigDecimal("33.9000").compareTo(reload(student).latitude()));
	}

	@Test
	void aStudentWithNoAddressYetHasNoPin() {
		UUID student = newStudent();

		StudentResponse saved = reload(student);
		assertNull(saved.address());
		assertNull(saved.latitude());
	}
}
