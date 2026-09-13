package com.nakshatra.pms.repository;

import com.nakshatra.pms.domain.User;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserRepository extends JpaRepository<User, String> {
  Optional<User> findByEmailIgnoreCaseAndDeletedAtIsNull(String email);

  Optional<User> findByIdAndDeletedAtIsNull(String id);

  List<User> findByDeletedAtIsNullOrderByCreatedAtDesc();

  @Modifying
  @Query("update User u set u.lastLoginAt = :at, u.updatedAt = :at where u.id = :id")
  int touchLastLogin(@Param("id") String id, @Param("at") Instant at);
}
