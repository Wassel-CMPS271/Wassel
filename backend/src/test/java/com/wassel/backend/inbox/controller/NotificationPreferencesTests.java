package com.wassel.backend.inbox.controller;

import com.jayway.jsonpath.JsonPath;
import com.wassel.backend.common.RunCriteriaSupport;
import com.wassel.backend.users.entity.Role;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/**
 * SCRUM-268, against {@code docs/contracts/inbox.md} "Notification preferences": what is saved, who can see it, the limits
 * of the minutes, and that a saved choice decides which entries a driver's confirmation makes. Real app, real
 * repositories, PostgreSQL and every Flyway migration; the confirmations are real driver taps on a started run.
 */
class NotificationPreferencesTests extends RunCriteriaSupport {

	private static final String PATH = "/api/parent/notification-preferences";

	private static String body(boolean pickedUp, boolean droppedOff, boolean notPresent, boolean late, Object minutes) {
		return "{\"pickedUp\":%s,\"droppedOff\":%s,\"notPresent\":%s,\"late\":%s,\"lateAfterMinutes\":%s}"
				.formatted(pickedUp, droppedOff, notPresent, late, minutes);
	}

	private MockHttpServletResponse read(UUID parent, UUID inSchool) throws Exception {
		return send(get(PATH).with(as(Role.PARENT, parent, inSchool)));
	}

	private String read(UUID parent) throws Exception {
		MockHttpServletResponse response = read(parent, school);
		assertEquals(200, response.getStatus(), response.getContentAsString());
		return response.getContentAsString();
	}

	private MockHttpServletResponse save(UUID parent, String json) throws Exception {
		return send(put(PATH).with(as(Role.PARENT, parent)).contentType(MediaType.APPLICATION_JSON).content(json));
	}

	private static void assertChoices(String json, boolean pickedUp, boolean droppedOff, boolean notPresent, boolean late,
			int minutes) {
		assertEquals(pickedUp, JsonPath.<Boolean>read(json, "$.pickedUp"), json);
		assertEquals(droppedOff, JsonPath.<Boolean>read(json, "$.droppedOff"), json);
		assertEquals(notPresent, JsonPath.<Boolean>read(json, "$.notPresent"), json);
		assertEquals(late, JsonPath.<Boolean>read(json, "$.late"), json);
		assertEquals(minutes, JsonPath.<Integer>read(json, "$.lateAfterMinutes"), json);
	}

	// --- what is saved ------------------------------------------------------------------------

	@Test
	void aParentWhoNeverSavedAnythingHasEverythingOnAndTenMinutes() throws Exception {
		assertChoices(read(aParent()), true, true, true, true, 10);
	}

	@Test
	void theContractsSampleHasTheFieldsOfTheAnswerAndIsAcceptedAsABody() throws Exception {
		String sample = java.nio.file.Files.readString(
				java.nio.file.Path.of("../docs/contracts/samples/inbox/notification-preferences.json"));
		UUID parent = aParent();

		MockHttpServletResponse saved = save(parent, sample);

		assertEquals(200, saved.getStatus(), saved.getContentAsString());
		assertEquals(JsonPath.<java.util.Map<String, Object>>read(sample, "$"),
				JsonPath.<java.util.Map<String, Object>>read(read(parent), "$"));
	}

	@Test
	void savedChoicesAreAnsweredAndKeptAndTheLatestSaveReplacesThemAll() throws Exception {
		UUID parent = aParent();

		MockHttpServletResponse first = save(parent, body(false, true, false, true, 15));
		assertEquals(200, first.getStatus(), first.getContentAsString());
		assertChoices(first.getContentAsString(), false, true, false, true, 15);
		assertChoices(read(parent), false, true, false, true, 15);

		assertEquals(200, save(parent, body(true, false, true, false, 30)).getStatus());
		assertChoices(read(parent), true, false, true, false, 30);

		assertEquals(200, save(parent, body(true, false, true, false, 30)).getStatus(), "the same save again is fine");
		assertChoices(read(parent), true, false, true, false, 30);
	}

	@Test
	void theMinutesMayBeFiveToSixtyAndNothingElse() throws Exception {
		UUID parent = aParent();
		assertEquals(200, save(parent, body(true, true, true, true, 5)).getStatus());
		assertEquals(200, save(parent, body(true, true, true, true, 60)).getStatus());
		assertChoices(read(parent), true, true, true, true, 60);

		for (Object refused : List.of(4, 61, 0, -1, 1000000, "\"ten\"", "null")) {
			MockHttpServletResponse response = save(parent, body(false, false, false, false, refused));
			assertEquals(400, response.getStatus(), refused + ": " + response.getContentAsString());
		}
		assertChoices(read(parent), true, true, true, true, 60);
		MockHttpServletResponse tooFew = save(parent, body(false, false, false, false, 4));
		assertFalse(((String) JsonPath.read(tooFew.getContentAsString(), "$.errors.lateAfterMinutes")).isEmpty(),
				"the error is reported against the field: " + tooFew.getContentAsString());
	}

	@Test
	void aValueOfTheWrongTypeIsRefusedNotConvertedAndNothingIsSaved() throws Exception {
		UUID parent = aParent();
		assertEquals(200, save(parent, body(true, false, true, false, 20)).getStatus());

		// Jackson would turn each of these into a valid value (10, 10, true, true, false) unless coercion is off.
		List<String> accepted = new java.util.ArrayList<>();
		for (String refused : List.of(
				"{\"pickedUp\":true,\"droppedOff\":true,\"notPresent\":true,\"late\":true,\"lateAfterMinutes\":10.5}",
				"{\"pickedUp\":true,\"droppedOff\":true,\"notPresent\":true,\"late\":true,\"lateAfterMinutes\":10.0}",
				"{\"pickedUp\":true,\"droppedOff\":true,\"notPresent\":true,\"late\":true,\"lateAfterMinutes\":\"10\"}",
				"{\"pickedUp\":\"true\",\"droppedOff\":true,\"notPresent\":true,\"late\":true,\"lateAfterMinutes\":10}",
				"{\"pickedUp\":1,\"droppedOff\":true,\"notPresent\":true,\"late\":true,\"lateAfterMinutes\":10}",
				"{\"pickedUp\":true,\"droppedOff\":0,\"notPresent\":true,\"late\":true,\"lateAfterMinutes\":10}",
				"{\"pickedUp\":true,\"droppedOff\":true,\"notPresent\":\"false\",\"late\":true,\"lateAfterMinutes\":10}",
				"{\"pickedUp\":true,\"droppedOff\":true,\"notPresent\":true,\"late\":\"yes\",\"lateAfterMinutes\":10}",
				"{\"pickedUp\":true,\"droppedOff\":true,\"notPresent\":true,\"late\":true,\"lateAfterMinutes\":true}",
				"{\"pickedUp\":true,\"droppedOff\":true,\"notPresent\":true,\"late\":true,\"lateAfterMinutes\":1e1}",
				"{\"pickedUp\":true,\"droppedOff\":true,\"notPresent\":true,\"late\":true,\"lateAfterMinutes\":99999999999}",
				"{\"pickedUp\":[true],\"droppedOff\":true,\"notPresent\":true,\"late\":true,\"lateAfterMinutes\":10}")) {
			MockHttpServletResponse response = save(parent, refused);
			if (response.getStatus() != 400) {
				accepted.add(refused + " -> " + response.getStatus());
			}
		}
		assertEquals(List.of(), accepted, "bodies of the wrong type that were not refused");
		assertChoices(read(parent), true, false, true, false, 20);
	}

	@Test
	void everyChoiceMustBeGivenAndNothingIsSavedByARefusedRequest() throws Exception {
		UUID parent = aParent();
		assertEquals(200, save(parent, body(true, false, true, false, 20)).getStatus());

		for (String refused : List.of("{}", "{\"pickedUp\":false}",
				"{\"pickedUp\":null,\"droppedOff\":true,\"notPresent\":true,\"late\":true,\"lateAfterMinutes\":10}",
				"{\"pickedUp\":true,\"droppedOff\":true,\"notPresent\":true,\"lateAfterMinutes\":10}",
				"{\"pickedUp\":true,\"droppedOff\":true,\"notPresent\":true,\"late\":true}",
				"{\"pickedUp\":\"maybe\",\"droppedOff\":true,\"notPresent\":true,\"late\":true,\"lateAfterMinutes\":10}",
				"not json", "")) {
			MockHttpServletResponse response = save(parent, refused);
			assertEquals(400, response.getStatus(), refused + " -> " + response.getContentAsString());
		}
		assertChoices(read(parent), true, false, true, false, 20);
	}

	// --- who sees what ------------------------------------------------------------------------

	@Test
	void eachParentHasTheirOwnChoicesAndAnotherSchoolSeesDefaults() throws Exception {
		UUID parent = aParent();
		UUID other = aParent();
		assertEquals(200, save(parent, body(false, false, false, false, 45)).getStatus());

		assertChoices(read(parent), false, false, false, false, 45);
		assertChoices(read(other), true, true, true, true, 10);
		MockHttpServletResponse elsewhere = read(parent, UUID.randomUUID());
		assertEquals(200, elsewhere.getStatus());
		assertChoices(elsewhere.getContentAsString(), true, true, true, true, 10);
	}

	@Test
	void onlyAParentMaySeeOrSaveThem() throws Exception {
		for (Role role : List.of(Role.ADMIN, Role.HEAD_OF_TRANSPORT, Role.DRIVER)) {
			assertEquals(403, send(get(PATH).with(as(role, UUID.randomUUID()))).getStatus(), role.name());
			assertEquals(403, send(put(PATH).with(as(role, UUID.randomUUID())).contentType(MediaType.APPLICATION_JSON)
					.content(body(true, true, true, true, 10))).getStatus(), role.name());
		}
		assertEquals(401, send(get(PATH)).getStatus());
	}

	// --- what they decide ---------------------------------------------------------------------

	/** A started morning run with one child per parent, in this order. */
	private record Morning(Bus bus, String runId, UUID childOfFirst, UUID childOfSecond) {
	}

	private Morning aStartedRunWith(UUID first, UUID second) throws Exception {
		Bus bus = aBus("Hamra morning run");
		UUID rami = aStudent("Rami", first);
		UUID salma = aStudent("Salma", second);
		onRoute(bus, rami, salma);
		String runId = runId(bus, "MORNING");
		assertEquals(200, start(bus, runId).getStatus());
		return new Morning(bus, runId, rami, salma);
	}

	private void confirmOk(Morning m, UUID child, String status) throws Exception {
		MockHttpServletResponse response = confirm(m.bus(), m.runId(), child, status);
		assertEquals(200, response.getStatus(), response.getContentAsString());
		clock.set(clock.instant().plusSeconds(1));
	}

	private List<String> typesInInbox(UUID parent) throws Exception {
		MockHttpServletResponse response = send(get("/api/parent/inbox").with(as(Role.PARENT, parent)));
		assertEquals(200, response.getStatus());
		return JsonPath.read(response.getContentAsString(), "$[*].type");
	}

	@Test
	void aTypeTurnedOffMakesNoEntryAndTheOthersStillDo() throws Exception {
		UUID parent = aParent();
		Morning m = aStartedRunWith(parent, aParent());
		assertEquals(200, save(parent, body(false, true, true, true, 10)).getStatus());

		confirmOk(m, m.childOfFirst(), "PICKED_UP");
		assertEquals(List.of(), typesInInbox(parent), "pick-ups are off");
		confirmOk(m, m.childOfFirst(), "DROPPED_OFF");
		assertEquals(List.of("DROPPED_OFF"), typesInInbox(parent), "drop-offs are on");
	}

	@Test
	void aChoiceAppliesFromWhenItIsSavedAndNothingAlreadyThereChanges() throws Exception {
		UUID parent = aParent();
		Morning m = aStartedRunWith(parent, aParent());
		confirmOk(m, m.childOfFirst(), "PICKED_UP");
		assertEquals(List.of("PICKED_UP"), typesInInbox(parent));

		assertEquals(200, save(parent, body(false, false, false, true, 10)).getStatus());
		assertEquals(List.of("PICKED_UP"), typesInInbox(parent), "turning pick-ups off removes nothing");

		confirmOk(m, m.childOfFirst(), "DROPPED_OFF");
		assertEquals(List.of("PICKED_UP"), typesInInbox(parent), "and the drop-off is not told");

		assertEquals(200, save(parent, body(true, true, true, true, 10)).getStatus());
		assertEquals(List.of("PICKED_UP"), typesInInbox(parent), "turning it back on adds nothing for what was missed");
	}

	@Test
	void aChoiceIsOneParentsAndNeverTheOtherParentsOfTheSameRun() throws Exception {
		UUID quiet = aParent();
		UUID usual = aParent();
		Morning m = aStartedRunWith(quiet, usual);
		assertEquals(200, save(quiet, body(false, false, false, false, 10)).getStatus());

		confirmOk(m, m.childOfFirst(), "PICKED_UP");
		confirmOk(m, m.childOfSecond(), "PICKED_UP");

		assertEquals(List.of(), typesInInbox(quiet));
		assertEquals(List.of("PICKED_UP"), typesInInbox(usual));
	}

	@Test
	void everyTypeOffStillLetsTheDriverConfirm() throws Exception {
		UUID parent = aParent();
		Morning m = aStartedRunWith(parent, aParent());
		assertEquals(200, save(parent, body(false, false, false, false, 10)).getStatus());

		confirmOk(m, m.childOfFirst(), "NOT_PRESENT");
		confirmOk(m, m.childOfFirst(), "PICKED_UP");
		confirmOk(m, m.childOfFirst(), "DROPPED_OFF");

		assertEquals(List.of(), typesInInbox(parent));
	}
}
