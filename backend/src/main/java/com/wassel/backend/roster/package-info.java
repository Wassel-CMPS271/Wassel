/**
 * Roster module (SCRUM-270): pausing and archiving a student, and placing a student on the best route. It exists because
 * both touch the students and the routes, and {@code students} never imports {@code routes}; it stores nothing of its own
 * and nothing depends on it. See {@code docs/contracts/roster.md}.
 */
package com.wassel.backend.roster;
