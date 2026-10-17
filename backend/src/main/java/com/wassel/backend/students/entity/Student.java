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
import org.hibernate.annotations.DynamicUpdate;

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
 *
 * <p>{@code routeId} and {@code stopPosition} (SCRUM-209) are the real route assignment: a
 * student is a stop on at most one route, and {@code stopPosition} orders the stops within it.
 * The old text {@code route} column is untouched and keeps working for filtering until the
 * screens use {@code routeId} instead (routing contract, "Draft rules"). {@code stopPosition} is
 * a watermark (next = current max + 1), not a compacted 1..n sequence, so removing a stop never
 * reassigns another student's position; display order always comes from sorting by it, never
 * from its raw value.
 *
 * <p>{@code manualPin} (SCRUM-211) is true once {@code latitude}/{@code longitude} were set by a
 * human correcting the map pin, not the geocoder. Saving a new address never overwrites a pin
 * once this is true.
 *
 * <p>Updates write only the changed columns ({@code @DynamicUpdate}): a request that loads many
 * students (a reorder) would otherwise save every column from its stale copy and overwrite a pin or
 * a removal another request committed in the meantime.
 */
@Entity
@DynamicUpdate
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

	@Column(name = "route_id")
	private UUID routeId;

	@Column(name = "stop_position")
	private Integer stopPosition;

	@Builder.Default
	@Column(name = "manual_pin", nullable = false)
	private boolean manualPin = false;

	@CreationTimestamp
	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;
}
