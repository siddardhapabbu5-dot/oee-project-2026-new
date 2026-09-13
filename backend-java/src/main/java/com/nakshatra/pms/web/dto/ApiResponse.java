package com.nakshatra.pms.web.dto;

public record ApiResponse<T>(boolean success, T data, Object meta) {
  public static <T> ApiResponse<T> ok(T data) {
    return new ApiResponse<>(true, data, null);
  }

  public static <T> ApiResponse<T> ok(T data, Object meta) {
    return new ApiResponse<>(true, data, meta);
  }
}
