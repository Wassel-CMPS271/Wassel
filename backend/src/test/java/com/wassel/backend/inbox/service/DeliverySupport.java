package com.wassel.backend.inbox.service;

import com.wassel.backend.common.RunCriteriaSupport;
import com.wassel.backend.inbox.entity.DeliveryStatus;
import com.wassel.backend.inbox.entity.InboxEvent;
import com.wassel.backend.inbox.entity.NotificationDelivery;
import com.wassel.backend.inbox.repository.InboxEventRepository;
import com.wassel.backend.inbox.repository.NotificationDeliveryRepository;
import com.wassel.backend.users.entity.Role;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/**
 * Fixtures for the delivery tests (SCRUM-283): entries are made the real way (the driver's confirmation through the
 * HTTP API, or the late-alert service), the sender is called directly, and a {@link RecordingMailer} stands in for the
 * mail provider. The outbox and the inbox are emptied first, so a test sees only its own rows and the cap counts only
 * its own sends.
 */
@Import({ RunCriteriaSupport.TestClock.class, RecordingMailer.Config.class })
public abstract class DeliverySupport extends RunCriteriaSupport {

	protected static final Path SAMPLES = Path.of("../docs/contracts/samples/notification-delivery/");

	/** One child on a morning run the driver has started, and the parent. */
	public record Scene(UUID parent, Bus bus, UUID child, String run) {
	}

	@Autowired
	protected RecordingMailer mailer;

	@Autowired
	protected NotificationDeliveryService deliveries;

	@Autowired
	protected NotificationDeliveryRepository deliveryRepository;

	@Autowired
	protected InboxEventRepository inboxRepository;

	@Autowired
	protected LateAlertService lateAlerts;

	@Autowired
	protected TransactionTemplate transactions;

	@Autowired
	protected JdbcTemplate jdbc;

	@BeforeEach
	void anEmptyOutbox() {
		mailer.reset();
		deliveryRepository.deleteAll();
		inboxRepository.deleteAll();
	}

	/** A bus holds 14 children, so every ten children get a bus of their own. */
	private static final int PER_BUS = 10;

	/** A child with their own parent for each name, on buses whose morning run is started. */
	protected List<Scene> aStartedMorningRun(String... names) throws Exception {
		List<Scene> scenes = new ArrayList<>();
		for (int from = 0; from < names.length; from += PER_BUS) {
			Bus bus = aBus("Hamra morning run " + from);
			List<UUID> parents = new ArrayList<>();
			List<UUID> children = new ArrayList<>();
			int to = Math.min(names.length, from + PER_BUS);
			for (int i = from; i < to; i++) {
				UUID parent = aParent();
				UUID child = aStudent(names[i], parent);
				onRoute(bus, child);
				parents.add(parent);
				children.add(child);
			}
			String run = runId(bus, "MORNING");
			assertEquals(200, start(bus, run).getStatus());
			for (int i = 0; i < parents.size(); i++) {
				scenes.add(new Scene(parents.get(i), bus, children.get(i), run));
			}
		}
		return scenes;
	}

	protected Scene aChild(String name) throws Exception {
		return aStartedMorningRun(name).get(0);
	}

	/** The driver confirms the child on the scene's run. */
	protected void tap(Scene scene, String status) throws Exception {
		MockHttpServletResponse response = confirm(scene.bus(), scene.run(), scene.child(), status);
		assertEquals(200, response.getStatus(), response.getContentAsString());
	}

	protected String emailOf(UUID parent) {
		return userRepository.findById(parent).orElseThrow().getEmail();
	}

	protected List<RecordingMailer.Mail> mailsTo(UUID parent) {
		String address = emailOf(parent);
		return mailer.sent().stream().filter(mail -> mail.to().equals(address)).toList();
	}

	/** This test's deliveries (every school's rows were emptied, but another school can be made on purpose). */
	protected List<NotificationDelivery> theDeliveries() {
		return deliveryRepository.findAll().stream().filter(d -> d.getSchoolId().equals(school)).toList();
	}

	protected NotificationDelivery theDelivery() {
		List<NotificationDelivery> all = theDeliveries();
		assertEquals(1, all.size(), "deliveries: " + all.size());
		return all.get(0);
	}

	protected int sentMails() {
		return mailer.sent().size();
	}

	protected long count(DeliveryStatus status) {
		return theDeliveries().stream().filter(d -> d.getStatus() == status).count();
	}

	/** The delivery of the one entry this parent has. */
	protected NotificationDelivery deliveryOf(UUID parent) {
		List<UUID> entries = inboxRepository.findAll().stream().filter(entry -> entry.getParentUserId().equals(parent))
				.map(InboxEvent::getId).toList();
		assertEquals(1, entries.size(), "entries of the parent: " + entries.size());
		return theDeliveries().stream().filter(d -> d.getInboxEventId().equals(entries.get(0))).findFirst()
				.orElseThrow();
	}

	/** The parent turns "picked up" off; the other types stay on. */
	protected void pickedUpOff(UUID parent) throws Exception {
		MockHttpServletResponse saved = send(put("/api/parent/notification-preferences")
				.with(as(Role.PARENT, parent)).contentType(MediaType.APPLICATION_JSON).content(
						"{\"pickedUp\":false,\"droppedOff\":true,\"notPresent\":true,\"late\":true,\"lateAfterMinutes\":10}"));
		assertEquals(200, saved.getStatus(), saved.getContentAsString());
	}

	protected void revoke(UUID parent) throws Exception {
		MockHttpServletResponse revoked = send(patch("/api/head-of-transport/parents/" + parent + "/revoke")
				.with(head()));
		assertEquals(200, revoked.getStatus(), revoked.getContentAsString());
	}

	/** How many entries the parent sees in the inbox. */
	protected int inboxSize(UUID parent) throws Exception {
		MockHttpServletResponse inbox = send(get("/api/parent/inbox").with(as(Role.PARENT, parent)));
		return com.jayway.jsonpath.JsonPath.<List<Object>>read(inbox.getContentAsString(), "$").size();
	}

	/** The entry's delivery is found and claimed, as a send that is in flight (or that crashed) leaves it. */
	protected NotificationDelivery inFlight(Scene scene) {
		deliveryRepository.discover(clock.instant().minus(Duration.ofMinutes(60)), clock.instant());
		NotificationDelivery found = deliveryOf(scene.parent());
		assertEquals(1, deliveryRepository.claim(found.getId(), clock.instant()));
		return deliveryOf(scene.parent());
	}

	/** Runs the sender at the first attempt and at each of the three waits (1, 5 and 15 minutes) after it. */
	protected void walkTheRetries() {
		deliveries.deliverDue();
		later(Duration.ofMinutes(1));
		deliveries.deliverDue();
		later(Duration.ofMinutes(5));
		deliveries.deliverDue();
		later(Duration.ofMinutes(15));
		deliveries.deliverDue();
	}

	/** The lines the sender wrote (it logs under its own class name). */
	protected static String ourLog(CapturedOutput output) {
		return String.join("\n", output.getAll().lines().filter(line -> line.contains("NotificationDelivery")).toList());
	}

	/** Nothing private is in the log: not the parent's address, the child's name, the text of an email or the provider's message. */
	protected void assertNothingPrivateIn(CapturedOutput output, UUID parent, String... names) {
		String ours = ourLog(output);
		List<String> secrets = new ArrayList<>(List.of(emailOf(parent), "Nasr", "picked up", "See the details"));
		secrets.addAll(List.of(names));
		for (String secret : secrets) {
			assertFalse(ours.contains(secret), "the log must not hold: " + secret);
		}
		assertFalse(output.getAll().contains("The provider refused"),
				"the provider's own message holds the address and is never logged");
	}

	protected void later(Duration time) {
		clock.set(clock.instant().plus(time));
	}
}
