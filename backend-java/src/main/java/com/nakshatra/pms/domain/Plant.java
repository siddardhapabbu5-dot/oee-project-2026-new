package com.nakshatra.pms.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "plants")
@Getter
@Setter
public class Plant {

  @Id
  @Column(length = 30)
  private String id;

  @Column(nullable = false, unique = true)
  private String code;

  @Column(nullable = false)
  private String name;

  private String location;

  @Column(nullable = false)
  private String timezone = "Asia/Kolkata";

  @Column(name = "isActive", nullable = false)
  private boolean active = true;

  @Column(name = "createdAt", nullable = false)
  private Instant createdAt;

  @Column(name = "updatedAt", nullable = false)
  private Instant updatedAt;

  @Column(name = "deletedAt")
  private Instant deletedAt;

  @PrePersist
  void onCreate() {
    Instant now = Instant.now();
    if (id == null || id.isBlank()) {
      id = Cuid.generate();
    }
    createdAt = now;
    updatedAt = now;
  }

  @PreUpdate
  void onUpdate() {
    updatedAt = Instant.now();
  }
}
