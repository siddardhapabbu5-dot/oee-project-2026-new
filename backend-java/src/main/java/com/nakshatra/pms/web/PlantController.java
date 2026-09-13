package com.nakshatra.pms.web;

import com.nakshatra.pms.service.PlantService;
import com.nakshatra.pms.web.dto.ApiResponse;
import java.util.List;
import java.util.Map;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class PlantController {
  private final PlantService plantService;

  public PlantController(PlantService plantService) {
    this.plantService = plantService;
  }

  /** Any authenticated role can list plants (matches Node API). */
  @GetMapping("/plants")
  @PreAuthorize("hasAnyRole('ADMIN','PRODUCTION_MANAGER','LINE_SUPERVISOR')")
  public ApiResponse<List<Map<String, Object>>> list() {
    return ApiResponse.ok(plantService.listActive());
  }
}
