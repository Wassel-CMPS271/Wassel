package com.wassel.backend.auth.dto;

import com.wassel.backend.users.entity.Role;

import java.util.UUID;

public record AuthUserResponse(UUID id, String email, Role role, UUID schoolId) {
}
