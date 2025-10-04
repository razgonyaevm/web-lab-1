package com.example;

import com.fastcgi.FCGIInterface;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class FastCGIServer {

  public static void main(String[] args) {
    System.out.println("Starting FastCGI server...");

    FCGIInterface fcgiInterface = new FCGIInterface();
    while (fcgiInterface.FCGIaccept() >= 0) {
      String method = FCGIInterface.request.params.getProperty("REQUEST_METHOD");
      if (method == null) {
        System.out.println(errorResult("Unsupported HTTP method: null"));
        continue;
      }

      if (method.equals("GET")) {
        handleGetRequest();
        continue;
      }

      if (method.equals("POST")) {
        handlePostRequest();
        continue;
      }

      if (method.equals("DELETE")) {
        handleGetRequest();
        continue;
      }

      System.out.println(errorResult("Unsupported HTTP method: " + method));
    }
  }

  /** Обрабатывает GET запрос */
  private static void handleGetRequest() {
    String queryString = FCGIInterface.request.params.getProperty("QUERY_STRING");
    String scriptName = FCGIInterface.request.params.getProperty("SCRIPT_NAME");
    String requestMethod = FCGIInterface.request.params.getProperty("REQUEST_METHOD");

    // Проверяем, что это запрос к нашему скрипту
    if (scriptName == null || !scriptName.equals("/fcgi-bin/app.jar")) {
      System.out.println(errorResult("Not Found"));
      return;
    }

    // Парсим параметры из query string
    Map<String, String> params = parseQueryString(queryString);
    String action = params.get("action");

    // Получаем sessionId из cookies
    String sessionId = getSessionIdFromCookies();

    if ("DELETE".equals(requestMethod) && "clear".equals(action)) {
      if (sessionId != null && !sessionId.trim().isEmpty()) {
        boolean deleted = SessionManager.clearSession(sessionId.trim());
        if (deleted) {
          // При очистке сессии удаляем cookie
          String response =
              "Set-Cookie: sessionId=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT\r\n"
                  + "Content-Type: application/json; charset=UTF-8\r\n"
                  + "Content-Length: 46\r\n"
                  + "\r\n"
                  + "{\"status\": \"success\", \"message\": \"Session cleared\"}";
          System.out.println(response);
        } else {
          System.out.println(errorResult("Session not found"));
        }
      } else {
        System.out.println(errorResult("Missing sessionId parameter"));
      }
      return;
    }

    if (sessionId != null && !sessionId.trim().isEmpty()) {
      List<SessionManager.CalculationResult> allResults =
          SessionManager.getResults(sessionId.trim());
      String jsonResponse = buildJsonResponse(allResults);
      System.out.println(successJsonResult(jsonResponse));
    } else {
      // Если нет sessionId - возвращаем пустой результат
      System.out.println(successJsonResult("{\"results\": []}"));
    }
  }

  /** Обрабатывает POST запрос */
  private static void handlePostRequest() {
    String contentType = FCGIInterface.request.params.getProperty("CONTENT_TYPE");
    String scriptName = FCGIInterface.request.params.getProperty("SCRIPT_NAME");

    // Проверяем, что это запрос к нашему скрипту
    if (scriptName == null || !scriptName.equals("/fcgi-bin/app.jar")) {
      System.out.println(errorResult("Not Found"));
      return;
    }

    if (contentType == null) {
      System.out.println(errorResult("Content-Type is null"));
      return;
    }

    if (!contentType.equals("application/x-www-form-urlencoded")) {
      System.out.println(errorResult("Content-Type is not supported"));
      return;
    }

    Map<String, String> requestBody = parseFormUrlEncoded(readRequestBody());
    String xStr = requestBody.get("xVal");
    String yStr = requestBody.get("yVal");
    String rStr = requestBody.get("rVal");

    String sessionId = getSessionIdFromCookies();

    if (xStr == null || yStr == null || rStr == null) {
      System.out.println(errorResult("Missing required parameters"));
      return;
    }

    long startTime = System.nanoTime();

    // Парсинг и валидация координат
    double x, y, r;
    try {
      x = Double.parseDouble(xStr);
      y = Double.parseDouble(yStr);
      r = Double.parseDouble(rStr);
    } catch (NumberFormatException e) {
      System.out.println(errorResult("Invalid number format"));
      return;
    }

    // Валидация координат
    CoordinatesValidator validator = new CoordinatesValidator(x, y, r);
    if (!validator.checkData()) {
      System.out.println(errorResult("Invalid data, try again"));
      return;
    }

    // Проверяем попадание точки в область
    boolean isInArea = AreaChecker.isInArea(x, y, r);

    // Вычисляем время выполнения
    double executionTime = (System.nanoTime() - startTime) / 1_000_000.0;

    // Получаем текущее время
    String currentTime =
        LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));

    // Создаем результат
    SessionManager.CalculationResult result =
        new SessionManager.CalculationResult(x, y, r, isInArea, currentTime, executionTime);

    // Проверка наличия sessionId
    if (sessionId == null || sessionId.trim().isEmpty()) {
      sessionId = "sess_" + System.currentTimeMillis() + "_" +
              Integer.toHexString((int) (Math.random() * 1000000));
      System.err.println("Generated new sessionId: " + sessionId);
    }

    // Добавляем в сессию
    SessionManager.addResult(sessionId.trim(), result);

    // Получаем все результаты для этой сессии
    List<SessionManager.CalculationResult> allResults = SessionManager.getResults(sessionId.trim());

    // Строим и отправляем JSON ответ
    String jsonResponse = buildJsonResponse(allResults);
    System.out.println(successJsonResult(jsonResponse, sessionId));

    System.err.printf(
        "Processed request: x=%f, y=%f, r=%f, result=%b, time=%fms\n",
        x, y, r, isInArea, executionTime);
  }

  /** Читает тело запроса */
  private static String readRequestBody() {
    try {
      String contentLengthStr = FCGIInterface.request.params.getProperty("CONTENT_LENGTH");
      if (contentLengthStr == null) {
        return "";
      }

      int contentLength = Integer.parseInt(contentLengthStr);
      if (contentLength <= 0) {
        return "";
      }

      byte[] body = new byte[contentLength];
      int totalRead = 0;
      while (totalRead < contentLength) {
        int read = System.in.read(body, totalRead, contentLength - totalRead);
        if (read == -1) break;
        totalRead += read;
      }

      return new String(body, 0, totalRead, StandardCharsets.UTF_8);
    } catch (Exception e) {
      System.out.println("Error reading request body: " + e);
      return "";
    }
  }

  /** Парсит query string */
  private static Map<String, String> parseQueryString(String queryString) {
    Map<String, String> params = new HashMap<>();
    if (queryString == null || queryString.isEmpty()) {
      return params;
    }

    String[] pairs = queryString.split("&");
    for (String pair : pairs) {
      String[] keyValue = pair.split("=", 2);
      if (keyValue.length == 2) {
        try {
          String key = URLDecoder.decode(keyValue[0], StandardCharsets.UTF_8);
          String value = URLDecoder.decode(keyValue[1], StandardCharsets.UTF_8);
          params.put(key, value);
        } catch (Exception e) {
          System.out.println("Error parsing parameter: " + pair);
        }
      }
    }
    return params;
  }

  /** Парсит form-urlencoded данные */
  private static Map<String, String> parseFormUrlEncoded(String body) {
    return parseQueryString(body);
  }

  /** Создает успешный JSON ответ */
  private static String successJsonResult(String jsonBody, String sessionId) {
    String cookieHeader = "";
    if (sessionId != null && !sessionId.trim().isEmpty()) {
      cookieHeader =
          "Set-Cookie: sessionId=" + sessionId + "; Path=/; HttpOnly; SameSite=Strict\r\n";
    }

    return "Content-Type: application/json; charset=UTF-8\r\n"
        + cookieHeader
        + "Content-Length: "
        + jsonBody.getBytes(StandardCharsets.UTF_8).length
        + "\r\n"
        + "Access-Control-Allow-Origin: *\r\n"
        + "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
        + "Access-Control-Allow-Headers: Content-Type\r\n"
        + "\r\n"
        + jsonBody;
  }

  /** Перегруженная версия без sessionId */
  private static String successJsonResult(String jsonBody) {
    return successJsonResult(jsonBody, null);
  }

  /** Получает sessionId из cookies */
  private static String getSessionIdFromCookies() {
    String cookieHeader = FCGIInterface.request.params.getProperty("HTTP_COOKIE");
    if (cookieHeader == null) {
      return null;
    }

    String[] cookies = cookieHeader.split(";");
    for (String cookie : cookies) {
      String[] parts = cookie.trim().split("=", 2);
      if (parts.length == 2 && "sessionId".equals(parts[0].trim())) {
        return parts[1].trim();
      }
    }

    return null;
  }

  /** Создает ответ с ошибкой в JSON формате */
  private static String errorResult(String message) {
    String jsonBody = "{\"error\": \"" + message + "\"}";
    return "Status: 400 Bad Request\r\n"
        + "Content-Type: application/json; charset=UTF-8\r\n"
        + "Content-Length: "
        + jsonBody.getBytes(StandardCharsets.UTF_8).length
        + "\r\n"
        + "\r\n"
        + jsonBody;
  }

  /** Строит JSON ответ с результатами */
  private static String buildJsonResponse(
      java.util.List<SessionManager.CalculationResult> results) {
    StringBuilder json = new StringBuilder();
    json.append("{\"results\": [");

    for (int i = 0; i < results.size(); i++) {
      SessionManager.CalculationResult result = results.get(i);
      if (i > 0) json.append(",");

      json.append("{");
      json.append("\"x\": ").append(result.x()).append(",");
      json.append("\"y\": ").append(result.y()).append(",");
      json.append("\"r\": ").append(result.r()).append(",");
      json.append("\"isInArea\": ").append(result.isInArea()).append(",");
      json.append("\"currentTime\": \"").append(result.currentTime()).append("\",");
      json.append("\"executionTime\": ").append(result.executionTime());
      json.append("}");
    }

    json.append("]}");
    return json.toString();
  }
}
