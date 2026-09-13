package com.nakshatra.pms.web;

import com.nakshatra.pms.service.AuthService;
import com.nakshatra.pms.security.UserPrincipal;
import com.nakshatra.pms.web.dto.ApiResponse;
import com.nakshatra.pms.web.dto.AuthUserDto;
import com.nakshatra.pms.web.dto.CreateUserRequest;
import com.nakshatra.pms.web.dto.LoginRequest;
import com.nakshatra.pms.web.dto.LoginResponse;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class AuthController {
  private final AuthService authService;

  public AuthController(AuthService authService) {
    this.authService = authService;
  }

  @PostMapping("/auth/login")
  public ApiResponse<LoginResponse> login(@Valid @RequestBody LoginRequest request) {
    return ApiResponse.ok(authService.login(request));
  }

  @GetMapping("/auth/me")
  public ApiResponse<AuthUserDto> me(@AuthenticationPrincipal UserPrincipal principal) {
    return ApiResponse.ok(authService.me(principal));
  }

  @GetMapping("/users")
  @PreAuthorize("hasRole('ADMIN')")
  public ApiResponse<List<AuthUserDto>> listUsers() {
    return ApiResponse.ok(authService.listUsers());
  }

  @PostMapping("/users")
  @PreAuthorize("hasRole('ADMIN')")
  @ResponseStatus(HttpStatus.CREATED)
  public ApiResponse<AuthUserDto> createUser(@Valid @RequestBody CreateUserRequest request) {
    return ApiResponse.ok(authService.createUser(request));
  }
}
