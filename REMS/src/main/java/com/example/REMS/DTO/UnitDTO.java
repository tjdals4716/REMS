package com.example.REMS.DTO;

import com.example.REMS.Entity.UnitEntity;
import com.example.REMS.Entity.UserEntity;
import lombok.*;

@NoArgsConstructor
@AllArgsConstructor
@Getter
@Setter
@Builder
public class UnitDTO {
    private Long id;
    private Long buildingId;    // 소속 건물 id (응답용)
    private String ownerUid;    // 작성자 uid (응답 표시용, 읽기 전용)
    private int floor;
    private String name;
    private String type;
    private String status;
    private double area;
    private String tenant;
    private int deposit;
    private int rent;
    private int manage;
    private String contractStart;
    private String contractEnd;
    private String memo;
    private String dealType;    // 거래유형 (sale=매매 / jeonse=전세 / monthly=월세)

    // 등록 일시(epoch millis). 응답 표시용(읽기 전용).
    private Long createdAt;

    public static UnitDTO entityToDto(UnitEntity unitEntity) {
        return new UnitDTO(
                unitEntity.getId(),
                unitEntity.getBuilding() != null ? unitEntity.getBuilding().getId() : null,
                unitEntity.getOwner() != null ? unitEntity.getOwner().getUid() : null,
                unitEntity.getFloor(),
                unitEntity.getName(),
                unitEntity.getType(),
                unitEntity.getStatus(),
                unitEntity.getArea(),
                unitEntity.getTenant(),
                unitEntity.getDeposit(),
                unitEntity.getRent(),
                unitEntity.getManage(),
                unitEntity.getContractStart(),
                unitEntity.getContractEnd(),
                unitEntity.getMemo(),
                unitEntity.getDealType(),
                unitEntity.getCreatedAt() != null
                        ? unitEntity.getCreatedAt().atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli()
                        : null);
    }

    // 작성자(owner)를 지정하여 엔티티로 변환
    public UnitEntity dtoToEntity(UserEntity owner) {
        return UnitEntity.builder()
                .id(id)
                .owner(owner)
                .floor(floor)
                .name(name)
                .type(type)
                .status(status)
                .area(area)
                .tenant(tenant)
                .deposit(deposit)
                .rent(rent)
                .manage(manage)
                .contractStart(contractStart)
                .contractEnd(contractEnd)
                .memo(memo)
                .dealType(dealType)
                .build();
    }

    public UnitEntity dtoToEntity() {
        return dtoToEntity(null);
    }
}
