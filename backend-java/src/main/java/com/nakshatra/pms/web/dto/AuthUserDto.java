package com.nakshatra.pms.web.dto;

import com.nakshatra.pms.domain.Role;
import java.time.Instant;

public record AuthUserDto(
    String id,
    String email,
    Role role,
    String plantId,
    String firstName,
    String lastName,
    String employeeId,
    String phone,
    Instant lastLoginAt) {}
