/**
 * Reports module (SCRUM-271): the head of transportation's transport totals and their CSV export, over a date range.
 * See {@code docs/contracts/transport-totals.md}. Stores nothing: it reads the figures through
 * {@code runs.service.RunService}, {@code absences.service.AbsenceService} and {@code students.service.StudentService},
 * and nothing depends on it.
 */
package com.wassel.backend.reports;
