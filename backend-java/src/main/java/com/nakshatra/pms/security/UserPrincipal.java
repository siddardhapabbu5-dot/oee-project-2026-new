package com.nakshatra.pms.security;

import com.nakshatra.pms.domain.Role;
import com.nakshatra.pms.domain.User;
import java.util.Collection;
import java.util.List;
import lombok.Getter;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

@Getter
public class UserPrincipal implements UserDetails {
  private final String id;
  private final String email;
  private final String passwordHash;
  private final Role role;
  private final String plantId;
  private final String firstName;
  private final String lastName;
  private final String employeeId;
  private final boolean active;

  public UserPrincipal(User user) {
    this.id = user.getId();
    this.email = user.getEmail();
    this.passwordHash = user.getPasswordHash();
    this.role = user.getRole();
    this.plantId = user.getPlantId();
    this.firstName = user.getFirstName();
    this.lastName = user.getLastName();
    this.employeeId = user.getEmployeeId();
    this.active = user.isActive() && user.getDeletedAt() == null;
  }

  @Override
  public Collection<? extends GrantedAuthority> getAuthorities() {
    return List.of(new SimpleGrantedAuthority("ROLE_" + role.name()));
  }

  @Override
  public String getPassword() {
    return passwordHash;
  }

  @Override
  public String getUsername() {
    return email;
  }

  @Override
  public boolean isAccountNonExpired() {
    return true;
  }

  @Override
  public boolean isAccountNonLocked() {
    return active;
  }

  @Override
  public boolean isCredentialsNonExpired() {
    return true;
  }

  @Override
  public boolean isEnabled() {
    return active;
  }
}
