package com.wassel.backend.students.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * A student on a school's roster. Every student belongs to exactly one school
 * ({@link #schoolId}, the tenant boundary). Unlike {@code vehicles}/{@code drivers}, there is no
 * database uniqueness constraint on name + guardian phone: it's a plausible (if rare)
 * coincidence for two real students, so it's only a soft duplicate-prevention check in
 * {@code StudentService}, not a hard invariant.
 *
 * <p>{@code address}, {@code latitude}/{@code longitude} (the map pin), and {@code parentUserId}
 * are set after creation via the edit endpoints (SCRUM-166); {@code route} is filterable
 * (SCRUM-167) but nothing sets it yet, pending a future routing feature. All four are nullable:
 * a newly added student has none of them yet.
 */
@Entity
@Table(name = "students")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Student {

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;

	@Column(name = "school_id", nullable = false, updatable = false)
	private UUID schoolId;

	@Column(name = "first_name", nullable = false, length = 100)
	private String firstName;

	@Column(name = "last_name", nullable = false, length = 100)
	private String lastName;

	@Column(nullable = false, length = 50)
	private String grade;

	@Column(name = "guardian_name", nullable = false, length = 100)
	private String guardianName;

	@Column(name = "guardian_phone", nullable = false, length = 30)
	private String guardianPhone;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 20)
	private StudentStatus status;

	@Column(length = 255)
	private String address;

	@Column(precision = 9, scale = 6)
	private BigDecimal latitude;

	@Column(precision = 9, scale = 6)
	private BigDecimal longitude;

	@Column(length = 50)
	private String route;

	@Column(name = "parent_user_id")
	private UUID parentUserId;

	@CreationTimestamp
	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;
}
