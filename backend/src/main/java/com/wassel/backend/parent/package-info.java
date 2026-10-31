/**
 * Parent module: the signed-in parent's own children, their route, driver, vehicle and expected
 * pickup time (SCRUM-240). Its own module rather than a subpackage of {@code students} or
 * {@code routes} because it reads both of them plus, later, {@code runs} (SCRUM-237) — and
 * {@code runs} already reads {@code routes}, so putting this inside either would make a cycle.
 * See {@code docs/contracts/runs.md} for the agreed shape and rules.
 */
package com.wassel.backend.parent;
