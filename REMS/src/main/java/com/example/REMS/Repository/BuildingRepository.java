package com.example.REMS.Repository;

import com.example.REMS.Entity.BuildingEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface BuildingRepository extends JpaRepository<BuildingEntity, Long> {

    // 건물 유형별 (전체 공개 조회)
    List<BuildingEntity> findByType(String type);

    // 건물명/주소 검색 (전체 공개 조회)
    @Query("SELECT b FROM buildings b WHERE " +
           "LOWER(b.name) LIKE LOWER(CONCAT('%', :keyword, '%')) OR " +
           "LOWER(b.address) LIKE LOWER(CONCAT('%', :keyword, '%'))")
    List<BuildingEntity> searchAll(@Param("keyword") String keyword);
}
