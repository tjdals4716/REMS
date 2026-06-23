package com.example.REMS.Entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonManagedReference;
import jakarta.persistence.*;
import lombok.*;

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

    @Column(length = 1000)
    private String memo;            // 메모 (UI에서는 숨김, 데이터는 보존)

    private String mediaURL;        // 대표 이미지/미디어 URL (GCS 업로드 결과)

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

    public void addUnit(UnitEntity unit) {
        units.add(unit);
        unit.setBuilding(this);
    }
}