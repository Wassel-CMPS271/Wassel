package com.wassel.backend.auth.controller;

import com.wassel.backend.auth.support.AuthEmailSupport;
import com.wassel.backend.users.entity.User;
import com.zaxxer.hikari.HikariDataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import javax.sql.DataSource;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * SCRUM-289, "Where the send happens" in docs/contracts/auth-email.md: while the provider is being called, the request
 * holds no database connection. The mailer reads the pool's active count from inside the send. Sign-in, resend and
 * forgot-password each get one test.
 */
class AuthEmailConnectionTests extends AuthEmailSupport {

	@Autowired
	private DataSource dataSource;

	private int activeDuringTheSend(Callback request) throws Exception {
		HikariDataSource pool = dataSource.unwrap(HikariDataSource.class);
		AtomicInteger seen = new AtomicInteger(-1);
		mailer.whileSending(() -> seen.set(pool.getHikariPoolMXBean().getActiveConnections()));
		request.run();
		return seen.get();
	}

	private interface Callback {
		void run() throws Exception;
	}

	@Test
	void aLoginHoldsNoConnectionWhileTheCodeIsSent() throws Exception {
		User user = saveUser();

		assertEquals(0, activeDuringTheSend(() -> login(user)));
	}

	@Test
	void aResendHoldsNoConnectionWhileTheCodeIsSent() throws Exception {
		User user = saveUser();
		var pending = pendingCookie(login(user));
		ageCode(user);

		assertEquals(0, activeDuringTheSend(() -> resend(pending)));
	}

	@Test
	void forgotPasswordHoldsNoConnectionWhileTheLinkIsSent() throws Exception {
		User user = saveUser();

		assertEquals(0, activeDuringTheSend(() -> forgotPassword(user.getEmail())));
	}

	@Test
	void aSlowSendForOneUserDoesNotStallAnotherUsersLogin() throws Exception {
		User slow = saveUser();
		User other = saveUser();
		CountDownLatch inTheSend = new CountDownLatch(1);
		CountDownLatch release = new CountDownLatch(1);
		AtomicBoolean first = new AtomicBoolean(true);
		mailer.whileSending(() -> {
			if (first.getAndSet(false)) {
				inTheSend.countDown();
				try {
					release.await(30, TimeUnit.SECONDS);
				}
				catch (InterruptedException e) {
					Thread.currentThread().interrupt();
				}
			}
		});
		ExecutorService pool = Executors.newSingleThreadExecutor();
		try {
			Future<Integer> slowLogin = pool.submit(() -> login(slow).getResponse().getStatus());
			assertTrue(inTheSend.await(10, TimeUnit.SECONDS));

			assertEquals(204, login(other).getResponse().getStatus());

			release.countDown();
			assertEquals(204, slowLogin.get(10, TimeUnit.SECONDS));
		}
		finally {
			release.countDown();
			pool.shutdownNow();
		}
	}
}
