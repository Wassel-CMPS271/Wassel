package com.wassel.backend.common;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

/**
 * Runs several requests at the same instant, for the race checks. Shared by the two test hierarchies
 * ({@link CriteriaTestSupport} and {@link RunCriteriaSupport}), which have no common base class.
 */
public final class Parallel {

	private Parallel() {
	}

	/**
	 * Runs the calls at the same instant (every thread waits at a barrier first) and returns what each answered, in the
	 * order given. A call returns the HTTP status of its request.
	 */
	public static List<Integer> inParallel(List<Callable<Integer>> calls) throws Exception {
		ExecutorService pool = Executors.newFixedThreadPool(calls.size());
		try {
			CyclicBarrier gate = new CyclicBarrier(calls.size());
			List<Future<Integer>> pending = new ArrayList<>();
			for (Callable<Integer> call : calls) {
				pending.add(pool.submit(() -> {
					gate.await();
					return call.call();
				}));
			}
			List<Integer> statuses = new ArrayList<>();
			for (Future<Integer> answer : pending) {
				statuses.add(answer.get(60, TimeUnit.SECONDS));
			}
			return statuses;
		}
		finally {
			pool.shutdownNow();
		}
	}
}
