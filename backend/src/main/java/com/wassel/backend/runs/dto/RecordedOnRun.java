package com.wassel.backend.runs.dto;

import java.util.UUID;

/** What a record of the attendance history says about where it came from: the run, its route and the student. Lets the {@code attendance} module name them all alike. */
public interface RecordedOnRun {

	UUID runId();

	UUID routeId();

	UUID studentId();
}
