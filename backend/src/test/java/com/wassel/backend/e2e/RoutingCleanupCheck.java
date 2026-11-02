package com.wassel.backend.e2e;

import java.sql.DriverManager;

/** Read-only browser-test oracle for the real membership columns, never a production endpoint. */
public final class RoutingCleanupCheck {
    public static void main(String[] args) throws Exception {
        String url = System.getenv("DB_URL");
        if (!"true".equals(System.getenv("WASSEL_E2E")) || url == null
                || !url.matches("jdbc:postgresql://(localhost|127\\.0\\.0\\.1):[0-9]+/wassel_e2e")) {
            throw new IllegalStateException("Cleanup check requires the isolated E2E PostgreSQL database");
        }
        try (var connection = DriverManager.getConnection(url, System.getenv("DB_USERNAME"), System.getenv("DB_PASSWORD"));
             var statement = connection.createStatement();
             var rows = statement.executeQuery("select count(*), count(route_id), count(stop_position) from students")) {
            rows.next();
            if (rows.getLong(1) != 3 || rows.getLong(2) != 0 || rows.getLong(3) != 0) {
                throw new IllegalStateException("Cleanup must release every student routeId and stopPosition");
            }
        }
    }
}
