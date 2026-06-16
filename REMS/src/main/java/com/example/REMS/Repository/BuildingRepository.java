package com.example.REMS.Repository;

import com.example.REMS.Entity.BuildingEntity;
import com.example.REMS.Entity.UserEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface BuildingRepository extends JpaRepository<BuildingEntity, Long> {

    // 특정 소유자의 건물 전체 (내 건물 목록)
    List<BuildingEntity> findByOwner(UserEntity owner);

    // 특정 소유자의 건물 유형별 필터
    List<BuildingEntity> findByOwnerAndType(UserEntity owner, String type);

    // 특정 소유자의 건물명 조회 (네이버 import 시 같은 건물 찾기용)
    List<BuildingEntity> findByOwnerAndName(UserEntity owner, String name);

    // 특정 소유자의 건물 중 건물명/주소 검색
    @Query("SELECT b FROM buildings b WHERE b.owner = :owner AND " +
           "(LOWER(b.name) LIKE LOWER(CONCAT('%', :keyword, '%')) OR " +
           " LOWER(b.address) LIKE LOWER(CONCAT('%', :keyword, '%')))")
    List<BuildingEntity> searchByOwner(@Param("owner") UserEntity owner, @Param("keyword") String keyword);
}
