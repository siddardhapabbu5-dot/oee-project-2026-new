package com.nakshatra.pms.service;

import com.nakshatra.pms.domain.User;
import com.nakshatra.pms.repository.UserRepository;
import com.nakshatra.pms.security.JwtService;
import com.nakshatra.pms.security.UserPrincipal;
import com.nakshatra.pms.web.dto.AuthUserDto;
import com.nakshatra.pms.web.dto.CreateUserRequest;
import com.nakshatra.pms.web.dto.LoginRequest;
import com.nakshatra.pms.web.dto.LoginResponse;
import com.nakshatra.pms.web.error.ApiException;
import java.time.Instant;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {
  private final UserRepository users;
  private final PasswordEncoder passwordEncoder;
  private final JwtService jwtService;

  public AuthService(UserRepository users, PasswordEncoder passwordEncoder, JwtService jwtService) {
    this.users = users;
    this.passwordEncoder = passwordEncoder;
    this.jwtService = jwtService;
  }

  @Transactional
  public LoginResponse login(LoginRequest request) {
    User user =
        users
            .findByEmailIgnoreCaseAndDeletedAtIsNull(request.email().trim().toLowerCase())
            .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "Invalid credentials"));

    if (!user.isActive()) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, "Invalid credentials");
    }
    if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, "Invalid credentials");
    }

    user.setLastLoginAt(Instant.now());
    users.touchLastLogin(user.getId(), Instant.now());

    String token =
        jwtService.createToken(user.getId(), user.getEmail(), user.getRole(), user.getPlantId());
    return new LoginResponse(token, toDto(user));
  }

  @Transactional(readOnly = true)
  public AuthUserDto me(UserPrincipal principal) {
    User user =
        users
            .findByIdAndDeletedAtIsNull(principal.getId())
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "User not found"));
    return toDto(user);
  }

  @Transactional(readOnly = true)
  public List<AuthUserDto> listUsers() {
    return users.findByDeletedAtIsNullOrderByCreatedAtDesc().stream().map(this::toDto).toList();
  }

  @Transactional
  public AuthUserDto createUser(CreateUserRequest req) {
    String email = req.email().trim().toLowerCase();
    if (users.findByEmailIgnoreCaseAndDeletedAtIsNull(email).isPresent()) {
      throw new ApiException(HttpStatus.CONFLICT, "Email already exists");
    }
    User user = new User();
    user.setEmployeeId(req.employeeId().trim());
    user.setEmail(email);
    user.setPasswordHash(passwordEncoder.encode(req.password()));
    user.setFirstName(req.firstName().trim());
    user.setLastName(req.lastName().trim());
    user.setPhone(req.phone());
    user.setRole(req.role());
    user.setPlantId(req.plantId());
    user.setActive(true);
    return toDto(users.save(user));
  }

  private AuthUserDto toDto(User user) {
    return new AuthUserDto(
        user.getId(),
        user.getEmail(),
        user.getRole(),
        user.getPlantId(),
        user.getFirstName(),
        user.getLastName(),
        user.getEmployeeId(),
        user.getPhone(),
        user.getLastLoginAt());
  }
}
