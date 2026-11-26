package com.wassel.backend.auth.controller;

import com.wassel.backend.auth.support.AuthEmailSupport;
import com.wassel.backend.users.entity.Role;
import com.wassel.backend.users.entity.User;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * SCRUM-289, admin invites in docs/contracts/auth-email.md: they are counted and never refused by the cap (here set to
 * 1 for everything), and a failed send rolls the account back and takes its count with it, for parents and for drivers
 * (create and resend).
 */
@TestPropertySource(properties = { "wassel.auth.email.daily-cap=1", "wassel.auth.email.reset-daily-cap=1",
		"wassel.auth.email.per-account-daily-cap=1" })
class AdminInviteEmailTests extends AuthEmailSupport {

	private RequestPostProcessor head() {
		User head = User.builder().id(UUID.randomUUID()).email("head@wassel.test").passwordHash("x")
				.role(Role.HEAD_OF_TRANSPORT).schoolId(school).build();
		return authentication(new UsernamePasswordAuthenticationToken(head, null,
				List.of(new SimpleGrantedAuthority("ROLE_HEAD_OF_TRANSPORT"))));
	}

	private void invite(String email, int expected) throws Exception {
		mockMvc.perform(post("/api/head-of-transport/parents").with(head()).contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"%s\"}".formatted(email)))
				.andExpect(status().is(expected));
	}

	private String addDriver(String email, int expected) throws Exception {
		return mockMvc.perform(post("/api/head-of-transport/drivers").with(head()).contentType(MediaType.APPLICATION_JSON)
				.content("{\"firstName\":\"Nadia\",\"lastName\":\"Haddad\",\"phone\":\"+961 3 %03d %03d\",\"email\":\"%s\"}"
						.formatted(ThreadLocalRandom.current().nextInt(1000), ThreadLocalRandom.current().nextInt(1000), email)))
				.andExpect(status().is(expected)).andReturn().getResponse().getContentAsString();
	}

	private int inviteRows() {
		return jdbc.queryForObject("select count(*) from auth_emails where kind = 'INVITE_LINK'", Integer.class);
	}

	@Test
	void anInviteIsSentAndCountedEvenWhenTheDayIsUsedUp() throws Exception {
		jdbc.update("delete from auth_emails");
		assertEquals(204, login(saveUser()).getResponse().getStatus());
		String email = UUID.randomUUID() + "@wassel.test";

		invite(email, 201);

		assertEquals(1, mailer.sent().stream().filter(mail -> mail.to().equals(email)).count());
		assertEquals(1, jdbc.queryForObject("select count(*) from auth_emails where kind = 'INVITE_LINK'", Integer.class));
		assertEquals(2, jdbc.queryForObject("select count(*) from auth_emails", Integer.class), "over the cap of 1");
	}

	@Test
	void anInviteWhoseSendFailsIs500AndLeavesNoAccountAndNoToken() throws Exception {
		String email = UUID.randomUUID() + "@wassel.test";
		int tokensBefore = jdbc.queryForObject("select count(*) from password_tokens", Integer.class);
		mailer.refuseNext(1);

		int rowsBefore = inviteRows();

		invite(email, 500);

		assertEquals(0, jdbc.queryForObject("select count(*) from users where email = ?", Integer.class, email));
		assertEquals(tokensBefore, jdbc.queryForObject("select count(*) from password_tokens", Integer.class));
		assertEquals(rowsBefore, inviteRows(), "an invite that was not kept is not counted: its row rolled back with it");
	}

	@Test
	void aNewDriverWhoseInviteFailsIs500AndLeavesNoAccountNoDriverAndNoCountedInvite() throws Exception {
		String email = UUID.randomUUID() + "@wassel.test";
		int rowsBefore = inviteRows();
		mailer.refuseNext(1);

		addDriver(email, 500);

		assertEquals(0, jdbc.queryForObject("select count(*) from users where email = ?", Integer.class, email));
		assertEquals(0, jdbc.queryForObject("select count(*) from drivers where email = ?", Integer.class, email));
		assertEquals(rowsBefore, inviteRows());
	}

	@Test
	void aNewDriversInviteIsSentAndCounted() throws Exception {
		String email = UUID.randomUUID() + "@wassel.test";
		int rowsBefore = inviteRows();

		addDriver(email, 201);

		assertEquals(1, mailer.sent().stream().filter(mail -> mail.to().equals(email)).count());
		assertEquals(rowsBefore + 1, inviteRows());
	}

	@Test
	void aResentDriverInviteThatFailsIs500KeepsTheOldLinkAndIsNotCounted() throws Exception {
		String email = UUID.randomUUID() + "@wassel.test";
		String id = JsonPath.read(addDriver(email, 201), "$.id");
		UUID userId = jdbc.queryForObject("select id from users where email = ?", UUID.class, email);
		int rowsBefore = inviteRows();
		mailer.refuseNext(1);

		mockMvc.perform(patch("/api/head-of-transport/drivers/" + id + "/resend-invite").with(head()))
				.andExpect(status().isInternalServerError());

		assertEquals(rowsBefore, inviteRows());
		assertEquals(1, unusedTokens(userRepository.findById(userId).orElseThrow()), "the first link still works");
	}

	@Test
	void aResentDriverInviteIsSentAndCounted() throws Exception {
		String email = UUID.randomUUID() + "@wassel.test";
		String id = JsonPath.read(addDriver(email, 201), "$.id");
		int rowsBefore = inviteRows();

		mockMvc.perform(patch("/api/head-of-transport/drivers/" + id + "/resend-invite").with(head()))
				.andExpect(status().isOk());

		assertEquals(rowsBefore + 1, inviteRows());
		assertEquals(2, mailer.sent().stream().filter(mail -> mail.to().equals(email)).count());
	}
}
