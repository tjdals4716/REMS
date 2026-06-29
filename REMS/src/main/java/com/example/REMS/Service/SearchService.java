package com.example.REMS.Service;

import com.example.REMS.Config.OAuthProperties.NaverOAuthProperties;
import com.example.REMS.DTO.PlaceDTO;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * 네이버 지역검색(Local Search) API 프록시.
 * - 브라우저에서 직접 호출 불가(시크릿 키/CORS) → 서버에서 대신 호출한다.
 * - 자격증명: 기존 네이버 로그인 설정(NaverOAuthProperties = ${NAVER_ID}/${NAVER_SECRET_ID})을
 *   '읽기 전용'으로 재사용한다. NaverOAuthProperties 파일은 수정하지 않는다.
 * - 전제: 해당 네이버 애플리케이션에 "검색" API가 추가되어 있어야 한다. (로그인만 켜져 있으면 401/403)
 * - 주의: 지역검색은 한 번에 최대 5건(display<=5)까지만 반환된다(네이버 API 제한).
 */
@Service
@RequiredArgsConstructor
public class SearchService {

    // 기존 네이버 로그인 자격증명 빈을 그대로 주입해 재사용 (수정하지 않음)
    private final NaverOAuthProperties naverProps;

    private final HttpClient httpClient = HttpClient.newHttpClient();
    private final ObjectMapper mapper = new ObjectMapper();

    public List<PlaceDTO> searchPlace(String query) {
        return searchPlace(query, null, null);
    }

    // lat/lng(지도 중심)이 주어지면 그 위치에서 가까운 순으로 정렬한다.
    public List<PlaceDTO> searchPlace(String query, Double centerLat, Double centerLng) {
        if (query == null || query.trim().isEmpty()) return Collections.emptyList();

        String clientId = naverProps.getClientId();
        String clientSecret = naverProps.getClientSecret();
        if (clientId == null || clientId.isBlank() || clientSecret == null || clientSecret.isBlank()) {
            throw new IllegalStateException("네이버 자격증명이 없습니다. (NAVER_ID/NAVER_SECRET_ID 확인)");
        }

        try {
            String url = "https://openapi.naver.com/v1/search/local.json?display=5&sort=random&query="
                    + URLEncoder.encode(query, StandardCharsets.UTF_8);
            HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                    .header("X-Naver-Client-Id", clientId)
                    .header("X-Naver-Client-Secret", clientSecret)
                    .GET().build();

            HttpResponse<String> res = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() != 200) {
                // 401/403 이면 보통 그 네이버 앱에 "검색" API가 추가되지 않은 경우
                throw new RuntimeException("네이버 검색 실패: HTTP " + res.statusCode()
                        + " (네이버 앱에 '검색' API가 추가됐는지 확인)");
            }

            JsonNode items = mapper.readTree(res.body()).path("items");
            List<PlaceDTO> result = new ArrayList<>();
            if (items.isArray()) {
                for (JsonNode it : items) {
                    String name = stripTags(it.path("title").asText(""));
                    String category = it.path("category").asText("");
                    String road = it.path("roadAddress").asText("");
                    String jibun = it.path("address").asText("");

                    // mapx/mapy 는 WGS84 좌표 * 1e7 (참고/폴백용 — 프런트는 도로명 주소로 재지오코딩)
                    Double lat = null, lng = null;
                    try {
                        String mapx = it.path("mapx").asText("");
                        String mapy = it.path("mapy").asText("");
                        if (!mapx.isEmpty() && !mapy.isEmpty()) {
                            lng = Double.parseDouble(mapx) / 1e7;
                            lat = Double.parseDouble(mapy) / 1e7;
                        }
                    } catch (NumberFormatException ignore) { }

                    result.add(PlaceDTO.builder()
                            .name(name)
                            .category(category)
                            .roadAddress(road)
                            .jibunAddress(jibun)
                            .lat(lat)
                            .lng(lng)
                            .build());
                }
            }
            // 지도 중심 좌표가 있으면 가까운 순으로 정렬 (좌표 없는 항목은 뒤로)
            if (centerLat != null && centerLng != null) {
                result.sort((a, b) -> Double.compare(
                        distanceKm(centerLat, centerLng, a.getLat(), a.getLng()),
                        distanceKm(centerLat, centerLng, b.getLat(), b.getLng())));
            }
            return result;
        } catch (RuntimeException re) {
            throw re;
        } catch (Exception e) {
            throw new RuntimeException("장소 검색 중 오류: " + e.getMessage(), e);
        }
    }

    // 두 좌표 사이 거리(km). 좌표가 없으면 매우 큰 값(뒤로 정렬)
    private double distanceKm(double lat1, double lng1, Double lat2, Double lng2) {
        if (lat2 == null || lng2 == null) return Double.MAX_VALUE;
        double R = 6371.0;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLng = Math.toRadians(lng2 - lng1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    // 네이버 응답의 title 은 <b> 태그/HTML 엔티티가 섞여 있어 제거
    private String stripTags(String s) {
        if (s == null) return "";
        return s.replaceAll("<[^>]*>", "")
                .replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
                .replace("&quot;", "\"").replace("&#39;", "'")
                .trim();
    }
}
