package com.nakshatra.pms.security;

import com.nakshatra.pms.config.AppProperties;
import com.nakshatra.pms.domain.Role;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import javax.crypto.SecretKey;
import org.springframework.stereotype.Service;

@Service
public class JwtService {
  private final AppProperties props;
  private final SecretKey key;

  public JwtService(AppProperties props) {
    this.props = props;
    byte[] bytes = props.jwt().secret().getBytes(StandardCharsets.UTF_8);
    if (bytes.length < 32) {
      throw new IllegalStateException("app.jwt.secret must be at least 32 characters");
    }
    this.key = Keys.hmacShaKeyFor(bytes);
  }

  public String createToken(String userId, String email, Role role, String plantId) {
    long now = System.currentTimeMillis();
    return Jwts.builder()
        .subject(userId)
        .claim("email", email)
        .claim("role", role.name())
        .claim("plantId", plantId)
        .issuedAt(new Date(now))
        .expiration(new Date(now + props.jwt().expirationMs()))
        .signWith(key)
        .compact();
  }

  public Claims parse(String token) {
    return Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload();
  }
}
