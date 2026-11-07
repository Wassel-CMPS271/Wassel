package com.wassel.backend.students.repository;

import com.wassel.backend.students.entity.Student;
import com.wassel.backend.students.entity.StudentStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * {@code search}'s null-parameter handling. These run on H2 (see {@code application-test.yml}),
 * which is lenient about an untyped null bound into a function call, so they cannot reproduce the
 * PostgreSQL failure ("function lower(bytea) does not exist") the {@code CAST(:query AS string)}
 * fix in {@link StudentRepository#search} addresses; they only confirm the query still returns
 * the right students on H2, before and after the fix.
 */
@SpringBootTest
@ActiveProfiles("test")
class StudentRepositoryTests {

	@Autowired
	private StudentRepository repository;

	private final UUID schoolId = UUID.randomUUID();

	@BeforeEach
	void cleanDatabase() {
		repository.deleteAll();
	}

	private Student studentFor(String firstName, String lastName, String guardianName) {
		return repository.saveAndFlush(Student.builder()
				.schoolId(schoolId)
				.firstName(firstName)
				.lastName(lastName)
				.grade("5")
				.guardianName(guardianName)
				.guardianPhone("+96170000000")
				.status(StudentStatus.ACTIVE)
				.build());
	}

	@Test
	void searchWithEveryFilterNullReturnsEveryStudentInTheSchool() {
		studentFor("Lara", "Haddad", "Nour Haddad");
		studentFor("Omar", "Khalil", "Samir Khalil");

		List<Student> results = repository.search(schoolId, null, null, null, null);

		assertEquals(2, results.size());
	}

	@Test
	void searchWithAQueryMatchesFirstLastOrGuardianNameCaseInsensitively() {
		Student lara = studentFor("Lara", "Haddad", "Nour Haddad");
		studentFor("Omar", "Khalil", "Samir Khalil");

		List<Student> results = repository.search(schoolId, null, null, null, "haddad");

		assertEquals(1, results.size());
		assertTrue(results.stream().anyMatch(student -> student.getId().equals(lara.getId())));
	}
}
