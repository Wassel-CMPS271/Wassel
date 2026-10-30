package com.wassel.backend.security;

import com.wassel.backend.users.entity.Role;
import com.wassel.backend.users.entity.User;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

import java.util.ArrayList;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;

/**
 * SCRUM-254: every endpoint against every role, in one table.
 *
 * <p>Each row says who may call an endpoint. For all five callers (admin, head of transportation,
 * driver, parent and signed out) the test checks the answer: an allowed caller must get past the
 * security check (anything but 401 or 403); a signed-in caller who is not allowed gets 403; a
 * signed-out caller gets 401 on anything that is not public. The test also reads every real endpoint
 * from Spring and fails when one is missing from the table, so nobody can add an endpoint and forget
 * its access rule. <b>A new endpoint goes into this table in the same pull request</b> (see
 * backend/CLAUDE.md).
 *
 * <p>A mismatch found here is raised on the owner's pull request or as a bug ticket, not fixed in
 * this test. The table states what the access rule <i>should</i> be.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class RoleAccessMatrixTests {

	/** The five callers. SIGNED_OUT sends no credentials at all. */
	private enum Caller {
		ADMIN(Role.ADMIN), HEAD_OF_TRANSPORT(Role.HEAD_OF_TRANSPORT), DRIVER(Role.DRIVER), PARENT(Role.PARENT),
		SIGNED_OUT(null);

		final Role role;

		Caller(Role role) {
			this.role = role;
		}
	}

	/** Who may call an endpoint. */
	private enum Access {
		/** No sign-in needed (the sign-in endpoints themselves). */
		PUBLIC(EnumSet.allOf(Caller.class)),
		/** Any signed-in user, whatever the role. */
		ANY_SIGNED_IN(EnumSet.of(Caller.ADMIN, Caller.HEAD_OF_TRANSPORT, Caller.DRIVER, Caller.PARENT)),
		ADMIN_ONLY(EnumSet.of(Caller.ADMIN)),
		HEAD_OF_TRANSPORT_ONLY(EnumSet.of(Caller.HEAD_OF_TRANSPORT)),
		DRIVER_ONLY(EnumSet.of(Caller.DRIVER)),
		PARENT_ONLY(EnumSet.of(Caller.PARENT));

		final Set<Caller> allowed;

		Access(Set<Caller> allowed) {
			this.allowed = allowed;
		}
	}

	/**
	 * The role-access table: "METHOD path" exactly as the controller declares it (path variables in
	 * braces), and who may call it. Keep it grouped by area, in the order of the controllers.
	 */
	private static final Map<String, Access> TABLE = new LinkedHashMap<>();

	static {
		// auth: signing in and out is public; /me needs a session
		for (String path : List.of("/login", "/2fa/verify", "/2fa/resend", "/logout", "/forgot-password", "/password")) {
			TABLE.put("POST /api/auth" + path, Access.PUBLIC);
		}
		TABLE.put("GET /api/auth/me", Access.ANY_SIGNED_IN);

		// admin
		TABLE.put("POST /api/admin/head-of-transport", Access.ADMIN_ONLY);
		TABLE.put("GET /api/admin/school-calendar/half-days", Access.ADMIN_ONLY);
		TABLE.put("POST /api/admin/school-calendar/half-days", Access.ADMIN_ONLY);
		TABLE.put("GET /api/admin/school-calendar/holidays", Access.ADMIN_ONLY);
		TABLE.put("POST /api/admin/school-calendar/holidays", Access.ADMIN_ONLY);
		TABLE.put("DELETE /api/admin/school-calendar/holidays/{id}", Access.ADMIN_ONLY);
		TABLE.put("GET /api/admin/school-settings/times", Access.ADMIN_ONLY);
		TABLE.put("PUT /api/admin/school-settings/times", Access.ADMIN_ONLY);

		// head of transportation
		TABLE.put("GET /api/head-of-transport/parents", Access.HEAD_OF_TRANSPORT_ONLY);
		TABLE.put("POST /api/head-of-transport/parents", Access.HEAD_OF_TRANSPORT_ONLY);

		TABLE.put("GET /api/head-of-transport/drivers", Access.HEAD_OF_TRANSPORT_ONLY);
		TABLE.put("POST /api/head-of-transport/drivers", Access.HEAD_OF_TRANSPORT_ONLY);
		TABLE.put("PATCH /api/head-of-transport/drivers/{id}/resend-invite", Access.HEAD_OF_TRANSPORT_ONLY);
		TABLE.put("PATCH /api/head-of-transport/drivers/{id}/vehicle", Access.HEAD_OF_TRANSPORT_ONLY);
		TABLE.put("DELETE /api/head-of-transport/drivers/{id}/vehicle", Access.HEAD_OF_TRANSPORT_ONLY);

		TABLE.put("GET /api/head-of-transport/vehicles", Access.HEAD_OF_TRANSPORT_ONLY);
		TABLE.put("POST /api/head-of-transport/vehicles", Access.HEAD_OF_TRANSPORT_ONLY);
		TABLE.put("PATCH /api/head-of-transport/vehicles/{id}/capacity", Access.HEAD_OF_TRANSPORT_ONLY);
		TABLE.put("PATCH /api/head-of-transport/vehicles/{id}/deactivate", Access.HEAD_OF_TRANSPORT_ONLY);
		TABLE.put("PATCH /api/head-of-transport/vehicles/{id}/reactivate", Access.HEAD_OF_TRANSPORT_ONLY);

		TABLE.put("GET /api/head-of-transport/students", Access.HEAD_OF_TRANSPORT_ONLY);
		TABLE.put("POST /api/head-of-transport/students", Access.HEAD_OF_TRANSPORT_ONLY);
		TABLE.put("PATCH /api/head-of-transport/students/{id}/address", Access.HEAD_OF_TRANSPORT_ONLY);
		TABLE.put("PATCH /api/head-of-transport/students/{id}/location", Access.HEAD_OF_TRANSPORT_ONLY);
		TABLE.put("PATCH /api/head-of-transport/students/{id}/parent", Access.HEAD_OF_TRANSPORT_ONLY);

		TABLE.put("GET /api/head-of-transport/routes", Access.HEAD_OF_TRANSPORT_ONLY);
		TABLE.put("GET /api/head-of-transport/routes/{id}", Access.HEAD_OF_TRANSPORT_ONLY);
		TABLE.put("POST /api/head-of-transport/routes", Access.HEAD_OF_TRANSPORT_ONLY);
		TABLE.put("PUT /api/head-of-transport/routes/{id}", Access.HEAD_OF_TRANSPORT_ONLY);
		TABLE.put("DELETE /api/head-of-transport/routes/{id}", Access.HEAD_OF_TRANSPORT_ONLY);
		TABLE.put("POST /api/head-of-transport/routes/{id}/students", Access.HEAD_OF_TRANSPORT_ONLY);
		TABLE.put("DELETE /api/head-of-transport/routes/{id}/students/{studentId}", Access.HEAD_OF_TRANSPORT_ONLY);
		TABLE.put("PUT /api/head-of-transport/routes/{id}/stops", Access.HEAD_OF_TRANSPORT_ONLY);
		TABLE.put("POST /api/head-of-transport/routes/{id}/optimization", Access.HEAD_OF_TRANSPORT_ONLY);
		TABLE.put("POST /api/head-of-transport/routes/{id}/optimization/{proposalId}/apply", Access.HEAD_OF_TRANSPORT_ONLY);
		TABLE.put("DELETE /api/head-of-transport/routes/{id}/optimization/{proposalId}", Access.HEAD_OF_TRANSPORT_ONLY);
		TABLE.put("POST /api/head-of-transport/routes/generation", Access.HEAD_OF_TRANSPORT_ONLY);
		TABLE.put("POST /api/head-of-transport/routes/generation/{proposalId}/apply", Access.HEAD_OF_TRANSPORT_ONLY);
		TABLE.put("DELETE /api/head-of-transport/routes/generation/{proposalId}", Access.HEAD_OF_TRANSPORT_ONLY);

		TABLE.put("GET /api/head-of-transport/absences", Access.HEAD_OF_TRANSPORT_ONLY);

		// parent (SCRUM-238)
		TABLE.put("GET /api/parent/children/{studentId}/absences", Access.PARENT_ONLY);
		TABLE.put("POST /api/parent/children/{studentId}/absences", Access.PARENT_ONLY);
		TABLE.put("DELETE /api/parent/children/{studentId}/absences/{absenceId}", Access.PARENT_ONLY);
	}

	// Path variables are all ids, so one UUID fits every {name}; the service then answers 404 or 400.
	private static final String SOME_ID = "00000000-0000-4000-8000-0000000000aa";

	/**
	 * A valid JSON body for each endpoint that has a validated one. Spring checks the body before the
	 * role check, so a caller who is not allowed gets 400 instead of 403 when the body is invalid. These
	 * bodies are only sent to callers who are <b>not</b> allowed (the request never reaches the service,
	 * so nothing is created); an allowed caller gets "{}", which is stopped by validation, also before
	 * any data is written.
	 */
	private static final Map<String, String> VALID_BODIES = new LinkedHashMap<>();

	static {
		VALID_BODIES.put("POST /api/admin/head-of-transport", "{\"email\":\"someone@wassel.test\"}");
		VALID_BODIES.put("POST /api/admin/school-calendar/half-days", "{\"date\":\"2030-01-02\"}");
		VALID_BODIES.put("POST /api/admin/school-calendar/holidays", "{\"date\":\"2030-01-03\",\"name\":\"Test day\"}");
		VALID_BODIES.put("PUT /api/admin/school-settings/times", "{\"arrivalTime\":\"07:30\",\"dismissalTime\":\"14:00\"}");
		VALID_BODIES.put("POST /api/head-of-transport/parents", "{\"email\":\"someone@wassel.test\"}");
		VALID_BODIES.put("POST /api/head-of-transport/drivers", "{\"firstName\":\"Test\",\"lastName\":\"Driver\","
				+ "\"phone\":\"+961 3 123 456\",\"email\":\"driver@wassel.test\"}");
		VALID_BODIES.put("PATCH /api/head-of-transport/drivers/{id}/vehicle", "{\"vehicleId\":\"" + SOME_ID + "\"}");
		VALID_BODIES.put("POST /api/head-of-transport/vehicles", "{\"plateNumber\":\"A 123\",\"capacity\":10}");
		VALID_BODIES.put("PATCH /api/head-of-transport/vehicles/{id}/capacity", "{\"capacity\":10}");
		VALID_BODIES.put("POST /api/head-of-transport/students", "{\"firstName\":\"Test\",\"lastName\":\"Student\","
				+ "\"grade\":\"Grade 3\",\"guardianName\":\"Guardian\",\"guardianPhone\":\"+961 3 123 456\"}");
		VALID_BODIES.put("PATCH /api/head-of-transport/students/{id}/address", "{\"address\":\"Hamra Street, Beirut\"}");
		VALID_BODIES.put("PATCH /api/head-of-transport/students/{id}/location", "{\"latitude\":33.9,\"longitude\":35.5}");
		VALID_BODIES.put("PATCH /api/head-of-transport/students/{id}/parent", "{\"parentUserId\":\"" + SOME_ID + "\"}");
		String route = "{\"name\":\"Test route\",\"vehicleId\":\"" + SOME_ID + "\",\"driverId\":\"" + SOME_ID + "\"}";
		VALID_BODIES.put("POST /api/head-of-transport/routes", route);
		VALID_BODIES.put("PUT /api/head-of-transport/routes/{id}", route);
		VALID_BODIES.put("POST /api/head-of-transport/routes/{id}/students", "{\"studentId\":\"" + SOME_ID + "\"}");
		VALID_BODIES.put("PUT /api/head-of-transport/routes/{id}/stops", "{\"studentIds\":[]}");
		VALID_BODIES.put("POST /api/parent/children/{studentId}/absences", "{\"fromDate\":\"2030-01-04\"}");
	}

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	@Qualifier("requestMappingHandlerMapping")
	private RequestMappingHandlerMapping handlerMapping;

	private final UUID schoolId = UUID.randomUUID();

	/** Every "METHOD path" the application really serves, from Spring's own handler mapping. */
	private Set<String> realEndpoints() {
		Set<String> endpoints = new TreeSet<>();
		handlerMapping.getHandlerMethods().forEach((info, handler) -> {
			if (!handler.getBeanType().getPackageName().startsWith("com.wassel.backend")) {
				return;
			}
			endpoints.addAll(keysOf(info));
		});
		return endpoints;
	}

	private static List<String> keysOf(RequestMappingInfo info) {
		Set<RequestMethod> methods = info.getMethodsCondition().getMethods();
		assertTrue(!methods.isEmpty(), "an endpoint must declare its HTTP method, but " + info + " does not");
		List<String> keys = new ArrayList<>();
		for (String pattern : info.getPathPatternsCondition().getPatternValues()) {
			for (RequestMethod method : methods) {
				keys.add(method + " " + pattern);
			}
		}
		return keys;
	}

	@Test
	void everyEndpointOfTheApplicationIsInTheTable() {
		Set<String> missing = new TreeSet<>(realEndpoints());
		missing.removeAll(TABLE.keySet());

		assertTrue(missing.isEmpty(), "These endpoints have no row in RoleAccessMatrixTests.TABLE. Add each one with the "
				+ "role(s) that may call it, in the same pull request that adds the endpoint:\n  "
				+ String.join("\n  ", missing));
	}

	@Test
	void everyRowOfTheTableIsAnEndpointThatExists() {
		Set<String> stale = new TreeSet<>(TABLE.keySet());
		stale.removeAll(realEndpoints());

		assertTrue(stale.isEmpty(), "These rows of RoleAccessMatrixTests.TABLE match no endpoint any more (renamed or "
				+ "removed?). Remove or fix them:\n  " + String.join("\n  ", stale));
	}

	@TestFactory
	Stream<DynamicTest> everyCallerGetsTheExpectedAnswerFromEveryEndpoint() {
		List<DynamicTest> tests = new ArrayList<>();
		TABLE.forEach((endpoint, access) -> {
			for (Caller caller : Caller.values()) {
				tests.add(DynamicTest.dynamicTest(endpoint + " as " + caller, () -> check(endpoint, access, caller)));
			}
		});
		return tests.stream();
	}

	private void check(String endpoint, Access access, Caller caller) throws Exception {
		boolean allowed = access.allowed.contains(caller);
		MockHttpServletResponse response = call(endpoint, caller, allowed);
		int status = response.getStatus();
		String what = "%s as %s answered %d".formatted(endpoint, caller, status);
		if (allowed) {
			assertNotEquals(403, status, what + ", but this caller is allowed (expected anything but 401 and 403)");
			// Security's own 401 has an empty body. A public endpoint may still answer 401 with a body of its
			// own (resend, when there is no pending sign-in), which only shows the request reached the controller.
			boolean securityBlocked = status == 401
					&& (access != Access.PUBLIC || response.getContentAsString().isEmpty());
			assertTrue(!securityBlocked, what + ", but this caller is allowed (expected anything but 401 and 403)");
		}
		else if (caller == Caller.SIGNED_OUT) {
			assertEquals(401, status, what + ", expected 401 for a signed-out caller");
		}
		else {
			assertEquals(403, status, what + ", expected 403 for a signed-in caller without the role");
		}
	}

	/**
	 * Calls the endpoint as the caller, with a made-up id in every path variable. A caller who is allowed
	 * sends "{}" (so no data is written); one who is not sends a valid body, so the role check, not
	 * validation, is what answers.
	 */
	private MockHttpServletResponse call(String endpoint, Caller caller, boolean allowed) throws Exception {
		String[] parts = endpoint.split(" ", 2);
		String path = parts[1].replaceAll("\\{[^}]+}", SOME_ID);
		String body = allowed ? "{}" : VALID_BODIES.getOrDefault(endpoint, "{}");
		MockHttpServletRequestBuilder request = request(org.springframework.http.HttpMethod.valueOf(parts[0]), path)
				.contentType(MediaType.APPLICATION_JSON)
				.content(body);
		if (caller.role != null) {
			request = request.with(signedInAs(caller.role));
		}
		return mockMvc.perform(request).andReturn().getResponse();
	}

	private RequestPostProcessor signedInAs(Role role) {
		User user = User.builder().id(UUID.randomUUID()).email(role + "@wassel.test").passwordHash("x").role(role)
				.schoolId(schoolId).build();
		return authentication(new UsernamePasswordAuthenticationToken(user, null,
				List.of(new SimpleGrantedAuthority("ROLE_" + role))));
	}
}
