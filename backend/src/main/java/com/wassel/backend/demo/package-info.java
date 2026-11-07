/**
 * Demo module: an opt-in seeder that fills the demo school with a head of transportation, a
 * parent, vehicles, drivers, students and school times, so a deployed app has something to show
 * (SCRUM-200). It is off unless {@code wassel.demo.enabled} is true, can be run any number of
 * times without duplicating anything, and refuses to run on a database that already has other
 * accounts. It only calls other modules' services.
 */
package com.wassel.backend.demo;
