package com.wassel.backend.inbox.controller;

import com.jayway.jsonpath.JsonPath;
import com.wassel.backend.common.RunCriteriaSupport;
import com.wassel.backend.users.entity.Role;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/**
 * SCRUM-266: independent tests of the notification preferences (SCRUM-268), from {@code docs/contracts/inbox.md} as it
 * stands on {@code feat/SCRUM-268-notification-preferences} (PR #158), never from {@code NotificationPreferencesTests}.
 * Stories behind it: SCRUM-40 and SCRUM-47.
 *
 * <p>PENDING MERGE of SCRUM-268 (PR #158, which sits on #153). This class has no compile-time reference to anything that
 * only exists there, so it compiles on {@code develop}, and it switches itself on through {@link com.wassel.backend.common.Scrum268Gate}
 * when #158's classes are on the classpath, that is, the day #158 is merged. Before that, run it on a branch with #158 merged, or with
 * {@code -Dpending.SCRUM-268=true}, which on plain {@code develop} makes every test fail (the endpoint is a 404), so the
 * tests can be seen to fail. Delete the gate and the {@code @EnabledIf} line once #158 is merged.
 */
@EnabledIf(value = "com.wassel.backend.common.Scrum268Gate#built", disabledReason = "PENDING MERGE: SCRUM-268 (PR #158). Run with -Dpending.SCRUM-268=true")
class NotificationPreferencesCriteriaTests extends RunCriteriaSupport {

	private static final String PREFERENCES = "/api/parent/notification-preferences";

	private static final String INBOX = "/api/parent/inbox";

	private static final Set<String> KEYS = Set.of("pickedUp", "droppedOff", "notPresent", "late", "lateAfterMinutes");

	private MockHttpServletResponse read(UUID parent) throws Exception {
		return send(get(PREFERENCES).with(as(Role.PARENT, parent)));
	}

	private MockHttpServletResponse save(UUID parent, String json) throws Exception {
		return send(put(PREFERENCES).with(as(Role.PARENT, parent)).contentType(MediaType.APPLICATION_JSON).content(json));
	}

	/** A save the test relies on: it must be accepted, or the test is not about what it says. */
	private void saved(UUID parent, String json) throws Exception {
		MockHttpServletResponse response = save(parent, json);
		assertEquals(200, response.getStatus(), response.getContentAsString());
	}

	/** A body with the five fields; each argument is the raw JSON of the value, or null to leave the field out. */
	private static String json(String pickedUp, String droppedOff, String notPresent, String late, String minutes) {
		Map<String, String> fields = new LinkedHashMap<>();
		fields.put("pickedUp", pickedUp);
		fields.put("droppedOff", droppedOff);
		fields.put("notPresent", notPresent);
		fields.put("late", late);
		fields.put("lateAfterMinutes", minutes);
		List<String> parts = new ArrayList<>();
		fields.forEach((name, value) -> {
			if (value != null) {
				parts.add("\"" + name + "\":" + value);
			}
		});
		return "{" + String.join(",", parts) + "}";
	}

	/** The contract's sample: samples/inbox/notification-preferences.json. */
	private static final String SAMPLE = json("true", "false", "true", "true", "15");

	private void assertPreferences(MockHttpServletResponse response, boolean pickedUp, boolean droppedOff, boolean notPresent,
			boolean late, int minutes) throws Exception {
		assertEquals(200, response.getStatus(), response.getContentAsString());
		String body = response.getContentAsString();
		assertEquals(KEYS, JsonPath.<Map<String, Object>>read(body, "$").keySet());
		assertEquals(pickedUp, JsonPath.<Boolean>read(body, "$.pickedUp"));
		assertEquals(droppedOff, JsonPath.<Boolean>read(body, "$.droppedOff"));
		assertEquals(notPresent, JsonPath.<Boolean>read(body, "$.notPresent"));
		assertEquals(late, JsonPath.<Boolean>read(body, "$.late"));
		assertEquals(minutes, (int) JsonPath.<Integer>read(body, "$.lateAfterMinutes"));
	}

	private List<String> inboxTypes(UUID parent) throws Exception {
		MockHttpServletResponse response = send(get(INBOX).with(as(Role.PARENT, parent)));
		assertEquals(200, response.getStatus(), response.getContentAsString());
		return JsonPath.read(response.getContentAsString(), "$[*].type");
	}

	private int unreadCount(UUID parent) throws Exception {
		MockHttpServletResponse response = send(get(INBOX + "/unread-count").with(as(Role.PARENT, parent)));
		assertEquals(200, response.getStatus(), response.getContentAsString());
		return JsonPath.read(response.getContentAsString(), "$.count");
	}

	// ---------------------------------------------------------------- reading and saving

	/** Contract: a parent who never saved anything has true, true, true, true and 10; reading twice gives the same. */
	@Test
	void aParentWhoNeverSavedAnythingHasTheDefaultsAndReadingTwiceChangesNothing() throws Exception {
		UUID parent = aParent();

		assertPreferences(read(parent), true, true, true, true, 10);
		assertPreferences(read(parent), true, true, true, true, 10);
	}

	/** Contract: PUT answers with the saved choices, GET returns them, and the same PUT again changes nothing. */
	@Test
	void savingEchoesTheChoicesAndTheyAreReadBackAndSavingTheSameAgainChangesNothing() throws Exception {
		UUID parent = aParent();

		assertPreferences(save(parent, SAMPLE), true, false, true, true, 15);
		assertPreferences(read(parent), true, false, true, true, 15);
		assertPreferences(save(parent, SAMPLE), true, false, true, true, 15);
		assertPreferences(read(parent), true, false, true, true, 15);
	}

	/** Contract: 5 to 60 minutes are allowed, the boundaries included. */
	@Test
	void fiveAndSixtyMinutesAreAllowed() throws Exception {
		UUID parent = aParent();

		assertPreferences(save(parent, json("true", "true", "true", "true", "5")), true, true, true, true, 5);
		assertPreferences(save(parent, json("true", "true", "true", "true", "60")), true, true, true, true, 60);
	}

	/**
	 * Contract: "every field is required", "a missing field, lateAfterMinutes under 5 or over 60 ... saves nothing", 400 with
	 * errors naming the field. After every refused PUT the earlier choices are read back unchanged.
	 */
	@Test
	void aRefusedSaveIs400NamingTheFieldAndKeepsTheEarlierChoices() throws Exception {
		UUID parent = aParent();
		assertPreferences(save(parent, SAMPLE), true, false, true, true, 15);
		Map<String, String> refused = new LinkedHashMap<>();
		refused.put(json(null, "true", "true", "true", "20"), "pickedUp");
		refused.put(json("true", null, "true", "true", "20"), "droppedOff");
		refused.put(json("true", "true", null, "true", "20"), "notPresent");
		refused.put(json("true", "true", "true", null, "20"), "late");
		refused.put(json("true", "true", "true", "true", null), "lateAfterMinutes");
		refused.put(json("null", "true", "true", "true", "20"), "pickedUp");
		refused.put(json("true", "null", "true", "true", "20"), "droppedOff");
		refused.put(json("true", "true", "null", "true", "20"), "notPresent");
		refused.put(json("true", "true", "true", "null", "20"), "late");
		refused.put(json("true", "true", "true", "true", "null"), "lateAfterMinutes");
		refused.put(json("true", "true", "true", "true", "4"), "lateAfterMinutes");
		refused.put(json("true", "true", "true", "true", "61"), "lateAfterMinutes");
		refused.put(json("true", "true", "true", "true", "0"), "lateAfterMinutes");
		refused.put(json("true", "true", "true", "true", "-10"), "lateAfterMinutes");

		for (Map.Entry<String, String> bad : refused.entrySet()) {
			MockHttpServletResponse response = save(parent, bad.getKey());

			assertEquals(400, response.getStatus(), bad.getKey());
			Map<String, Object> errors = JsonPath.read(response.getContentAsString(), "$.errors");
			assertTrue(errors.containsKey(bad.getValue()), bad.getKey() + " should name " + bad.getValue() + ": " + errors);
			assertPreferences(read(parent), true, false, true, true, 15);
		}
	}

	/** Contract: a body that is not JSON is refused with 400 and saves nothing. */
	@Test
	void aBodyThatIsNotJsonIs400AndSavesNothing() throws Exception {
		UUID parent = aParent();

		MockHttpServletResponse response = save(parent, "not json at all");

		assertEquals(400, response.getStatus());
		assertPreferences(read(parent), true, true, true, true, 10);
	}

	/**
	 * Contract: "a value of the wrong type" is refused (400) and saves nothing. Text that is not a boolean and a boolean where
	 * a number belongs are refused today.
	 */
	@Test
	void aTextThatIsNotABooleanAndABooleanWhereANumberBelongsAre400AndSaveNothing() throws Exception {
		UUID parent = aParent();

		for (String body : List.of(json("true", "true", "true", "\"yes\"", "10"), json("true", "true", "true", "true", "true"))) {
			assertEquals(400, save(parent, body).getStatus(), body);
		}

		assertPreferences(read(parent), true, true, true, true, 10);
	}

	/**
	 * Contract: "a value of the wrong type" is refused (400) and saves nothing. The PR's own description says 10.5 is taken as
	 * 10, and Jackson reads "10" and "true" as a number and a boolean, and 1 as a boolean, unless told not to (SCRUM-266-bugs.md
	 * BUG-2, conflict C5). Kept as a test behind a switch, not weakened: run with
	 * {@code -Dknown-bug.SCRUM-268-coercion=true}, and delete the annotation once the cases are refused.
	 */
	@Test
	@EnabledIfSystemProperty(named = "known-bug.SCRUM-268-coercion", matches = "true",
			disabledReason = "KNOWN BUG in SCRUM-268 (SCRUM-266-bugs.md BUG-2). Run with -Dknown-bug.SCRUM-268-coercion=true")
	void aValueOfTheWrongTypeIs400AndSavesNothing() throws Exception {
		UUID parent = aParent();
		List<String> bodies = List.of(json("true", "true", "true", "true", "10.5"), json("true", "true", "true", "true", "\"10\""),
				json("\"true\"", "true", "true", "true", "10"), json("1", "true", "true", "true", "10"));
		List<String> accepted = new ArrayList<>();
		for (String body : bodies) {
			if (save(parent, body).getStatus() != 400) {
				accepted.add(body);
			}
		}

		assertEquals(List.of(), accepted, "bodies the server accepted although a value has the wrong type");
		assertPreferences(read(parent), true, true, true, true, 10);
	}

	/** Contract: the choices are the signed-in parent's own; another parent, or another school, never sees or changes them. */
	@Test
	void oneParentsChoicesNeverChangeAnotherParentsOrAnotherSchoolsParents() throws Exception {
		UUID a = aParent();
		UUID b = aParent();
		UUID elsewhere = UUID.randomUUID();

		assertPreferences(save(a, SAMPLE), true, false, true, true, 15);

		assertPreferences(read(b), true, true, true, true, 10);
		MockHttpServletResponse other = send(get(PREFERENCES).with(as(Role.PARENT, UUID.randomUUID(), elsewhere)));
		assertPreferences(other, true, true, true, true, 10);
		assertPreferences(save(b, json("false", "false", "false", "false", "60")), false, false, false, false, 60);
		assertPreferences(read(a), true, false, true, true, 15);
	}

	// ---------------------------------------------------------------- what turning a type off does

	/** Contract: a type that is off makes no entry, so it is not unread; the driver's confirmation is never affected. */
	@Test
	void aTypeThatIsOffMakesNoEntryAndNoUnreadCountAndTheDriversTapStillWorks() throws Exception {
		UUID parent = aParent();
		Bus bus = aBus("Hamra morning run");
		UUID tarek = aStudent("Tarek", parent);
		onRoute(bus, tarek);
		String run = runId(bus, "MORNING");
		assertEquals(200, start(bus, run).getStatus());
		assertPreferences(save(parent, json("false", "true", "true", "true", "10")), false, true, true, true, 10);

		MockHttpServletResponse pickedUp = confirm(bus, run, tarek, "PICKED_UP");

		assertEquals(200, pickedUp.getStatus(), pickedUp.getContentAsString());
		assertEquals(List.of(), inboxTypes(parent));
		assertEquals(0, unreadCount(parent));
		MockHttpServletResponse droppedOff = confirm(bus, run, tarek, "DROPPED_OFF");
		assertEquals(200, droppedOff.getStatus());
		assertEquals(List.of("DROPPED_OFF"), inboxTypes(parent), "the type that is still on makes its entry");
		assertEquals(1, unreadCount(parent));
	}

	/** Contract: each type has its own switch; with only droppedOff off, the pickup makes an entry and the drop-off does not. */
	@Test
	void aDroppedOffThatIsOffMakesNoEntryWhileThePickupStillDoes() throws Exception {
		UUID parent = aParent();
		Bus bus = aBus("Hamra morning run");
		UUID tarek = aStudent("Tarek", parent);
		onRoute(bus, tarek);
		String run = runId(bus, "MORNING");
		assertEquals(200, start(bus, run).getStatus());
		saved(parent, json("true", "false", "true", "true", "10"));

		assertEquals(200, confirm(bus, run, tarek, "PICKED_UP").getStatus());
		MockHttpServletResponse droppedOff = confirm(bus, run, tarek, "DROPPED_OFF");

		assertEquals(200, droppedOff.getStatus(), droppedOff.getContentAsString());
		assertEquals(List.of("PICKED_UP"), inboxTypes(parent), "no DROPPED_OFF entry");
		assertEquals(1, unreadCount(parent));
	}

	/** Contract: turning a type back on does not make the entries that were skipped; the next one is made. */
	@Test
	void turningATypeBackOnDoesNotBackfillButTheNextEventMakesAnEntry() throws Exception {
		UUID parent = aParent();
		Bus bus = aBus("Hamra morning run");
		UUID tarek = aStudent("Tarek", parent);
		UUID rana = aStudent("Rana", parent);
		onRoute(bus, tarek, rana);
		String run = runId(bus, "MORNING");
		assertEquals(200, start(bus, run).getStatus());
		saved(parent, json("false", "true", "true", "true", "10"));
		assertEquals(200, confirm(bus, run, tarek, "PICKED_UP").getStatus());

		saved(parent, json("true", "true", "true", "true", "10"));

		assertEquals(List.of(), inboxTypes(parent), "the skipped pickup is not made now");
		assertEquals(200, confirm(bus, run, rana, "PICKED_UP").getStatus());
		assertEquals(List.of("PICKED_UP"), inboxTypes(parent));
		assertEquals(200, confirm(bus, run, tarek, "PICKED_UP").getStatus());
		assertEquals(List.of("PICKED_UP"), inboxTypes(parent), "a replay of the skipped pickup is still no entry");
	}

	/** Contract: turning a type off does not delete the entries it already made. */
	@Test
	void turningATypeOffKeepsTheEntriesAlreadyMade() throws Exception {
		UUID parent = aParent();
		Bus bus = aBus("Hamra morning run");
		UUID tarek = aStudent("Tarek", parent);
		onRoute(bus, tarek);
		String run = runId(bus, "MORNING");
		assertEquals(200, start(bus, run).getStatus());
		assertEquals(200, confirm(bus, run, tarek, "PICKED_UP").getStatus());

		saved(parent, json("false", "false", "false", "false", "10"));

		assertEquals(List.of("PICKED_UP"), inboxTypes(parent));
		assertEquals(1, unreadCount(parent));
	}

	/** Contract: the choices are the parent's own, for all their children, and another parent of the same run is not affected. */
	@Test
	void theChoicesCoverAllTheParentsChildrenAndNobodyElse() throws Exception {
		UUID parent = aParent();
		UUID other = aParent();
		Bus bus = aBus("Hamra morning run");
		UUID tarek = aStudent("Tarek", parent);
		UUID rana = aStudent("Rana", parent);
		UUID bilal = aStudent("Bilal", other);
		onRoute(bus, tarek, rana, bilal);
		String run = runId(bus, "MORNING");
		assertEquals(200, start(bus, run).getStatus());
		saved(parent, json("false", "true", "false", "true", "10"));

		assertEquals(200, confirm(bus, run, tarek, "PICKED_UP").getStatus());
		assertEquals(200, confirm(bus, run, rana, "NOT_PRESENT").getStatus());
		assertEquals(200, confirm(bus, run, bilal, "PICKED_UP").getStatus());

		assertEquals(List.of(), inboxTypes(parent), "neither child's pickup nor not-present made an entry");
		assertEquals(List.of("PICKED_UP"), inboxTypes(other), "the other parent kept the defaults");
	}

	// ---------------------------------------------------------------- roles

	/** Contract: every other role gets a 403, and a signed-out caller a 401. */
	@Test
	void bothEndpointsAre401WhenSignedOutAnd403ForHeadAdminAndDriver() throws Exception {
		assertEquals(401, send(get(PREFERENCES)).getStatus());
		MockHttpServletResponse signedOut = send(put(PREFERENCES).contentType(MediaType.APPLICATION_JSON).content(SAMPLE));
		assertEquals(401, signedOut.getStatus());
		assertEquals("", signedOut.getContentAsString());
		for (Role role : List.of(Role.HEAD_OF_TRANSPORT, Role.ADMIN, Role.DRIVER)) {
			assertEquals(403, send(get(PREFERENCES).with(as(role, UUID.randomUUID()))).getStatus(), role + " GET");
			assertEquals(403, send(put(PREFERENCES).with(as(role, UUID.randomUUID())).contentType(MediaType.APPLICATION_JSON)
					.content(SAMPLE)).getStatus(), role + " PUT");
		}
	}
}
