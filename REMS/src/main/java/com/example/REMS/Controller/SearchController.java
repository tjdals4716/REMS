package com.example.REMS.Controller;

import com.example.REMS.DTO.PlaceDTO;
import com.example.REMS.Service.SearchService;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/search")
@RequiredArgsConstructor
@CrossOrigin(origins = "http://127.0.0.1:5500") // 프론트 서버 주소 (UserController 와 동일)
public class SearchController {

    private final SearchService searchService;

    // 상호명/장소 키워드 검색 (네이버 지역검색 프록시)
    // lat/lng(지도 중심)을 주면 그 위치에서 가까운 순으로 정렬해 반환한다.
    @Operation(summary = "장소 검색 (네이버 지역검색 프록시, 지도 중심 기준 가까운 순)")
    @GetMapping("/place")
    public ResponseEntity<List<PlaceDTO>> searchPlace(@RequestParam("query") String query,
                                                      @RequestParam(value = "lat", required = false) Double lat,
                                                      @RequestParam(value = "lng", required = false) Double lng,
                                                      @AuthenticationPrincipal UserDetails userDetails) {
        return ResponseEntity.ok(searchService.searchPlace(query, lat, lng));
    }
}
