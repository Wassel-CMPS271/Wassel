/**
 * Absences module (SCRUM-238): a parent reports and cancels a child's absence for one day or a
 * date range; a head of transportation lists who is absent on a given date. See
 * {@code docs/contracts/runs.md} for the agreed shapes and rules. Reads {@code students}
 * (parent ownership of a child) and {@code routes} (a student's route and stop position, for the
 * head of transportation's list only). Never reads {@code runs}.
 */
package com.wassel.backend.absences;
