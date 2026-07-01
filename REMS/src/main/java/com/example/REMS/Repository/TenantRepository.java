package com.example.REMS.Repository;

import com.example.REMS.Entity.TenantEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface TenantRepository extends JpaRepository<TenantEntity, Long> {
    // 작성자 본인의 계약자 목록 (최근 등록 순)
    List<TenantEntity> findByOwner_UidOrderByIdDesc(String uid);
}
