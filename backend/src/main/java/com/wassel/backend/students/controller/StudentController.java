package com.wassel.backend.students.controller;

import com.wassel.backend.students.dto.CreateStudentRequest;
import com.wassel.backend.students.dto.StudentResponse;
import com.wassel.backend.students.service.StudentService;
import com.wassel.backend.users.entity.User;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * The school's student roster for the head of transportation. The school is always taken from
 * the authenticated principal, never from the request, so a head of transportation can only
 * read and change their own school's students.
 */
@RestController
@RequestMapping("/api/head-of-transport/students")
@PreAuthorize("hasRole('HEAD_OF_TRANSPORT')")
@RequiredArgsConstructor
public class StudentController {

	private final StudentService studentService;

	@GetMapping
	public List<StudentResponse> listStudents(@AuthenticationPrincipal User headOfTransport) {
		return studentService.listStudents(schoolIdOf(headOfTransport));
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	public StudentResponse addStudent(@AuthenticationPrincipal User headOfTransport,
			@Valid @RequestBody CreateStudentRequest request) {
		return studentService.addStudent(schoolIdOf(headOfTransport), request);
	}

	// Same principal assumption as SchoolSettingsController (see its SCRUM-168 TODO): change both
	// together if the JWT filter uses a different principal type.
	private UUID schoolIdOf(User headOfTransport) {
		if (headOfTransport == null) {
			throw new AccessDeniedException("No authenticated head of transportation");
		}
		return headOfTransport.getSchoolId();
	}
}
