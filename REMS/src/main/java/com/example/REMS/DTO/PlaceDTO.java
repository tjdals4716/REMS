package com.example.REMS.DTO;

import lombok.*;

@NoArgsConstructor
@AllArgsConstructor
@Getter
@Setter
@Builder
public class PlaceDTO {
    private String name;         // 상호명 (HTML 태그 제거됨)
    private String category;     // 분류 (예: 음식점>한식)
    private String roadAddress;  // 도로명 주소
    private String jibunAddress; // 지번 주소
    private Double lat;          // WGS84 위도 (참고/폴백용)
    private Double lng;          // WGS84 경도 (참고/폴백용)
}
