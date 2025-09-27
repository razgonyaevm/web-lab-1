package com.example;

/** Класс для проверки попадания в область */
public class AreaChecker {
  public static boolean isInArea(double x, double y, double r) {
    // Четверть круга в первой четверти
    if (x >= 0 && y >= 0 && (x * x + y * y) <= (r / 2.0) * (r / 2.0)) {
      return true;
    }

    // Квадрат во второй четверти
    if (x <= 0 && y >= 0 && x >= -r && y <= r) {
      return true;
    }

    // Треугольник в третьей четверти
    return x <= 0 && y <= 0 && y >= -x - r;
  }
}
