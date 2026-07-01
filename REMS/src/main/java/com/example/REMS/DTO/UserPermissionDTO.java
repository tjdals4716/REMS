package com.example.REMS.DTO;

import lombok.*;

/**
 * 권한 관리 화면용 DTO.
 *  · 관리자 목록 응답: 각 유저 + 4개 권한 + admin 여부
 *  · 로그인 유저 자기 권한 응답(프론트 게이팅용)
 */
@NoArgsConstructor
@AllArgsConstructor
@Getter
@Setter
@Builder
public class UserPermissionDTO {
    private Long userId;
    private String uid;
    private String name;
    private String nickname;
    private String profileURL;
    private boolean admin;       // 관리자 여부(uid 고정)
    private boolean canCreate;
    private boolean canRead;
    private boolean canUpdate;
    private boolean canDelete;
}
