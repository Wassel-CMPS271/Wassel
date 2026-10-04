package com.wassel.backend.auth.dto;

import jakarta.validation.Constraint;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import jakarta.validation.Payload;

import java.lang.annotation.Documented;
import java.lang.annotation.Retention;
import java.lang.annotation.Target;
import java.nio.charset.StandardCharsets;

import static java.lang.annotation.ElementType.FIELD;
import static java.lang.annotation.ElementType.METHOD;
import static java.lang.annotation.ElementType.PARAMETER;
import static java.lang.annotation.ElementType.RECORD_COMPONENT;
import static java.lang.annotation.RetentionPolicy.RUNTIME;

/** Limits the UTF-8 size, not the character count: BCrypt rejects passwords over 72 bytes. */
@Documented
@Constraint(validatedBy = MaxBytes.Validator.class)
@Target({ FIELD, METHOD, RECORD_COMPONENT, PARAMETER })
@Retention(RUNTIME)
public @interface MaxBytes {

	String message();

	int value();

	Class<?>[] groups() default {};

	Class<? extends Payload>[] payload() default {};

	class Validator implements ConstraintValidator<MaxBytes, String> {

		private int max;

		@Override
		public void initialize(MaxBytes annotation) {
			max = annotation.value();
		}

		@Override
		public boolean isValid(String value, ConstraintValidatorContext context) {
			return value == null || value.getBytes(StandardCharsets.UTF_8).length <= max;
		}
	}
}
