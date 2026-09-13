package com.nakshatra.pms.repository;

import com.nakshatra.pms.domain.Plant;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PlantRepository extends JpaRepository<Plant, String> {
  List<Plant> findByDeletedAtIsNullAndActiveTrueOrderByNameAsc();
}
