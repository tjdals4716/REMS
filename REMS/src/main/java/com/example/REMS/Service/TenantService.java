package com.example.REMS.Service;

import com.example.REMS.DTO.TenantDTO;
import com.example.REMS.Entity.TenantEntity;
import com.example.REMS.Entity.UserEntity;
import com.example.REMS.Entity.UserPermissionEntity;
import com.example.REMS.Repository.TenantRepository;
import com.example.REMS.Repository.UserPermissionRepository;
import com.example.REMS.Repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class TenantService {

    private static final Logger logger = LoggerFactory.getLogger(TenantService.class);
    private static final String ADMIN_UID = "3635939452";

    private final TenantRepository tenantRepository;
    private final UserRepository userRepository;
    private final UserPermissionRepository userPermissionRepository;

    // 토큰 검증 후 사용자 반환
    private UserEntity getAuthorizedUser(String uid, UserDetails userDetails) {
        if (userDetails == null || !userDetails.getUsername().equals(uid)) {
            throw new RuntimeException("권한이 없습니다");
        }
        return userRepository.findByUid(uid)
                .orElseThrow(() -> new IllegalArgumentException("사용자를 찾을 수 없습니다"));
    }

    private boolean isBroker(UserEntity user) {
        return ADMIN_UID.equals(user.getUid())
                || (user.getAgencyName() != null && !user.getAgencyName().trim().isEmpty());
    }

    // 계약자 관리(중개사 전용) 접근 권한
    private void requireBroker(UserEntity user) {
        if (!isBroker(user)) {
            throw new RuntimeException("중개사 회원만 이용할 수 있는 기능입니다");
        }
    }

    // 생성/수정/삭제 권한 (관리자 통과, 그 외 저장된 플래그)
    private void requirePermission(String uid, String action) {
        if (ADMIN_UID.equals(uid)) return;
        UserPermissionEntity perm = userPermissionRepository.findByUser_Uid(uid).orElse(null);
        boolean allowed;
        if (perm == null) {
            allowed = false;
        } else if ("CREATE".equals(action)) {
            allowed = Boolean.TRUE.equals(perm.getCanCreate());
        } else if ("UPDATE".equals(action)) {
            allowed = Boolean.TRUE.equals(perm.getCanUpdate());
        } else if ("DELETE".equals(action)) {
            allowed = Boolean.TRUE.equals(perm.getCanDelete());
        } else {
            allowed = false;
        }
        if (!allowed) throw new RuntimeException("해당 작업 권한이 없습니다 (" + action + ")");
    }

    // 계약자 등록 (본인 소유)
    @Transactional
    public TenantDTO createTenant(String uid, TenantDTO dto, UserDetails userDetails) {
        UserEntity owner = getAuthorizedUser(uid, userDetails);
        requireBroker(owner);
        requirePermission(uid, "CREATE");
        TenantEntity saved = tenantRepository.save(dto.dtoToEntity(owner));
        logger.info("계약자 등록 완료! 작성자: {}, id={}", uid, saved.getId());
        return TenantDTO.entityToDto(saved);
    }

    // 내 계약자 목록
    @Transactional(readOnly = true)
    public List<TenantDTO> getMyTenants(String uid, UserDetails userDetails) {
        UserEntity owner = getAuthorizedUser(uid, userDetails);
        requireBroker(owner);
        return tenantRepository.findByOwner_UidOrderByIdDesc(uid).stream()
                .map(TenantDTO::entityToDto)
                .collect(Collectors.toList());
    }

    // 계약자 수정 (본인 것만)
    @Transactional
    public TenantDTO updateTenant(String uid, Long id, TenantDTO dto, UserDetails userDetails) {
        UserEntity owner = getAuthorizedUser(uid, userDetails);
        requireBroker(owner);
        requirePermission(uid, "UPDATE");
        TenantEntity e = tenantRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("계약자를 찾을 수 없습니다"));
        if (e.getOwner() == null || !e.getOwner().getUid().equals(uid)) {
            throw new RuntimeException("본인이 등록한 계약자만 수정할 수 있습니다");
        }
        e.setPhone(dto.getPhone());
        e.setBuildingName(dto.getBuildingName());
        e.setUnitName(dto.getUnitName());
        e.setDeposit(dto.getDeposit());
        e.setRent(dto.getRent());
        e.setManage(dto.getManage());
        e.setContractStart(dto.getContractStart());
        e.setContractEnd(dto.getContractEnd());
        logger.info("계약자 수정 완료! 작성자: {}, id={}", uid, id);
        return TenantDTO.entityToDto(e);
    }

    // 계약자 삭제 (본인 것만)
    @Transactional
    public TenantDTO deleteTenant(String uid, Long id, UserDetails userDetails) {
        UserEntity owner = getAuthorizedUser(uid, userDetails);
        requireBroker(owner);
        requirePermission(uid, "DELETE");
        TenantEntity e = tenantRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("계약자를 찾을 수 없습니다"));
        if (e.getOwner() == null || !e.getOwner().getUid().equals(uid)) {
            throw new RuntimeException("본인이 등록한 계약자만 삭제할 수 있습니다");
        }
        TenantDTO deleted = TenantDTO.entityToDto(e);
        tenantRepository.delete(e);
        logger.info("계약자 삭제 완료! 작성자: {}, id={}", uid, id);
        return deleted;
    }
}
