# Builds the runnable backend jar the same way CI does (mvn, not the wrapper),
# then runs it on a slim JRE. Used by ../docker-compose.staging.yml and by the hosted backend on Railway
# (see "Hosted backend (Railway)" in the README), so a change here reaches both.
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn -B -q dependency:go-offline
COPY src ./src
RUN mvn -B -q clean package -DskipTests

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
