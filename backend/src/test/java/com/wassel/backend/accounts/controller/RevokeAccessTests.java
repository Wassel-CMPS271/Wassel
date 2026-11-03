package com.wassel.backend.accounts.controller;

import com.wassel.backend.auth.config.AuthCookie;
import com.wassel.backend.auth.service.JwtService;
import com.wassel.backend.auth.service.Mailer;
import com.wassel.backend.drivers.dto.CreateDriverRequest;
import com.wassel.backend.drivers.dto.DriverResponse;
import com.wassel.backend.drivers.entity.DriverStatus;
import com.wassel.backend.drivers.repository.DriverRepository;
import com.wassel.backend.drivers.service.DriverService;
import com.wassel.backend.users.entity.Role;
import com.wassel.backend.users.entity.User;
import com.wassel.backend.users.repository.UserRepository;
import com.wassel.backend.users.service.UserService;
import com.wassel.backend.vehicles.entity.Vehicle;
import com.wassel.backend.vehicles.repository.VehicleRepository;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.util.List;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * SCRUM-98: revoking and restoring access. A head of transportation revokes a driver or a parent, an admin
 * revokes a head of transportation, nobody revokes themselves, and a revoked person can't sign in and loses an
 * open session at their next request. Each test uses its own school and emails, so tests don't see each other.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class RevokeAccessTests {

	private static final String PASSWORD = "a-long-enough-password";

	private static final String PARENTS = "/api/head-of-transport/parents";

	private static final String DRIVERS = "/api/head-of-transport/drivers";

	private static final String HEADS = "/api/admin/head-of-transport";

	private static final String NOT_FOUND_ID = "00000000-0000-4000-8000-0000000000aa";

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private UserService userService;

	@Autowired
	private UserRepository userRepository;

	@Autowired
	private DriverService driverService;

	@Autowired
	private DriverRepository driverRepository;

	@Autowired
	private VehicleRepository vehicleRepository;

	@Autowired
	private JwtService jwtService;

	@MockitoBean
	private Mailer mailer;

	private UUID school;

	private User headOfTransport;

	private User admin;

	@BeforeEach
	void newSchool() {
		school = UUID.randomUUID();
		headOfTransport = account(Role.HEAD_OF_TRANSPORT, school);
		admin = account(Role.ADMIN, school);
	}

	private User account(Role role, UUID schoolId) {
		return userService.createUser(role.name().toLowerCase() + "-" + UUID.randomUUID() + "@wassel.test", PASSWORD,
				role, schoolId);
	}

	private RequestPostProcessor as(User user) {
		return authentication(new UsernamePasswordAuthenticationToken(user, null,
				List.of(new SimpleGrantedAuthority("ROLE_" + user.getRole()))));
	}

	private ResultActions revoke(String base, User caller, Object id) throws Exception {
		return mockMvc.perform(patch(base + "/" + id + "/revoke").with(as(caller)));
	}

	private ResultActions restore(String base, User caller, Object id) throws Exception {
		return mockMvc.perform(patch(base + "/" + id + "/restore").with(as(caller)));
	}

	private boolean enabled(UUID userId) {
		return userRepository.findById(userId).orElseThrow().isEnabled();
	}

	// Sign-in is limited to one code a minute per account, so a test signs in successfully at most once.
	private ResultActions logIn(User user) throws Exception {
		return mockMvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(user.getEmail(), PASSWORD)));
	}

	/** A request that carries the user's session cookie, as a browser that is already signed in would. */
	private ResultActions callMe(User user) throws Exception {
		return mockMvc.perform(get("/api/auth/me").cookie(new Cookie(AuthCookie.NAME, jwtService.generateToken(user))));
	}

	private DriverResponse activeDriver() {
		String tag = UUID.randomUUID().toString().substring(0, 8);
		return driverService.addActiveDriver(school, new CreateDriverRequest("Ahmad", "Khalil",
				"+961 3 " + (100 + (int) (Math.random() * 899)) + " " + (100 + (int) (Math.random() * 899)),
				"driver-" + tag + "@wassel.test"), PASSWORD);
	}

	private User accountOfDriver(DriverResponse driver) {
		return userService.findByEmail(driver.email()).orElseThrow();
	}

	// ---------------------------------------------------------------- parents

	@Test
	void headOfTransportCanRevokeAndRestoreAParent() throws Exception {
		User parent = account(Role.PARENT, school);

		revoke(PARENTS, headOfTransport, parent.getId())
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.id").value(parent.getId().toString()))
				.andExpect(jsonPath("$.status").value("revoked"));
		assertFalse(enabled(parent.getId()));

		mockMvc.perform(get(PARENTS).with(as(headOfTransport)))
				.andExpect(jsonPath("$[0].status").value("revoked"));

		restore(PARENTS, headOfTransport, parent.getId())
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("active"));
		assertTrue(enabled(parent.getId()));
	}

	@Test
	void restoringAParentWhoNeverSetAPasswordShowsInvitedAgain() throws Exception {
		User parent = userService.createInvitedUser("invited-" + UUID.randomUUID() + "@wassel.test", Role.PARENT, school);

		revoke(PARENTS, headOfTransport, parent.getId()).andExpect(jsonPath("$.status").value("revoked"));
		restore(PARENTS, headOfTransport, parent.getId()).andExpect(jsonPath("$.status").value("invited"));
	}

	@Test
	void revokingOrRestoringTwiceChangesNothing() throws Exception {
		User parent = account(Role.PARENT, school);

		revoke(PARENTS, headOfTransport, parent.getId()).andExpect(status().isOk());
		revoke(PARENTS, headOfTransport, parent.getId())
				.andExpect(status().isOk()).andExpect(jsonPath("$.status").value("revoked"));
		restore(PARENTS, headOfTransport, parent.getId()).andExpect(status().isOk());
		restore(PARENTS, headOfTransport, parent.getId())
				.andExpect(status().isOk()).andExpect(jsonPath("$.status").value("active"));
	}

	@Test
	void aRevokedParentCannotSignInUntilRestored() throws Exception {
		User parent = account(Role.PARENT, school);

		revoke(PARENTS, headOfTransport, parent.getId()).andExpect(status().isOk());
		logIn(parent).andExpect(status().isUnauthorized());

		restore(PARENTS, headOfTransport, parent.getId()).andExpect(status().isOk());
		logIn(parent).andExpect(status().isNoContent());
	}

	@Test
	void aParentWhoIsAlreadySignedInIsRejectedAtTheNextRequest() throws Exception {
		User parent = account(Role.PARENT, school);
		callMe(parent).andExpect(status().isOk());

		revoke(PARENTS, headOfTransport, parent.getId()).andExpect(status().isOk());
		callMe(parent).andExpect(status().isUnauthorized());

		restore(PARENTS, headOfTransport, parent.getId()).andExpect(status().isOk());
		callMe(parent).andExpect(status().isOk());
	}

	@Test
	void aRevokedParentCannotUseTheirInviteLink() throws Exception {
		ArgumentCaptor<String> mail = ArgumentCaptor.forClass(String.class);
		String email = "invite-" + UUID.randomUUID() + "@wassel.test";
		String id = mockMvc.perform(post(PARENTS).with(as(headOfTransport)).contentType(MediaType.APPLICATION_JSON)
						.content("{\"email\":\"%s\"}".formatted(email)))
				.andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()
				.replaceAll(".*\"id\":\"([^\"]+)\".*", "$1");
		verify(mailer).send(eq(email), anyString(), mail.capture());
		Matcher token = Pattern.compile("token=([\\w-]+)").matcher(mail.getValue());
		assertTrue(token.find());

		revoke(PARENTS, headOfTransport, id).andExpect(status().isOk());

		mockMvc.perform(post("/api/auth/password").contentType(MediaType.APPLICATION_JSON)
						.content("{\"token\":\"%s\",\"password\":\"%s\"}".formatted(token.group(1), PASSWORD)))
				.andExpect(status().isBadRequest());
	}

	@Test
	void aHeadOfTransportCannotRevokeAnAdminOrAnyoneWhoIsNotAParentOrDriver() throws Exception {
		User otherHead = account(Role.HEAD_OF_TRANSPORT, school);
		DriverResponse driver = activeDriver();

		for (User target : new User[] { admin, otherHead, accountOfDriver(driver) }) {
			revoke(PARENTS, headOfTransport, target.getId()).andExpect(status().isNotFound());
			revoke(DRIVERS, headOfTransport, target.getId()).andExpect(status().isNotFound());
			assertTrue(enabled(target.getId()));
		}
	}

	@Test
	void aHeadOfTransportCannotRevokeThemselves() throws Exception {
		revoke(PARENTS, headOfTransport, headOfTransport.getId())
				.andExpect(status().isForbidden())
				.andExpect(jsonPath("$.detail").value("You cannot revoke your own access."));
		assertTrue(enabled(headOfTransport.getId()));
	}

	@Test
	void aHeadOfTransportCannotReachAnotherSchoolsParent() throws Exception {
		User foreign = account(Role.PARENT, UUID.randomUUID());

		revoke(PARENTS, headOfTransport, foreign.getId()).andExpect(status().isNotFound());
		restore(PARENTS, headOfTransport, foreign.getId()).andExpect(status().isNotFound());
		assertTrue(enabled(foreign.getId()));
	}

	@Test
	void anUnknownParentIsNotFound() throws Exception {
		revoke(PARENTS, headOfTransport, NOT_FOUND_ID).andExpect(status().isNotFound());
		restore(PARENTS, headOfTransport, NOT_FOUND_ID).andExpect(status().isNotFound());
	}

	// ---------------------------------------------------- head of transportation

	@Test
	void anAdminCanRevokeAndRestoreAHeadOfTransport() throws Exception {
		User head = account(Role.HEAD_OF_TRANSPORT, school);

		revoke(HEADS, admin, head.getId())
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("revoked"));
		assertFalse(enabled(head.getId()));
		logIn(head).andExpect(status().isUnauthorized());

		restore(HEADS, admin, head.getId())
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("active"));
		logIn(head).andExpect(status().isNoContent());
	}

	@Test
	void aRevokedHeadOfTransportLosesTheirOpenSession() throws Exception {
		User head = account(Role.HEAD_OF_TRANSPORT, school);
		mockMvc.perform(get(PARENTS).cookie(new Cookie(AuthCookie.NAME, jwtService.generateToken(head))))
				.andExpect(status().isOk());

		revoke(HEADS, admin, head.getId()).andExpect(status().isOk());

		mockMvc.perform(get(PARENTS).cookie(new Cookie(AuthCookie.NAME, jwtService.generateToken(head))))
				.andExpect(status().isUnauthorized());
	}

	@Test
	void anAdminCannotRevokeThemselvesOrAnotherAdminOrAParent() throws Exception {
		User otherAdmin = account(Role.ADMIN, school);
		User parent = account(Role.PARENT, school);

		revoke(HEADS, admin, admin.getId())
				.andExpect(status().isForbidden())
				.andExpect(jsonPath("$.detail").value("You cannot revoke your own access."));
		revoke(HEADS, admin, otherAdmin.getId()).andExpect(status().isNotFound());
		revoke(HEADS, admin, parent.getId()).andExpect(status().isNotFound());
		assertTrue(enabled(admin.getId()));
		assertTrue(enabled(otherAdmin.getId()));
		assertTrue(enabled(parent.getId()));
	}

	@Test
	void anAdminCannotReachAnotherSchoolsHeadOfTransport() throws Exception {
		User foreign = account(Role.HEAD_OF_TRANSPORT, UUID.randomUUID());

		revoke(HEADS, admin, foreign.getId()).andExpect(status().isNotFound());
		assertTrue(enabled(foreign.getId()));
	}

	// ---------------------------------------------------------------- drivers

	@Test
	void headOfTransportCanRevokeAndRestoreADriver() throws Exception {
		DriverResponse driver = activeDriver();
		User account = accountOfDriver(driver);

		revoke(DRIVERS, headOfTransport, driver.id())
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.id").value(driver.id().toString()))
				.andExpect(jsonPath("$.status").value("deactivated"));
		assertFalse(enabled(account.getId()));
		assertEquals(DriverStatus.DEACTIVATED, driverRepository.findById(driver.id()).orElseThrow().getStatus());

		restore(DRIVERS, headOfTransport, driver.id())
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("active"));
		assertTrue(enabled(account.getId()));
	}

	@Test
	void aRevokedDriverCannotSignInAndLosesAnOpenSession() throws Exception {
		DriverResponse driver = activeDriver();
		User account = accountOfDriver(driver);
		callMe(account).andExpect(status().isOk());

		revoke(DRIVERS, headOfTransport, driver.id()).andExpect(status().isOk());
		logIn(account).andExpect(status().isUnauthorized());
		callMe(account).andExpect(status().isUnauthorized());

		restore(DRIVERS, headOfTransport, driver.id()).andExpect(status().isOk());
		logIn(account).andExpect(status().isNoContent());
		callMe(account).andExpect(status().isOk());
	}

	@Test
	void revokingADriverFreesTheirVehicleAndRestoringDoesNotTakeItBack() throws Exception {
		DriverResponse driver = activeDriver();
		UUID vehicle = vehicleRepository.saveAndFlush(Vehicle.builder().schoolId(school)
				.plateNumber("B " + UUID.randomUUID().toString().substring(0, 6)).capacity(14).build()).getId();
		mockMvc.perform(patch(DRIVERS + "/" + driver.id() + "/vehicle").with(as(headOfTransport))
						.contentType(MediaType.APPLICATION_JSON).content("{\"vehicleId\":\"%s\"}".formatted(vehicle)))
				.andExpect(status().isOk()).andExpect(jsonPath("$.assignedVehicleId").value(vehicle.toString()));

		revoke(DRIVERS, headOfTransport, driver.id())
				.andExpect(jsonPath("$.assignedVehicleId").doesNotExist());
		assertNull(driverRepository.findById(driver.id()).orElseThrow().getAssignedVehicleId());

		restore(DRIVERS, headOfTransport, driver.id())
				.andExpect(jsonPath("$.assignedVehicleId").doesNotExist());
	}

	@Test
	void aRevokedDriverCannotBeGivenAVehicle() throws Exception {
		DriverResponse driver = activeDriver();
		UUID vehicle = vehicleRepository.saveAndFlush(Vehicle.builder().schoolId(school)
				.plateNumber("C " + UUID.randomUUID().toString().substring(0, 6)).capacity(14).build()).getId();
		revoke(DRIVERS, headOfTransport, driver.id()).andExpect(status().isOk());

		mockMvc.perform(patch(DRIVERS + "/" + driver.id() + "/vehicle").with(as(headOfTransport))
						.contentType(MediaType.APPLICATION_JSON).content("{\"vehicleId\":\"%s\"}".formatted(vehicle)))
				.andExpect(status().isConflict());
	}

	@Test
	void restoringADriverWhoNeverSetAPasswordShowsInvitedAgain() throws Exception {
		DriverResponse invited = driverService.addDriver(school, new CreateDriverRequest("Sami", "Haddad",
				"+961 70 234 567", "invited-driver-" + UUID.randomUUID() + "@wassel.test"));
		assertEquals("invited", invited.status());

		revoke(DRIVERS, headOfTransport, invited.id()).andExpect(jsonPath("$.status").value("deactivated"));
		restore(DRIVERS, headOfTransport, invited.id()).andExpect(jsonPath("$.status").value("invited"));
	}

	@Test
	void aHeadOfTransportCannotReachAnotherSchoolsDriver() throws Exception {
		DriverResponse driver = activeDriver();
		User otherHead = account(Role.HEAD_OF_TRANSPORT, UUID.randomUUID());

		revoke(DRIVERS, otherHead, driver.id()).andExpect(status().isNotFound());
		restore(DRIVERS, otherHead, driver.id()).andExpect(status().isNotFound());
		assertTrue(enabled(accountOfDriver(driver).getId()));
	}

	@Test
	void anUnknownDriverIsNotFound() throws Exception {
		revoke(DRIVERS, headOfTransport, NOT_FOUND_ID).andExpect(status().isNotFound());
		restore(DRIVERS, headOfTransport, NOT_FOUND_ID).andExpect(status().isNotFound());
	}

	@Test
	void parentsAndDriversCannotRevokeAnyone() throws Exception {
		User parent = account(Role.PARENT, school);
		User target = account(Role.PARENT, school);
		DriverResponse driver = activeDriver();

		for (User caller : new User[] { parent, accountOfDriver(driver) }) {
			revoke(PARENTS, caller, target.getId()).andExpect(status().isForbidden());
			revoke(DRIVERS, caller, driver.id()).andExpect(status().isForbidden());
			revoke(HEADS, caller, headOfTransport.getId()).andExpect(status().isForbidden());
		}
		assertTrue(enabled(target.getId()));
		assertTrue(enabled(headOfTransport.getId()));
	}
}
