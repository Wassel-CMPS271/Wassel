/**
 * Routing module: the contracts the route features code against (SCRUM-201). {@code RouteOptimizer}
 * orders a route's stops and {@code TravelTimes} gives driving times between points; both are
 * interfaces so the solver (SCRUM-202) and the road provider client (SCRUM-204) plug in without
 * changing their callers. The JSON shapes are in {@code docs/contracts/routing.md}.
 */
package com.wassel.backend.routing;
