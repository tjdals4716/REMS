package com.example.REMS.Repository;

import com.example.REMS.Entity.UnitEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface UnitRepository extends JpaRepository<UnitEntity, Long> {

    // 특정 건물의 호실 전체 조회
    List<UnitEntity> findByBuildingId(Long buildingId);

    // 상태별 호실 조회 (empty/occupied/expiring)
    List<UnitEntity> findByStatus(String status);

    // 특정 건물의 상태별 호실 조회
    List<UnitEntity> findByBuildingIdAndStatus(Long buildingId, String status);
}
