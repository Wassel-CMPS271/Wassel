package com.wassel.backend.inbox.dto;

import tools.jackson.core.JsonParser;
import tools.jackson.core.JsonToken;
import tools.jackson.databind.DeserializationContext;
import tools.jackson.databind.ValueDeserializer;

/**
 * A boolean or an integer read exactly as JSON writes it. By default Jackson converts {@code "true"}, {@code 1},
 * {@code "10"} and {@code 10.5} into a boolean or an integer, so a client's mistake would be saved as a value nobody
 * chose. These refuse anything else (the usual 400 for a body that cannot be read), and are used on the fields of one
 * request only: turning the conversion off for the whole application would change every other endpoint.
 */
final class StrictScalar {

	private StrictScalar() {
	}

	/** Only {@code true} and {@code false}. */
	static final class Bool extends ValueDeserializer<Boolean> {

		@Override
		public Boolean deserialize(JsonParser parser, DeserializationContext context) {
			return switch (parser.currentToken()) {
				case VALUE_TRUE -> Boolean.TRUE;
				case VALUE_FALSE -> Boolean.FALSE;
				default -> (Boolean) context.handleUnexpectedToken(Boolean.class, parser);
			};
		}
	}

	/** Only a whole number written without a fraction or an exponent ({@code 10}, not {@code 10.0} or {@code "10"}). */
	static final class Int extends ValueDeserializer<Integer> {

		@Override
		public Integer deserialize(JsonParser parser, DeserializationContext context) {
			if (parser.currentToken() == JsonToken.VALUE_NUMBER_INT) {
				return parser.getIntValue();
			}
			return (Integer) context.handleUnexpectedToken(Integer.class, parser);
		}
	}
}
