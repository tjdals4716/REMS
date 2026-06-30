package com.example.REMS.Entity;

import com.fasterxml.jackson.annotation.JsonBackReference;
import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

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
    private String dealType;    // 거래유형 (sale=매매 / jeonse=전세 / monthly=월세)

    // 등록 일시 — 최초 저장 시 자동 기록(이후 수정에도 변경 안 됨)
    @CreationTimestamp
    @Column(updatable = false)
    private LocalDateTime createdAt;
    private String contractStart;   // 계약 시작 (yyyy-MM-dd)
    private String contractEnd;     // 계약 만료 (yyyy-MM-dd)

    @Column(length = 1000)
    private String memo;        // 메모

    // 작성자(소유자) — users 테이블과 N:1 외래키 (owner_id)
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_id")
    @JsonIgnore
    private UserEntity owner;

    // 호실 : 건물 = N : 1
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "building_id")
    @JsonBackReference
    private BuildingEntity building;
}
