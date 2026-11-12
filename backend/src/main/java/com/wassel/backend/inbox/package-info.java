/**
 * Inbox module (SCRUM-267): the events a parent is told about their child's runs. An entry is made when the driver's
 * confirmation is saved ({@code runs.event.ConfirmationRecordedEvent}), and only the linked parent can read it. See
 * {@code docs/contracts/inbox.md}. Reads the child through {@code students.service.StudentService}; nothing depends on
 * this module, and {@code runs} does not import it.
 */
package com.wassel.backend.inbox;
