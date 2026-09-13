package com.nakshatra.pms.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "users")
@Getter
@Setter
public class User {

  @Id
  @Column(length = 30)
  private String id;

  @Column(name = "employeeId", nullable = false, unique = true)
  private String employeeId;

  @Column(nullable = false, unique = true)
  private String email;

  @Column(name = "passwordHash", nullable = false)
  private String passwordHash;

  @Column(name = "firstName", nullable = false)
  private String firstName;

  @Column(name = "lastName", nullable = false)
  private String lastName;

  private String phone;

  @Enumerated(EnumType.STRING)
  @JdbcTypeCode(SqlTypes.NAMED_ENUM)
  @Column(nullable = false, columnDefinition = "\"Role\"")
  private Role role = Role.LINE_SUPERVISOR;

  @Column(name = "plantId")
  private String plantId;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "plantId", insertable = false, updatable = false)
  private Plant plant;

  @Column(name = "isActive", nullable = false)
  private boolean active = true;

  @Column(name = "lastLoginAt")
  private Instant lastLoginAt;

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
