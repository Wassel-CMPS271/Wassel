/**
 * Attendance module (SCRUM-265): a parent's attendance history for a linked child and the head of transportation's
 * attendance rows and pickup/drop-off audit, over a date range. Read-only: it shows what the drivers recorded
 * (SCRUM-235). See {@code docs/contracts/attendance.md}. Reads {@code runs} (the recorded confirmations),
 * {@code students} (names, and parent ownership of a child) and {@code routes} (names) through their services.
 * Nothing depends on it.
 */
package com.wassel.backend.attendance;
