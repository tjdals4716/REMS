package com.example.REMS.Entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * 계약자·임차인 관리 (중개사 전용).
 *  · 건물/호실과는 독립된 간단한 관리 리스트: 전화번호·건물명·호실·보증금·월세·관리비·계약기간.
 *  · 작성자(owner)만 조회/수정/삭제.
 */
@Entity(name = "tenants")
@NoArgsConstructor
@AllArgsConstructor
@Getter
@Setter
@Builder
public class TenantEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String phone;           // 전화번호
    private String buildingName;    // 건물명
    private String unitName;        // 호실
    private int deposit;            // 보증금 (만원)
    private int rent;               // 월세 (만원)
    private int manage;             // 관리비 (만원)
    private String contractStart;   // 계약 시작 (yyyy-MM-dd)
    private String contractEnd;     // 계약 만료 (yyyy-MM-dd)

    // 작성자(소유자) — users 테이블과 N:1 외래키 (owner_id)
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_id")
    @JsonIgnore
    private UserEntity owner;

    // 등록 일시 — 최초 저장 시 자동 기록
    @CreationTimestamp
    @Column(updatable = false)
    private LocalDateTime createdAt;
}
