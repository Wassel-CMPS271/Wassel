/**
 * Inbox module (SCRUM-267): the events a parent is told about their child's runs. An entry is made when the driver's
 * confirmation is saved ({@code runs.event.ConfirmationRecordedEvent}), and only the linked parent can read it. Each
 * parent chooses which entries they receive and how late a pickup must be before they are told (SCRUM-268); the late
 * alerts come from a job that asks {@code runs} which children are still waiting. See {@code docs/contracts/inbox.md}.
 * Each entry is also emailed to the parent when switched on (SCRUM-283, {@code docs/contracts/notification-delivery.md}), through
 * {@code auth.service.Mailer}, by a sender that finds the entries itself so the confirmation never waits on it.
 * Reads the child through {@code students.service.StudentService} and the waiting children through
 * {@code runs.service.RunService}; nothing depends on this module, and {@code runs} does not import it.
 */
package com.wassel.backend.inbox;
