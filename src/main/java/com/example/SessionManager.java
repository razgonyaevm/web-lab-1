package com.example;

import java.io.*;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/** Класс, реализующий управление и хранение сессий */
public class SessionManager {

  private static final Map<String, List<CalculationResult>> sessions = new ConcurrentHashMap<>();
  private static final String SESSIONS_DIR = "sessions";
  private static final String SESSION_FILE_EXT = ".session";

  static {
    try {
      Path sessionsPath = Paths.get(SESSIONS_DIR);
      if (!Files.exists(sessionsPath)) {
        Files.createDirectories(sessionsPath);
      }

//      loadAllSessions();
    } catch (IOException e) {
      System.err.println("Warning: Could not create sessions directory: " + e.getMessage());
    }
  }

  public record CalculationResult(
      double x, double y, double r, boolean isInArea, String currentTime, double executionTime) {}

  /** Получаем или создаем сессию */
  public static List<CalculationResult> getSession(String sessionId) {
    return sessions.computeIfAbsent(sessionId, k -> new ArrayList<>());
  }

  /** Добавляет новый результат вычисления в сессию */
  public static void addResult(String sessionId, CalculationResult result) {
    List<CalculationResult> session = getSession(sessionId);
    session.add(result);
    // Сохраняет в файл
    saveSession(sessionId, session);
  }

  /** Получает все результаты для сессии в обратном порядке (сначала самые новые) */
  public static List<CalculationResult> getResults(String sessionId) {
    List<CalculationResult> session = sessions.get(sessionId);

    // Если нет в памяти - загружаем из файла
    if (session == null) {
      session = loadSessionFromFile(sessionId);
      if (session != null) {
        sessions.put(sessionId, session);
      } else {
        // если нет файла - создаем пустую сессию
        session = new ArrayList<>();
        sessions.put(sessionId, session);
      }
    }

    List<CalculationResult> reversed = new ArrayList<>(session);
    Collections.reverse(reversed);
    return reversed;
  }

  /** Загружает сессию из файла по sessionId */
  private static List<CalculationResult> loadSessionFromFile(String sessionId) {
    try {
      Path sessionFile = Paths.get(SESSIONS_DIR, sessionId + SESSION_FILE_EXT);
      return loadSession(sessionFile);
    } catch (Exception e) {
      System.err.println("Warning: Could not load session " + sessionId + ": " + e.getMessage());
      return null;
    }
  }

  /** Загружает все сессии из файлов */
  private static void loadAllSessions() {
    try {
      Path sessionsPath = Paths.get(SESSIONS_DIR);
      if (!Files.exists(sessionsPath)) {
        return;
      }

      Files.list(sessionsPath)
          .filter(path -> path.toString().endsWith(SESSION_FILE_EXT))
          .forEach(SessionManager::loadSession);
    } catch (IOException e) {
      System.err.println("Warning: Could not load sessions: " + e.getMessage());
    }
  }

  /** Загружает сессию из файла по пути */
  private static List<CalculationResult> loadSession(Path sessionFile) {
    try {
      if (!Files.exists(sessionFile)) {
        return null;
      }

      List<CalculationResult> results = new ArrayList<>();

      try (BufferedReader reader = Files.newBufferedReader(sessionFile)) {
        String line;
        while ((line = reader.readLine()) != null) {
          if (!line.trim().isEmpty()) {
            CalculationResult result = parseResultFromLine(line);
            if (result != null) {
              results.add(result);
            }
          }
        }
      }

      return results;
    } catch (IOException e) {
      System.err.println(
          "Warning: Could not load session from " + sessionFile + ": " + e.getMessage());
      return null;
    }
  }

  /** Парсит строку в результат вычисления */
  private static CalculationResult parseResultFromLine(String line) {
    try {
      String[] parts = line.split("\\|");
      if (parts.length >= 6) {
        double x = Double.parseDouble(parts[0].replace(',', '.'));
        double y = Double.parseDouble(parts[1].replace(',', '.'));
        double r = Double.parseDouble(parts[2].replace(',', '.'));
        boolean isInArea = Boolean.parseBoolean(parts[3]);
        String currentTime = parts[4];
        double executionTime = Double.parseDouble(parts[5].replace(',', '.'));

        return new CalculationResult(x, y, r, isInArea, currentTime, executionTime);
      }
    } catch (Exception e) {
      System.err.println("Warning: Could not parse result line: " + line);
    }
    return null;
  }

  /** Сохраняет сессию в файл */
  private static void saveSession(String sessionId, List<CalculationResult> results) {
    try {
      Path sessionFile = Paths.get(SESSIONS_DIR, sessionId + SESSION_FILE_EXT);

      try (PrintWriter writer = new PrintWriter(Files.newBufferedWriter(sessionFile))) {
        for (CalculationResult result : results) {
          writer.println(
              String.format(
                  // В данной локали используется запятая как разделитель
                  Locale.US,
                  "%.6f|%.6f|%.6f|%s|%s|%.6f",
                  result.x(),
                  result.y(),
                  result.r(),
                  result.isInArea(),
                  result.currentTime(),
                  result.executionTime()));
        }
      }
    } catch (IOException e) {
      System.err.println("Warning: Could not save session " + sessionId + ": " + e.getMessage());
    }
  }

  public static boolean clearSession(String sessionId) {
    try {
      // Удаляем из памяти
      List<CalculationResult> removed = sessions.remove(sessionId);

      // Удаляем файл сессии
      Path sessionFile = Paths.get(SESSIONS_DIR, sessionId + SESSION_FILE_EXT);
      boolean fileDeleted = Files.deleteIfExists(sessionFile);

      return removed != null || fileDeleted;
    } catch (IOException e) {
      System.err.println(
          "Warning: Could not delete session file " + sessionId + ": " + e.getMessage());
      return false;
    }
  }
}
