package com.example.REMS.Entity;

import com.fasterxml.jackson.annotation.JsonBackReference;
import jakarta.persistence.*;
import lombok.*;

@Entity(name = "units")
@NoArgsConstructor
@AllArgsConstructor
@Getter
@Setter
@Builder
public class UnitEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private int floor;          // 층
    private String name;        // 호실명 (예: 101호)
    private String type;        // 호실 유형 (commercial/residential/office)
    private String status;      // 현황 (empty/occupied/expiring)
    private double area;        // 면적 (㎡)
    private String tenant;      // 임차인명
    private int deposit;        // 보증금 (만원)
    private int rent;           // 월세 (만원)
    private int manage;         // 관리비 (만원)
    private String contractStart;   // 계약 시작 (yyyy-MM-dd)
    private String contractEnd;     // 계약 만료 (yyyy-MM-dd)

    @Column(length = 1000)
    private String memo;        // 메모

    // 호실 : 건물 = N : 1
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "building_id")
    @JsonBackReference
    private BuildingEntity building;
}
