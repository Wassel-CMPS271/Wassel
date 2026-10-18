package com.wassel.backend.routes.entity;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Stores an ordered list of ids as one comma-joined {@code text} column. Plain text rather than a
 * join table or {@code uuid[]} so the schema Hibernate builds for the tests (H2) and the Flyway one
 * (PostgreSQL) cannot differ.
 */
@Converter
public class UuidListConverter implements AttributeConverter<List<UUID>, String> {

	@Override
	public String convertToDatabaseColumn(List<UUID> ids) {
		return ids.stream().map(UUID::toString).collect(Collectors.joining(","));
	}

	@Override
	public List<UUID> convertToEntityAttribute(String joined) {
		return joined.isEmpty() ? List.of() : Arrays.stream(joined.split(",")).map(UUID::fromString).toList();
	}
}
