package com.wassel.backend.inbox.controller;

import com.jayway.jsonpath.JsonPath;
import com.wassel.backend.inbox.service.DeliverySupport;
import com.wassel.backend.users.entity.Role;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/**
 * SCRUM-283, "DeliverySummary" and the endpoint in docs/contracts/notification-delivery.md, against the real
 * deliveries the sender makes (a {@code RecordingMailer} is the only stand-in).
 */
class AdminNotificationDeliveryControllerTests extends DeliverySupport {

	private static final String SUMMARY = "/api/admin/notification-deliveries/summary";

	private static final Path SAMPLES = Path.of("../docs/contracts/samples/notification-delivery/");

	private MockHttpServletResponse summary(UUID schoolId, String date) throws Exception {
		var request = get(SUMMARY).with(as(Role.ADMIN, UUID.randomUUID(), schoolId));
		return send(date == null ? request : request.param("date", date));
	}

	private String summaryOfThisSchool(String date) throws Exception {
		MockHttpServletResponse response = summary(school, date);
		assertEquals(200, response.getStatus(), response.getContentAsString());
		return response.getContentAsString();
	}

	private static List<String> paths(String prefix, Object json) {
		List<String> all = new ArrayList<>();
		if (json instanceof Map<?, ?> map) {
			for (Map.Entry<?, ?> entry : map.entrySet()) {
				String path = prefix + "/" + entry.getKey();
				all.add(path);
				all.addAll(paths(path, entry.getValue()));
			}
		}
		return all;
	}

	private static TreeSet<String> keyPaths(String json) {
		return new TreeSet<>(paths("", JsonPath.read(json, "$")));
	}

	@Test
	void anEmptyDayIsTheEmptySampleExactly() throws Exception {
		String sample = Files.readString(SAMPLES.resolve("summary-empty.json"));

		String body = summaryOfThisSchool("2026-11-15");

		assertEquals(JsonPath.<Map<String, Object>>read(sample, "$"), JsonPath.<Map<String, Object>>read(body, "$"));
		assertNull(JsonPath.read(body, "$.oldestPendingAt"));
	}

	@Test
	void theKeysAreTheKeysOfTheContractSample() throws Exception {
		aChild("Lina");

		assertEquals(keyPaths(Files.readString(SAMPLES.resolve("summary.json"))), keyPaths(summaryOfThisSchool(null)));
	}

	@Test
	void mixedOutcomesAreCountedByStatusAndReason() throws Exception {
		List<Scene> c = aStartedMorningRun("Lina", "Omar", "Maya", "Sami", "Nour", "Tala");

		// 1: sent at the first try.
		tap(c.get(0), "PICKED_UP");
		deliveries.deliverDue();
		// 2: fails once, then sent (retried).
		tap(c.get(1), "PICKED_UP");
		mailer.refuseNext(1);
		deliveries.deliverDue();
		later(Duration.ofMinutes(1));
		deliveries.deliverDue();
		// 3: fails every time, then gives up (failed, retried).
		tap(c.get(2), "PICKED_UP");
		mailer.refuseAll(true);
		deliveries.deliverDue();
		for (long minutes : new long[] { 1, 5, 15 }) {
			later(Duration.ofMinutes(minutes));
			deliveries.deliverDue();
		}
		mailer.refuseAll(false);
		// 4: the parent turned the type off before the email went out (skipped).
		tap(c.get(3), "PICKED_UP");
		MockHttpServletResponse saved = send(put("/api/parent/notification-preferences")
				.with(as(Role.PARENT, c.get(3).parent())).contentType(MediaType.APPLICATION_JSON).content(
						"{\"pickedUp\":false,\"droppedOff\":true,\"notPresent\":true,\"late\":true,\"lateAfterMinutes\":10}"));
		assertEquals(200, saved.getStatus());
		deliveries.deliverDue();
		// 5: the parent was revoked (skipped).
		tap(c.get(4), "PICKED_UP");
		assertEquals(200, send(patch("/api/head-of-transport/parents/" + c.get(4).parent() + "/revoke")
				.with(head())).getStatus());
		deliveries.deliverDue();
		// 6: found but not yet tried (pending).
		tap(c.get(5), "PICKED_UP");
		Instant foundAt = clock.instant();
		deliveryRepository.discover(foundAt.minus(Duration.ofMinutes(60)), foundAt);

		String body = summaryOfThisSchool(null);

		assertEquals(Map.of("pending", 1, "sending", 0, "sent", 2, "failed", 1, "skipped", 2),
				JsonPath.<Map<String, Object>>read(body, "$.counts"));
		assertEquals(Map.of("PREFERENCE_OFF", 1, "NO_RECIPIENT", 1, "DAILY_CAP", 0, "PROVIDER_ERROR", 1, "EXPIRED", 0,
				"INTERRUPTED", 0), JsonPath.<Map<String, Object>>read(body, "$.reasons"));
		assertEquals(2, (int) JsonPath.read(body, "$.retried"));
		assertEquals(foundAt, Instant.parse(JsonPath.read(body, "$.oldestPendingAt")));
		assertEquals("2026-11-04", JsonPath.read(body, "$.date"));
		assertEquals(150, (int) JsonPath.read(body, "$.dailyCap"));
		assertEquals(false, JsonPath.read(body, "$.emailEnabled"));
		assertFalse(body.contains("@") || body.contains("Lina") || body.contains("Nasr"),
				"counts only: no address and no name");
	}

	@Test
	void anotherSchoolsDeliveriesAreNotCounted() throws Exception {
		Scene lina = aChild("Lina");
		tap(lina, "PICKED_UP");
		UUID elsewhere = UUID.randomUUID();
		// An entry of another school, made with the inbox's own statement: nobody there has an account, so it is skipped.
		transactions.executeWithoutResult(status -> inboxRepository.insertIfMissing(elsewhere, UUID.randomUUID(),
				UUID.randomUUID(), "Omar Nasr", UUID.randomUUID(), "MORNING", "PICKED_UP", clock.instant()));
		deliveries.deliverDue();

		assertEquals(1, (int) JsonPath.read(summaryOfThisSchool(null), "$.counts.sent"));
		assertEquals(0, (int) JsonPath.read(summaryOfThisSchool(null), "$.counts.skipped"));
		MockHttpServletResponse other = summary(elsewhere, null);
		assertEquals(0, (int) JsonPath.read(other.getContentAsString(), "$.counts.sent"));
		assertEquals(1, (int) JsonPath.read(other.getContentAsString(), "$.counts.skipped"));
	}

	@Test
	void aDateThatDoesNotParseIsABadRequest() throws Exception {
		MockHttpServletResponse response = summary(school, "2026-13-01");

		assertEquals(400, response.getStatus());
		assertEquals("Invalid request parameter", JsonPath.read(response.getContentAsString(), "$.detail"));
	}

	@Test
	void withNoDateItIsTodayInBeirutAndADayIsTheDayTheDeliveryWasCreated() throws Exception {
		Scene lina = aChild("Lina");
		tap(lina, "PICKED_UP");
		deliveries.deliverDue();

		assertEquals(1, (int) JsonPath.read(summaryOfThisSchool(null), "$.counts.sent"));
		assertEquals(1, (int) JsonPath.read(summaryOfThisSchool("2026-11-04"), "$.counts.sent"));
		assertEquals(0, (int) JsonPath.read(summaryOfThisSchool("2026-11-03"), "$.counts.sent"));
	}
}
