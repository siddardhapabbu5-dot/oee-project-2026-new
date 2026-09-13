package com.nakshatra.pms.domain;

import java.security.SecureRandom;

/** Lightweight cuid-like id for compatibility with Prisma @default(cuid()). */
public final class Cuid {
  private static final SecureRandom RANDOM = new SecureRandom();
  private static final char[] ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789".toCharArray();

  private Cuid() {}

  public static String generate() {
    StringBuilder sb = new StringBuilder(25);
    sb.append('c');
    long t = System.currentTimeMillis();
    sb.append(Long.toString(t, 36));
    for (int i = 0; i < 12; i++) {
      sb.append(ALPHABET[RANDOM.nextInt(ALPHABET.length)]);
    }
    return sb.toString();
  }
}
