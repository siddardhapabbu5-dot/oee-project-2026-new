package com.nakshatra.pms.service;

import com.nakshatra.pms.domain.Plant;
import com.nakshatra.pms.repository.PlantRepository;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PlantService {
  private final PlantRepository plants;

  public PlantService(PlantRepository plants) {
    this.plants = plants;
  }

  @Transactional(readOnly = true)
  public List<Map<String, Object>> listActive() {
    return plants.findByDeletedAtIsNullAndActiveTrueOrderByNameAsc().stream()
        .map(this::toMap)
        .toList();
  }

  private Map<String, Object> toMap(Plant p) {
    return Map.of(
        "id", p.getId(),
        "code", p.getCode(),
        "name", p.getName(),
        "location", p.getLocation() == null ? "" : p.getLocation(),
        "timezone", p.getTimezone(),
        "isActive", p.isActive());
  }
}
