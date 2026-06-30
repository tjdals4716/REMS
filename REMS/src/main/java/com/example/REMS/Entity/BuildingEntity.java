package com.example.REMS.Entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonManagedReference;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;
import java.util.*;

@Entity(name = "buildings")
@NoArgsConstructor
@AllArgsConstructor
@Getter
@Setter
@Builder
public class BuildingEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String name;            // 건물명
    private String address;         // 주소
    private String detailAddress;   // 상세주소
    private String type;            // 건물 유형 (house/multiplex/officetel/commercial)
    private double lat;             // 위도
    private double lng;             // 경도

    // 금액 (만원 단위)
    private int deposit;            // 보증금
    private int rent;               // 월세
    private int manage;             // 관리비

    // 거래유형 (sale=매매 / jeonse=전세 / monthly=월세)
    //  - sale  : deposit = 매매가, rent = 0
    //  - jeonse: deposit = 전세금, rent = 0
    //  - monthly: deposit = 보증금, rent = 월세
    private String dealType;

    // 전세 대출 가능 여부 + 종류 (HUG/HF/SGI/버팀목/LH)
    private Boolean jeonseLoanAvailable;
    private String jeonseLoanType;

    // 옵션 — 주차 / 애완
    private Boolean parkingAvailable;
    private Boolean petAllowed;

    // 등록 일시 — 최초 저장 시 자동 기록(이후 수정에도 변경 안 됨)
    @CreationTimestamp
    @Column(updatable = false)
    private LocalDateTime createdAt;

    @Column(length = 1000)
    private String memo;            // 메모 (UI에서는 숨김, 데이터는 보존)

    // 이미지/미디어 URL 목록 (GCS 업로드 결과) — 여러 장 첨부 지원
    // building_media 테이블에 (building_id, sort_order, media_url) 로 저장됨
    @ElementCollection
    @CollectionTable(name = "building_media", joinColumns = @JoinColumn(name = "building_id"))
    @OrderColumn(name = "sort_order")
    @Column(name = "media_url", length = 1000)
    @Builder.Default
    private List<String> mediaURLs = new ArrayList<>();

    // 작성자(소유자) — users 테이블과 N:1 외래키 (owner_id)
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_id")
    @JsonIgnore
    private UserEntity owner;

    // 건물 : 호실 = 1 : N
    @Builder.Default
    @OneToMany(mappedBy = "building", cascade = CascadeType.ALL, orphanRemoval = true)
    @JsonManagedReference
    private List<UnitEntity> units = new ArrayList<>();

    // 휴지통(소프트 삭제) 시각 — null 이면 정상, 값이 있으면 휴지통 상태.
    // 이 시점부터 30일이 지나면 스케줄러가 영구 삭제한다.
    private LocalDateTime deletedAt;

    public void addUnit(UnitEntity unit) {
        units.add(unit);
        unit.setBuilding(this);
    }
}
