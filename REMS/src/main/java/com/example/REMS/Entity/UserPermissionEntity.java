package com.example.REMS.Entity;

import jakarta.persistence.*;
import lombok.*;

/**
 * 사용자별 권한 (모든 오브젝트: 건물/호실 등에 대한 생성·조회·수정·삭제 허용 여부).
 *  · users 테이블과 1:1 외래키(user_id) 로 연결.
 *  · 관리자(uid=3635939452)는 이 값과 무관하게 항상 전체 허용 (서비스에서 처리).
 */
@Entity(name = "user_permissions")
@NoArgsConstructor
@AllArgsConstructor
@Getter
@Setter
@Builder
public class UserPermissionEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // users 테이블과 1:1 외래키
    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", unique = true)
    private UserEntity user;

    private Boolean canCreate;   // 생성 권한
    private Boolean canRead;     // 조회 권한
    private Boolean canUpdate;   // 수정 권한
    private Boolean canDelete;   // 삭제 권한
}
