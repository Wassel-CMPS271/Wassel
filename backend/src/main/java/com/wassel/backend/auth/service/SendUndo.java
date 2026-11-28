package com.wassel.backend.auth.service;

import com.wassel.backend.auth.entity.AuthEmailKind;
import lombok.extern.slf4j.Slf4j;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.UUID;
import java.util.function.IntSupplier;

/**
 * The second short transaction of an authentication email that failed to send (SCRUM-289): it takes back what the first
 * one wrote. It never throws, so the caller keeps the original error, and it logs ids and the kind only.
 */
@Slf4j
final class SendUndo {

	private SendUndo() {
	}

	/** {@code undo} answers how many rows it changed: 0 means someone else already had, which is not an error. */
	static void run(TransactionTemplate transactions, IntSupplier undo, AuthEmailKind kind, UUID userId) {
		try {
			Integer changed = transactions.execute(status -> undo.getAsInt());
			if (changed == null || changed == 0) {
				log.warn("Undoing the failed {} email for user {} found nothing to undo: a newer request had already "
						+ "replaced or used it", kind, userId);
			}
		}
		catch (RuntimeException ex) {
			// The undo's own stack is logged: it is a database error and holds no address.
			log.error("Undoing the failed {} email for user {} failed: a code or link nobody received may remain", kind,
					userId, ex);
		}
	}
}
