package com.example.REMS.Repository;

import com.example.REMS.Entity.UserPermissionEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface UserPermissionRepository extends JpaRepository<UserPermissionEntity, Long> {
    Optional<UserPermissionEntity> findByUser_Uid(String uid);
    Optional<UserPermissionEntity> findByUser_Id(Long userId);
}
