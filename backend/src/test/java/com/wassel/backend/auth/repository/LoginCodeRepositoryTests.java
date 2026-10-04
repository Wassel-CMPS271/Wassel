package com.wassel.backend.auth.repository;

import com.wassel.backend.auth.entity.LoginCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.util.UUID;
import java.util.function.IntSupplier;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * The guards that hold when two requests race, checked one call at a time. Two threads started together
 * usually run one after the other, so a threaded test can pass without ever reaching these.
 */
@SpringBootTest
@ActiveProfiles("test")
class LoginCodeRepositoryTests {

	private static final int MAX = 5;

	@Autowired
	private LoginCodeRepository repository;

	@Autowired
	private TransactionTemplate transactions;

	@BeforeEach
	void cleanDatabase() {
		repository.deleteAll();
	}

	private UUID savedFor(UUID userId, Instant sentAt) {
		return repository.saveAndFlush(LoginCode.builder().userId(userId).pendingHash(UUID.randomUUID().toString())
				.codeHash("old").expiresAt(sentAt.plusSeconds(300)).sentAt(sentAt).build()).getId();
	}

	private int inTransaction(IntSupplier update) {
		return transactions.execute(status -> update.getAsInt());
	}

	@Test
	void aCodeCanOnlyBeMarkedUsedOnce() {
		UUID id = savedFor(UUID.randomUUID(), Instant.now());

		assertEquals(1, inTransaction(() -> repository.markUsed(id, Instant.now())));
		assertEquals(0, inTransaction(() -> repository.markUsed(id, Instant.now())));
	}

	@Test
	void attemptsStopBeingCountedAtTheLimit() {
		UUID id = savedFor(UUID.randomUUID(), Instant.now());

		for (int i = 0; i < MAX; i++) {
			assertEquals(1, inTransaction(() -> repository.recordAttempt(id, MAX)));
		}

		assertEquals(0, inTransaction(() -> repository.recordAttempt(id, MAX)));
		assertEquals(MAX, repository.findById(id).orElseThrow().getAttempts());
	}

	@Test
	void anAttemptOnAUsedCodeIsNotCounted() {
		UUID id = savedFor(UUID.randomUUID(), Instant.now());
		inTransaction(() -> repository.markUsed(id, Instant.now()));

		assertEquals(0, inTransaction(() -> repository.recordAttempt(id, MAX)));
	}

	@Test
	void aCodeIsReissuedOnlyOnceTheCooldownHasPassed() {
		Instant sentAt = Instant.now();
		UUID id = savedFor(UUID.randomUUID(), sentAt);
		inTransaction(() -> repository.recordAttempt(id, MAX));

		assertEquals(0, inTransaction(() -> repository.reissue(id, "new", sentAt.plusSeconds(300), sentAt,
				sentAt.minusSeconds(1), MAX)));
		assertEquals("old", repository.findById(id).orElseThrow().getCodeHash());

		assertEquals(1, inTransaction(() -> repository.reissue(id, "new", sentAt.plusSeconds(361),
				sentAt.plusSeconds(61), sentAt.plusSeconds(1), MAX)));
		LoginCode reissued = repository.findById(id).orElseThrow();
		assertEquals("new", reissued.getCodeHash());
		assertEquals(0, reissued.getAttempts());

		// The reissue moved sent_at forward, so the same cutoff now refuses a second one.
		assertEquals(0, inTransaction(() -> repository.reissue(id, "newer", sentAt.plusSeconds(361),
				sentAt.plusSeconds(61), sentAt.plusSeconds(1), MAX)));
	}

	@Test
	void aUsedOrExhaustedCodeIsNeverReissued() {
		Instant sentAt = Instant.now();
		Instant longAfter = sentAt.plusSeconds(3600);
		UUID used = savedFor(UUID.randomUUID(), sentAt);
		inTransaction(() -> repository.markUsed(used, sentAt));
		UUID exhausted = savedFor(UUID.randomUUID(), sentAt);
		for (int i = 0; i < MAX; i++) {
			inTransaction(() -> repository.recordAttempt(exhausted, MAX));
		}

		assertEquals(0, inTransaction(() -> repository.reissue(used, "new", longAfter, longAfter, longAfter, MAX)));
		assertEquals(0, inTransaction(() -> repository.reissue(exhausted, "new", longAfter, longAfter, longAfter, MAX)));
	}

	@Test
	void oneUserCannotHaveTwoPendingLogins() {
		UUID userId = UUID.randomUUID();
		savedFor(userId, Instant.now());

		assertThrows(DataIntegrityViolationException.class, () -> savedFor(userId, Instant.now()));
		assertEquals(1, repository.count());
	}
}
