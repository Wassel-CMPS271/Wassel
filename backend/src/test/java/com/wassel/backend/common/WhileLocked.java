package com.wassel.backend.common;

import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Proves a request takes a lock before it checks anything (SCRUM-259), the way {@code RunControllerTests} does for the
 * run row. {@code lockAndChange} runs in another transaction: it takes the lock, then changes what the request is
 * about to check. The request must still be waiting a second later; it is answered once that transaction commits,
 * and the answer is returned. A request that checked before taking the lock would answer at once, on stale numbers.
 */
public final class WhileLocked {

	private WhileLocked() {
	}

	public static MockHttpServletResponse send(TransactionTemplate transactionTemplate, Runnable lockAndChange,
			Callable<MockHttpServletResponse> request) throws Exception {
		CountDownLatch locked = new CountDownLatch(1);
		CountDownLatch release = new CountDownLatch(1);
		ExecutorService pool = Executors.newFixedThreadPool(2);
		try {
			Future<?> holder = pool.submit(() -> transactionTemplate.executeWithoutResult(tx -> {
				lockAndChange.run();
				locked.countDown();
				try {
					release.await();
				} catch (InterruptedException e) {
					Thread.currentThread().interrupt();
				}
			}));
			assertTrue(locked.await(10, TimeUnit.SECONDS), "the lock was not taken");
			Future<MockHttpServletResponse> sent = pool.submit(request);

			assertThrows(TimeoutException.class, () -> sent.get(1, TimeUnit.SECONDS),
					"the request did not wait for the lock");
			release.countDown();
			holder.get(10, TimeUnit.SECONDS);
			return sent.get(10, TimeUnit.SECONDS);
		} finally {
			release.countDown();
			pool.shutdownNow();
		}
	}
}
