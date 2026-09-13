package com.nakshatra.pms.web;

import com.nakshatra.pms.security.UserPrincipal;
import com.nakshatra.pms.web.dto.ApiResponse;
import java.util.Map;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Demonstrates role matrix used across the OEE app.
 *
 * <ul>
 *   <li>ADMIN — full access
 *   <li>PRODUCTION_MANAGER — plant operations
 *   <li>LINE_SUPERVISOR — line / shop-floor entry
 * </ul>
 */
@RestController
@RequestMapping("/api/roles")
public class RoleDemoController {

  @GetMapping("/whoami")
  @PreAuthorize("isAuthenticated()")
  public ApiResponse<Map<String, Object>> whoami(@AuthenticationPrincipal UserPrincipal user) {
    return ApiResponse.ok(
        Map.of(
            "id", user.getId(),
            "email", user.getEmail(),
            "role", user.getRole().name(),
            "plantId", user.getPlantId() == null ? "" : user.getPlantId(),
            "authorities",
                user.getAuthorities().stream().map(a -> a.getAuthority()).toList()));
  }

  @GetMapping("/admin-only")
  @PreAuthorize("hasRole('ADMIN')")
  public ApiResponse<Map<String, String>> adminOnly() {
    return ApiResponse.ok(Map.of("message", "ADMIN access granted"));
  }

  @GetMapping("/manager-or-admin")
  @PreAuthorize("hasAnyRole('ADMIN','PRODUCTION_MANAGER')")
  public ApiResponse<Map<String, String>> managerOrAdmin() {
    return ApiResponse.ok(Map.of("message", "ADMIN or PRODUCTION_MANAGER access granted"));
  }

  @GetMapping("/supervisor-area")
  @PreAuthorize("hasAnyRole('ADMIN','PRODUCTION_MANAGER','LINE_SUPERVISOR')")
  public ApiResponse<Map<String, String>> supervisorArea() {
    return ApiResponse.ok(Map.of("message", "Shop-floor role access granted"));
  }
}
