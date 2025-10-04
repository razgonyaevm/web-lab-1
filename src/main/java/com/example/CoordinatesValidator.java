package com.example;

import lombok.AllArgsConstructor;

/** Класс для валидации координат */
@AllArgsConstructor
public class CoordinatesValidator {
  private final double x;
  private final double y;
  private final double r;

  private static final double Y_MIN = -5.0;
  private static final double Y_MAX = 5.0;

  private static final double[] VALID_X_VALUES = {-3.0, -2.0, -1.0, 0.0, 1.0, 2.0, 3.0, 4.0};

  private static final double[] VALID_R_VALUES = {1.0, 2.0, 3.0, 4.0, 5.0};

  public boolean checkData() {
    return checkX() && checkY() && checkR();
  }

  private boolean checkX() {
    for (double validX : VALID_X_VALUES) {
      if (Math.abs(x - validX) < 1e-9) {
        return true;
      }
    }
    return false;
  }

  private boolean checkY() {
    return !Double.isNaN(y) && !Double.isInfinite(y) && (y >= Y_MIN && y <= Y_MAX);
  }

  private boolean checkR() {
    for (double validR : VALID_R_VALUES) {
      if (Math.abs(r - validR) < 1e-9) {
        return true;
      }
    }
    return false;
  }
}
