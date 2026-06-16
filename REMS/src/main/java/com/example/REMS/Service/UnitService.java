package com.example.REMS.Service;

import com.example.REMS.DTO.UnitDTO;
import com.example.REMS.Entity.BuildingEntity;
import com.example.REMS.Entity.UnitEntity;
import com.example.REMS.Repository.BuildingRepository;
import com.example.REMS.Repository.UnitRepository;
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
public class UnitService {

    private static final Logger logger = LoggerFactory.getLogger(UnitService.class);
    private final UnitRepository unitRepository;
    private final BuildingRepository buildingRepository;

    // 토큰 검증: 토큰의 사용자 == 요청 uid
    private void checkAuth(String uid, UserDetails userDetails) {
        if (userDetails == null || !userDetails.getUsername().equals(uid)) {
            throw new RuntimeException("권한이 없습니다");
        }
    }

    // 호실이 속한 건물의 소유자가 요청자(uid)인지 확인 (호실 권한 = 건물 소유권)
    private void checkOwner(BuildingEntity building, String uid) {
        if (building == null || building.getOwner() == null
                || !building.getOwner().getUid().equals(uid)) {
            throw new RuntimeException("해당 건물에 대한 권한이 없습니다");
        }
    }

    // 특정 건물에 호실 추가 (그 건물이 내 건물일 때만)
    @Transactional
    public UnitDTO createUnit(String uid, Long buildingId, UnitDTO unitDTO, UserDetails userDetails) {
        checkAuth(uid, userDetails);
        BuildingEntity building = buildingRepository.findById(buildingId)
                .orElseThrow(() -> new IllegalArgumentException("건물을 찾을 수 없습니다"));
        checkOwner(building, uid);

        UnitEntity unitEntity = unitDTO.dtoToEntity();
        building.addUnit(unitEntity);           // 양방향 연관관계 설정
        UnitEntity savedUnit = unitRepository.save(unitEntity);
        logger.info("{}번 건물에 호실 추가 완료! 요청자: {}, unitId={}", buildingId, uid, savedUnit.getId());
        return UnitDTO.entityToDto(savedUnit);
    }

    // 특정 건물의 호실 전체 조회 (내 건물일 때만)
    @Transactional(readOnly = true)
    public List<UnitDTO> getUnitsByBuilding(String uid, Long buildingId, UserDetails userDetails) {
        checkAuth(uid, userDetails);
        BuildingEntity building = buildingRepository.findById(buildingId)
                .orElseThrow(() -> new IllegalArgumentException("건물을 찾을 수 없습니다"));
        checkOwner(building, uid);
        List<UnitDTO> units = unitRepository.findByBuildingId(buildingId).stream()
                .map(UnitDTO::entityToDto)
                .collect(Collectors.toList());
        logger.info("{}번 건물 호실 {}개 조회 완료! 요청자: {}", buildingId, units.size(), uid);
        return units;
    }

    // id로 호실 단건 조회 (내 건물의 호실일 때만)
    @Transactional(readOnly = true)
    public UnitDTO findById(String uid, Long id, UserDetails userDetails) {
        checkAuth(uid, userDetails);
        UnitEntity unitEntity = unitRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("호실을 찾을 수 없습니다"));
        checkOwner(unitEntity.getBuilding(), uid);
        logger.info("{}번 호실 조회 완료! 요청자: {}", id, uid);
        return UnitDTO.entityToDto(unitEntity);
    }

    // 호실 수정 (내 건물의 호실일 때만)
    @Transactional
    public UnitDTO updateUnit(String uid, Long id, UnitDTO unitDTO, UserDetails userDetails) {
        checkAuth(uid, userDetails);
        UnitEntity unitEntity = unitRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("호실을 찾을 수 없습니다"));
        checkOwner(unitEntity.getBuilding(), uid);
        unitEntity.setName(unitDTO.getName());
        unitEntity.setFloor(unitDTO.getFloor());
        unitEntity.setType(unitDTO.getType());
        unitEntity.setStatus(unitDTO.getStatus());
        unitEntity.setArea(unitDTO.getArea());
        unitEntity.setTenant(unitDTO.getTenant());
        unitEntity.setDeposit(unitDTO.getDeposit());
        unitEntity.setRent(unitDTO.getRent());
        unitEntity.setManage(unitDTO.getManage());
        unitEntity.setContractStart(unitDTO.getContractStart());
        unitEntity.setContractEnd(unitDTO.getContractEnd());
        unitEntity.setMemo(unitDTO.getMemo());
        logger.info("{}번 호실 수정 완료! 요청자: {}", id, uid);
        return UnitDTO.entityToDto(unitEntity);
    }

    // 호실 삭제 (내 건물의 호실일 때만)
    @Transactional
    public UnitDTO deleteUnit(String uid, Long id, UserDetails userDetails) {
        checkAuth(uid, userDetails);
        UnitEntity unitEntity = unitRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("호실을 찾을 수 없습니다"));
        checkOwner(unitEntity.getBuilding(), uid);
        UnitDTO deleted = UnitDTO.entityToDto(unitEntity);

        // 건물 쪽 컬렉션에서도 제거 (orphanRemoval 일관성)
        BuildingEntity building = unitEntity.getBuilding();
        if (building != null) {
            building.getUnits().remove(unitEntity);
        }
        unitRepository.delete(unitEntity);
        logger.info("{}번 호실 삭제 완료! 요청자: {}", id, uid);
        return deleted;
    }
}
