package com.nakshatra.pms.web.error;

import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {

  @ExceptionHandler(ApiException.class)
  public ResponseEntity<Map<String, Object>> handleApi(ApiException ex) {
    return ResponseEntity.status(ex.getStatus())
        .body(
            Map.of(
                "success",
                false,
                "error",
                Map.of("message", ex.getMessage(), "status", ex.getStatus().value())));
  }

  @ExceptionHandler(MethodArgumentNotValidException.class)
  public ResponseEntity<Map<String, Object>> handleValidation(MethodArgumentNotValidException ex) {
    String message =
        ex.getBindingResult().getFieldErrors().stream()
            .findFirst()
            .map(FieldError::getDefaultMessage)
            .orElse("Validation failed");
    return ResponseEntity.badRequest()
        .body(Map.of("success", false, "error", Map.of("message", message, "status", 400)));
  }

  @ExceptionHandler({BadCredentialsException.class})
  public ResponseEntity<Map<String, Object>> handleBadCreds(Exception ex) {
    return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
        .body(
            Map.of(
                "success",
                false,
                "error",
                Map.of("message", "Invalid credentials", "status", 401)));
  }

  @ExceptionHandler(AccessDeniedException.class)
  public ResponseEntity<Map<String, Object>> handleDenied(AccessDeniedException ex) {
    return ResponseEntity.status(HttpStatus.FORBIDDEN)
        .body(
            Map.of(
                "success", false, "error", Map.of("message", "Forbidden", "status", 403)));
  }

  @ExceptionHandler(Exception.class)
  public ResponseEntity<Map<String, Object>> handleOther(Exception ex) {
    return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
        .body(
            Map.of(
                "success",
                false,
                "error",
                Map.of(
                    "message",
                    ex.getMessage() == null ? "Server error" : ex.getMessage(),
                    "status",
                    500)));
  }
}
