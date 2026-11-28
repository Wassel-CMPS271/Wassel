package independent.scrum295;

import com.wassel.backend.WasselBackendApplication;
import com.wassel.backend.inbox.entity.DeliveryReason;
import com.wassel.backend.inbox.entity.DeliveryStatus;
import com.wassel.backend.inbox.service.DeliverySupport;
import com.wassel.backend.monitoring.service.OperationalMetrics;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.annotation.DirtiesContext;
import java.time.Duration;
import static org.junit.jupiter.api.Assertions.*;

/** Independent metric deltas through real confirmation/outbox/PostgreSQL; only the mail provider is a stand-in. */
@SpringBootTest(classes = WasselBackendApplication.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class IndependentNotificationMetricsCriteriaTests extends DeliverySupport {
    @Autowired OperationalMetrics metrics;
    private long[] counters() {
        var value = metrics.snapshot().notifications();
        return new long[]{value.sent(), value.failed()};
    }
    private void delta(long[] before, long sent, long failed) {
        var after = counters();
        assertEquals(sent, after[0] - before[0], "notification sent delta");
        assertEquals(failed, after[1] - before[1], "notification final-failure delta");
    }
    @Test void aRetryThenSuccessCountsOneSentAndNoFinalFailure() throws Exception {
        var scene = aChild("RetryCase"); tap(scene, "PICKED_UP"); mailer.refuseNext(1);
        var before = counters(); deliveries.deliverDue();
        assertEquals(DeliveryStatus.PENDING, theDelivery().getStatus()); delta(before, 0, 0);
        later(Duration.ofMinutes(1)); deliveries.deliverDue();
        assertEquals(DeliveryStatus.SENT, theDelivery().getStatus()); assertEquals(1, sentMails());
        delta(before, 1, 0); deliveries.deliverDue(); delta(before, 1, 0);
    }
    @Test void exhaustedRetriesCountOneFailureOnlyWhenTheDeliveryFinallyEnds() throws Exception {
        var scene = aChild("FailureCase"); tap(scene, "PICKED_UP"); mailer.refuseAll(true);
        var before = counters(); deliveries.deliverDue(); delta(before, 0, 0);
        later(Duration.ofMinutes(1)); deliveries.deliverDue(); delta(before, 0, 0);
        later(Duration.ofMinutes(5)); deliveries.deliverDue(); delta(before, 0, 0);
        later(Duration.ofMinutes(15)); deliveries.deliverDue();
        assertEquals(DeliveryStatus.FAILED, theDelivery().getStatus());
        assertEquals(DeliveryReason.PROVIDER_ERROR, theDelivery().getReason());
        assertEquals(4, mailer.calls()); delta(before, 0, 1);
        later(Duration.ofMinutes(30)); deliveries.deliverDue(); delta(before, 0, 1);
    }
    @Test void expiredPendingDeliveryCountsOneFinalFailureRatherThanAnotherSend() throws Exception {
        var scene = aChild("ExpiryCase"); tap(scene, "PICKED_UP"); mailer.refuseAll(true);
        var before = counters(); deliveries.deliverDue(); delta(before, 0, 0);
        later(Duration.ofMinutes(60)); deliveries.deliverDue();
        assertEquals(DeliveryReason.EXPIRED, theDelivery().getReason()); delta(before, 0, 1);
        deliveries.deliverDue(); delta(before, 0, 1); assertEquals(1, mailer.calls());
    }
    @Test void interruptedInFlightDeliveryCountsOneFinalFailureWithoutCallingMail() throws Exception {
        var scene = aChild("InterruptedCase"); tap(scene, "PICKED_UP"); inFlight(scene);
        var before = counters(); later(Duration.ofMinutes(6)); deliveries.deliverDue();
        assertEquals(DeliveryReason.INTERRUPTED, theDelivery().getReason());
        delta(before, 0, 1); deliveries.deliverDue(); delta(before, 0, 1);
        assertEquals(0, mailer.calls());
    }
    @Test void mutedDeliveryIsSkippedWithoutIncrementingSentOrFailed() throws Exception {
        var scene = aChild("MutedCase"); tap(scene, "PICKED_UP");
        // The event must exist before muting; preferences can suppress an event before it reaches the outbox.
        pickedUpOff(scene.parent());
        var before = counters(); deliveries.deliverDue();
        assertEquals(DeliveryStatus.SKIPPED, theDelivery().getStatus());
        assertEquals(DeliveryReason.PREFERENCE_OFF, theDelivery().getReason());
        delta(before, 0, 0); assertEquals(0, mailer.calls());
    }
}
